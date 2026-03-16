import Database from "better-sqlite3";
import * as path from "path";
import OpenAI from "openai";
import "dotenv/config";
import { Mutex } from "async-mutex";

const DB_PATH = path.resolve(process.cwd(), "echoclaw_memory_index.db");

export interface IndexedChunk {
  id?: number;
  file: string;
  chunk: string;
  embedding?: number[];
  line_start?: number;
  line_end?: number;
  indexed_at: string;
}

export class MemoryIndex {
  private db: Database.Database;
  private openai: OpenAI;
  private readonly EMBEDDING_MODEL = "text-embedding-3-small";
  private readonly EMBEDDING_DIMENSIONS = 1536;
  private fileLocks: Map<string, Mutex> = new Map();

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma("foreign_keys = ON");
    console.log(
      "[MemoryIndex] OPENAI_API_KEY:",
      process.env.OPENAI_API_KEY ? "set" : "not set",
    );
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });
    this.init();
  }

  private init() {
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS memory_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file TEXT NOT NULL,
                chunk TEXT NOT NULL,
                line_start INTEGER,
                line_end INTEGER,
                indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_file ON memory_chunks(file);
        `);

    this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                chunk,
                file,
                content='memory_chunks',
                content_rowid='id'
            );
        `);

    this.db.exec(`
            CREATE TABLE IF NOT EXISTS memory_embeddings (
                chunk_id INTEGER PRIMARY KEY,
                embedding BLOB NOT NULL,
                FOREIGN KEY (chunk_id) REFERENCES memory_chunks(id) ON DELETE CASCADE
            );
        `);

    this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_chunks BEGIN
                INSERT INTO memory_fts(rowid, chunk, file) VALUES (new.id, new.chunk, new.file);
            END;

            CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_chunks BEGIN
                INSERT INTO memory_fts(memory_fts, rowid, chunk, file) VALUES('delete', old.id, old.chunk, old.file);
            END;

            CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_chunks BEGIN
                INSERT INTO memory_fts(memory_fts, rowid, chunk, file) VALUES('delete', old.id, old.chunk, old.file);
                INSERT INTO memory_fts(rowid, chunk, file) VALUES (new.id, new.chunk, new.file);
            END;
        `);
  }

  private getFileLock(file: string): Mutex {
    if (!this.fileLocks.has(file)) {
      this.fileLocks.set(file, new Mutex());
    }
    return this.fileLocks.get(file)!;
  }

  async indexChunk(
    file: string,
    chunk: string,
    lineStart?: number,
    lineEnd?: number,
  ): Promise<number> {
    const stmt = this.db.prepare(`
            INSERT INTO memory_chunks (file, chunk, line_start, line_end)
            VALUES (?, ?, ?, ?)
        `);
    const result = stmt.run(file, chunk, lineStart || null, lineEnd || null);
    const chunkId = result.lastInsertRowid as number;

    try {
      const embedding = await this.generateEmbedding(chunk);
      await this.storeEmbedding(chunkId, embedding);
    } catch (e) {
      console.warn(
        `[MemoryIndex] Failed to generate embedding for chunk ${chunkId}:`,
        e,
      );
    }

    return chunkId;
  }

  async indexFile(file: string, content: string): Promise<void> {
    const lock = this.getFileLock(file);
    return lock.runExclusive(() => this._indexFile(file, content));
  }

  private async _indexFile(file: string, content: string): Promise<void> {
    this.clearFile(file);

    const lines = content.split("\n");
    const chunks: { text: string; start: number; end: number }[] = [];

    let currentChunk = "";
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk += line + "\n";

      if (line.startsWith("## ") || currentChunk.length > 500) {
        chunks.push({
          text: currentChunk.trim(),
          start: startLine,
          end: i + 1,
        });
        currentChunk = "";
        startLine = i + 2;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        start: startLine,
        end: lines.length,
      });
    }

    for (const chunk of chunks) {
      await this.indexChunk(file, chunk.text, chunk.start, chunk.end);
    }
  }

  clearFile(file: string) {
    // CASCADE delete will automatically remove related memory_embeddings rows
    this.db.prepare("DELETE FROM memory_chunks WHERE file = ?").run(file);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: text,
        encoding_format: "float",
        dimensions: this.EMBEDDING_DIMENSIONS,
      });
      return response.data[0].embedding;
    } catch (e: any) {
      console.warn(`[MemoryIndex] OpenAI embedding failed: ${e.message}`);
      return new Array(this.EMBEDDING_DIMENSIONS).fill(0);
    }
  }

  private async storeEmbedding(chunkId: number, embedding: number[]) {
    const buffer = Buffer.from(new Float32Array(embedding));
    this.db
      .prepare(
        "INSERT OR REPLACE INTO memory_embeddings (chunk_id, embedding) VALUES (?, ?)",
      )
      .run(chunkId, buffer);
  }

  private getEmbedding(chunkId: number): number[] | null {
    const row = this.db
      .prepare("SELECT embedding FROM memory_embeddings WHERE chunk_id = ?")
      .get(chunkId) as { embedding: Buffer } | undefined;
    if (!row) return null;
    return Array.from(
      new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        this.EMBEDDING_DIMENSIONS,
      ),
    );
  }

  async searchByKeyword(query: string, limit = 10): Promise<IndexedChunk[]> {
    const stmt = this.db.prepare(`
            SELECT mc.* FROM memory_chunks mc
            JOIN memory_fts fts ON mc.id = fts.rowid
            WHERE memory_fts MATCH ?
            ORDER BY bm25(memory_fts)
            LIMIT ?
        `);
    return stmt.all(query, limit) as IndexedChunk[];
  }

  async searchByVector(
    query: string,
    limit = 10,
  ): Promise<{ chunk: IndexedChunk; score: number }[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const chunks = this.db
      .prepare(
        "SELECT id, file, chunk, line_start, line_end, indexed_at FROM memory_chunks",
      )
      .all() as IndexedChunk[];

    const results: { chunk: IndexedChunk; score: number }[] = [];

    for (const chunk of chunks) {
      const storedEmbedding = this.getEmbedding(chunk.id!);
      if (storedEmbedding) {
        const score = this.cosineSimilarity(queryEmbedding, storedEmbedding);
        results.push({ chunk, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async hybridSearch(
    query: string,
    limit = 10,
  ): Promise<
    {
      chunk: IndexedChunk;
      keywordScore: number;
      vectorScore: number;
      combinedScore: number;
    }[]
  > {
    const keywordResults = await this.searchByKeyword(query, limit * 2);
    const vectorResults = await this.searchByVector(query, limit * 2);

    const keywordMap = new Map(
      keywordResults.map((c, i) => [c.id, 1 / (i + 1)]),
    );
    const vectorMap = new Map(vectorResults.map((v) => [v.chunk.id, v.score]));

    const combined = new Map<
      number,
      { chunk: IndexedChunk; keywordScore: number; vectorScore: number }
    >();

    for (const chunk of keywordResults) {
      combined.set(chunk.id!, {
        chunk,
        keywordScore: keywordMap.get(chunk.id!) || 0,
        vectorScore: 0,
      });
    }

    for (const { chunk, score } of vectorResults) {
      if (combined.has(chunk.id!)) {
        combined.get(chunk.id!)!.vectorScore = score;
      } else {
        combined.set(chunk.id!, { chunk, keywordScore: 0, vectorScore: score });
      }
    }

    const results = Array.from(combined.values()).map(
      ({ chunk, keywordScore, vectorScore }) => ({
        chunk,
        keywordScore,
        vectorScore,
        combinedScore: keywordScore * 0.5 + vectorScore * 0.5,
      }),
    );

    results.sort((a, b) => b.combinedScore - a.combinedScore);
    return results.slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async reindexAll(files: { file: string; content: string }[]) {
    for (const { file, content } of files) {
      try {
        await this.indexFile(file, content);
      } catch (e) {
        console.error(`[MemoryIndex] Failed to index ${file}:`, e);
      }
    }
  }
}

export const memoryIndex = new MemoryIndex();
