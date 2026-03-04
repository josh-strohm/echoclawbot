import { registerTool } from "./registry.js";
import { logger } from "../logger.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function runQmdCommand(args: string): Promise<string> {
    try {
        const { stdout, stderr } = await execAsync(`qmd ${args}`, { timeout: 60000 });
        if (stderr && !stderr.includes("Warning")) {
            logger.warn("qmd", "stderr output", { stderr });
        }
        return stdout.trim();
    } catch (err: any) {
        if (err.stdout) {
            return err.stdout.trim();
        }
        throw new Error(`QMD error: ${err.message}`);
    }
}

registerTool({
    name: "qmd_search",
    description:
        "Search your local documents using QMD (Query Markup Documents). " +
        "Use this to find information in your personal documents, notes, and files. " +
        "Searches markdown files in your Documents and Desktop folders. " +
        "Supports keyword search (fast), semantic search (meaning), and hybrid search (best quality).",
    inputSchema: {
        type: "object" as const,
        properties: {
            query: {
                type: "string",
                description: "What to search for in your documents",
            },
            mode: {
                type: "string",
                enum: ["search", "vsearch", "query"],
                description: "Search mode: 'search' (keyword/BM25), 'vsearch' (semantic/vector), 'query' (hybrid with reranking - best quality)",
                default: "query",
            },
            collection: {
                type: "string",
                enum: ["documents", "desktop", "all"],
                description: "Which collection to search: 'documents', 'desktop', or 'all' (default)",
                default: "all",
            },
            limit: {
                type: "number",
                description: "Max number of results (default 5)",
                default: 5,
            },
        },
        required: ["query"],
    },
    execute: async (input) => {
        const query = input.query as string;
        const mode = (input.mode as string) || "query";
        const collection = (input.collection as string) || "all";
        const limit = (input.limit as number) || 5;

        try {
            let cmd = `${mode} "${query}" -n ${limit}`;
            
            if (collection !== "all") {
                cmd += ` -c ${collection}`;
            }

            cmd += " --json";

            const result = await runQmdCommand(cmd);
            
            if (!result) {
                return JSON.stringify({
                    found: false,
                    message: "No results found",
                });
            }

            let parsed = JSON.parse(result);
            
            if (!Array.isArray(parsed)) {
                parsed = [parsed];
            }

            const results = parsed.slice(0, limit).map((item: any) => ({
                path: item.path || item.file,
                title: item.title,
                score: item.score,
                snippet: item.snippet || item.preview,
                docid: item.docid,
            }));

            return JSON.stringify({
                found: true,
                count: results.length,
                results,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("qmd", "Search failed", { error: errorMsg });
            return JSON.stringify({
                found: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "qmd_get",
    description:
        "Get the full content of a specific document from QMD. " +
        "Use this after finding a document with qmd_search to read its full content. " +
        "You can provide either the file path or the docid (e.g., '#abc123').",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "The document path (e.g., 'notes/meeting.md') or docid (e.g., '#abc123')",
            },
            collection: {
                type: "string",
                enum: ["documents", "desktop"],
                description: "Which collection the document is in",
            },
            max_lines: {
                type: "number",
                description: "Max lines to return (default 100)",
                default: 100,
            },
        },
        required: ["path"],
    },
    execute: async (input) => {
        const path = input.path as string;
        const collection = input.collection as string | undefined;
        const maxLines = (input.max_lines as number) || 100;

        try {
            let cmd = `get "${path}" -l ${maxLines} --json`;
            
            if (collection) {
                cmd += ` -c ${collection}`;
            }

            const result = await runQmdCommand(cmd);
            
            if (!result) {
                return JSON.stringify({
                    found: false,
                    error: "Document not found",
                });
            }

            let parsed = JSON.parse(result);
            
            return JSON.stringify({
                found: true,
                path: parsed.path || parsed.file,
                title: parsed.title,
                content: parsed.content || parsed.text,
                docid: parsed.docid,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("qmd", "Get document failed", { error: errorMsg });
            return JSON.stringify({
                found: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "qmd_list_collections",
    description:
        "List all QMD document collections and their status. " +
        "Use this to see what document collections are available for searching.",
    inputSchema: {
        type: "object" as const,
        properties: {},
    },
    execute: async () => {
        try {
            const result = await runQmdCommand("collection list --json");
            
            if (!result) {
                return JSON.stringify({
                    collections: [],
                });
            }

            const parsed = JSON.parse(result);
            
            return JSON.stringify({
                collections: Array.isArray(parsed) ? parsed : [parsed],
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("qmd", "List collections failed", { error: errorMsg });
            return JSON.stringify({
                error: errorMsg,
            });
        }
    },
});
