import { memoryIndex, IndexedChunk } from './MemoryIndex';

export interface SearchResult {
    file: string;
    chunk: string;
    lineStart?: number;
    lineEnd?: number;
    score: number;
    matchType: 'keyword' | 'vector' | 'hybrid';
}

export interface SearchOptions {
    limit?: number;
    files?: string[];
    matchType?: 'keyword' | 'vector' | 'hybrid';
}

export class SearchEngine {
    async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
        const { limit = 10, matchType = 'hybrid' } = options;
        
        let results: { chunk: IndexedChunk; keywordScore?: number; vectorScore?: number; combinedScore?: number }[];
        
        if (matchType === 'keyword') {
            const keywordResults = await memoryIndex.searchByKeyword(query, limit);
            results = keywordResults.map(c => ({ chunk: c, keywordScore: 1 }));
        } else if (matchType === 'vector') {
            const vectorResults = await memoryIndex.searchByVector(query, limit);
            results = vectorResults.map(v => ({ chunk: v.chunk, vectorScore: v.score }));
        } else {
            results = await memoryIndex.hybridSearch(query, limit);
        }
        
        return results.map(r => ({
            file: r.chunk.file,
            chunk: r.chunk.chunk,
            lineStart: r.chunk.line_start || undefined,
            lineEnd: r.chunk.line_end || undefined,
            score: r.combinedScore || r.keywordScore || r.vectorScore || 0,
            matchType: matchType === 'hybrid' ? 'hybrid' : matchType
        }));
    }

    async searchWithContext(query: string, contextLines = 3): Promise<SearchResult[]> {
        const results = await this.search(query);
        
        return results.map(r => {
            const lines = r.chunk.split('\n');
            const contextStart = Math.max(0, 0 - contextLines);
            const contextEnd = Math.min(lines.length, contextLines);
            
            return {
                ...r,
                chunk: lines.slice(contextStart, contextEnd).join('\n')
            };
        });
    }
}

export const searchEngine = new SearchEngine();
