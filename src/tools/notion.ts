/**
 * tools/notion.ts — Notion tools for the agentic loop.
 *
 * Tools for interacting with Notion workspace via the Notion API.
 */

import { registerTool } from "./registry.js";
import { NOTION_API_KEY } from "../config.js";
import { logger } from "../logger.js";

const notion = {
    Client: class {
        private apiKey: string;
        constructor(apiKey: string) {
            this.apiKey = apiKey;
        }
        private async request(endpoint: string, body?: any): Promise<any> {
            const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Notion API error: ${JSON.stringify(error)}`);
            }
            return response.json();
        }
        pages = {
            retrieve: (pageId: string) => this.request(`/pages/${pageId}`),
            create: (body: any) => this.request("/pages", body),
            update: (pageId: string, body: any) => this.request(`/pages/${pageId}`, body),
        };
        databases = {
            query: (databaseId: string, body?: any) => this.request(`/databases/${databaseId}/query`, body),
            retrieve: (databaseId: string) => this.request(`/databases/${databaseId}`),
            list: () => this.request("/databases"),
        };
    },
};

const notionClient = NOTION_API_KEY ? new notion.Client(NOTION_API_KEY) : null;

function hasNotionConfig(): boolean {
    return !!NOTION_API_KEY;
}

function formatPageContent(page: any): string {
    const props = page.properties || {};
    let output = `📄 **${page.id}**\n`;
    
    for (const [key, prop] of Object.entries(props)) {
        const propObj = prop as any;
        if (propObj.type === "title" && propObj.title?.[0]?.plain_text) {
            output = `📄 **${propObj.title[0].plain_text}**\n`;
        } else if (propObj.type === "rich_text" && propObj.rich_text?.[0]?.plain_text) {
            output += `• ${key}: ${propObj.rich_text[0].plain_text}\n`;
        } else if (propObj.type === "select" && propObj.select?.name) {
            output += `• ${key}: ${propObj.select.name}\n`;
        } else if (propObj.type === "multi_select") {
            const tags = propObj.multi_select?.map((s: any) => s.name).join(", ") || "";
            if (tags) output += `• ${key}: ${tags}\n`;
        } else if (propObj.type === "date" && propObj.date?.start) {
            output += `• ${key}: ${propObj.date.start}\n`;
        } else if (propObj.type === "checkbox") {
            output += `• ${key}: ${propObj.checkbox ? "☑️" : "⬜"}\n`;
        }
    }
    
    if (page.url) output += `\n🔗 ${page.url}`;
    return output;
}

function formatDatabaseContent(database: any): string {
    let output = `🗄️ **Database: ${database.title?.[0]?.plain_text || database.id}**\n`;
    
    if (database.description?.[0]?.plain_text) {
        output += `${database.description[0].plain_text}\n`;
    }
    
    output += "\nProperties:\n";
    for (const [key, prop] of Object.entries(database.properties || {})) {
        const propObj = prop as any;
        output += `• ${key}: ${propObj.type}`;
        if (propObj.type === "select" && propObj.select?.options) {
            const options = propObj.select.options.map((o: any) => o.name).join(", ");
            output += ` [${options}]`;
        }
        output += "\n";
    }
    
    if (database.url) output += `\n🔗 ${database.url}`;
    return output;
}

registerTool({
    name: "notion_get_page",
    description: "Retrieve a Notion page by its ID. Use this to read the contents of a specific page.",
    inputSchema: {
        type: "object" as const,
        properties: {
            page_id: {
                type: "string",
                description: "The Notion page ID (32 characters, alphanumeric with hyphens)",
            },
        },
        required: ["page_id"],
    },
    execute: async (input) => {
        if (!hasNotionConfig()) {
            return JSON.stringify({ success: false, error: "Notion API key not configured. Add NOTION_API_KEY to .env" });
        }
        
        const pageId = input.page_id as string;
        
        try {
            const page = await notionClient!.pages.retrieve(pageId);
            const formatted = formatPageContent(page);
            
            return JSON.stringify({
                success: true,
                page: {
                    id: page.id,
                    created_time: page.created_time,
                    last_edited_time: page.last_edited_time,
                    url: page.url,
                },
                formatted,
            });
        } catch (err) {
            logger.error("notion", "Failed to get page", { error: String(err), pageId });
            return JSON.stringify({ success: false, error: String(err) });
        }
    },
});

registerTool({
    name: "notion_create_page",
    description: "Create a new Notion page. Use this when the user wants to create a new page in Notion.",
    inputSchema: {
        type: "object" as const,
        properties: {
            parent: {
                type: "string",
                description: "Parent page ID or database ID (for database pages)",
            },
            title: {
                type: "string",
                description: "Title of the new page",
            },
            content: {
                type: "string",
                description: "Optional content for the page (as blocks)",
            },
            database_id: {
                type: "string",
                description: "If creating a page in a database, specify the database ID",
            },
            properties: {
                type: "object",
                description: "Additional properties for database pages (as key-value pairs)",
            },
        },
        required: ["parent", "title"],
    },
    execute: async (input) => {
        if (!hasNotionConfig()) {
            return JSON.stringify({ success: false, error: "Notion API key not configured. Add NOTION_API_KEY to .env" });
        }
        
        const parent = input.parent as string;
        const title = input.title as string;
        const content = input.content as string | undefined;
        const databaseId = input.database_id as string | undefined;
        const customProps = input.properties as Record<string, any> | undefined;
        
        try {
            const pageBody: any = {
                parent: databaseId ? { database_id: databaseId } : { page_id: parent },
            };
            
            if (databaseId && customProps) {
                pageBody.properties = customProps;
            } else {
                pageBody.properties = {
                    title: {
                        title: [{ text: { content: title } }],
                    },
                };
            }
            
            if (content) {
                pageBody.children = [
                    {
                        object: "block",
                        type: "paragraph",
                        paragraph: {
                            rich_text: [{ text: { content } }],
                        },
                    },
                ];
            }
            
            const page = await notionClient!.pages.create(pageBody);
            
            return JSON.stringify({
                success: true,
                page: {
                    id: page.id,
                    url: page.url,
                },
                message: `Created page: ${page.url}`,
            });
        } catch (err) {
            logger.error("notion", "Failed to create page", { error: String(err) });
            return JSON.stringify({ success: false, error: String(err) });
        }
    },
});

registerTool({
    name: "notion_update_page",
    description: "Update an existing Notion page. Use this to modify page properties or content.",
    inputSchema: {
        type: "object" as const,
        properties: {
            page_id: {
                type: "string",
                description: "The Notion page ID to update",
            },
            properties: {
                type: "object",
                description: "Properties to update (as key-value pairs matching the schema)",
            },
        },
        required: ["page_id", "properties"],
    },
    execute: async (input) => {
        if (!hasNotionConfig()) {
            return JSON.stringify({ success: false, error: "Notion API key not configured. Add NOTION_API_KEY to .env" });
        }
        
        const pageId = input.page_id as string;
        const properties = input.properties as Record<string, any>;
        
        try {
            const page = await notionClient!.pages.update(pageId, { properties });
            
            return JSON.stringify({
                success: true,
                page: {
                    id: page.id,
                    url: page.url,
                },
                message: `Updated page: ${page.url}`,
            });
        } catch (err) {
            logger.error("notion", "Failed to update page", { error: String(err), pageId });
            return JSON.stringify({ success: false, error: String(err) });
        }
    },
});

registerTool({
    name: "notion_query_database",
    description: "Query a Notion database to find pages that match filter criteria.",
    inputSchema: {
        type: "object" as const,
        properties: {
            database_id: {
                type: "string",
                description: "The Notion database ID to query",
            },
            filter: {
                type: "object",
                description: "Optional filter object (e.g., { property: 'Status', select: { equals: 'Done' } })",
            },
            sorts: {
                type: "object",
                description: "Optional sort configuration",
            },
            page_size: {
                type: "number",
                description: "Number of results to return (default 100)",
            },
        },
        required: ["database_id"],
    },
    execute: async (input) => {
        if (!hasNotionConfig()) {
            return JSON.stringify({ success: false, error: "Notion API key not configured. Add NOTION_API_KEY to .env" });
        }
        
        const databaseId = input.database_id as string;
        const filter = input.filter as any;
        const sorts = input.sorts as any;
        const pageSize = input.page_size as number || 100;
        
        try {
            const body: any = { page_size: pageSize };
            if (filter) body.filter = filter;
            if (sorts) body.sorts = sorts;
            
            const result = await notionClient!.databases.query(databaseId, body);
            
            const pages = result.results.map((page: any) => {
                let title = page.id;
                if (page.properties?.title?.title?.[0]?.plain_text) {
                    title = page.properties.title.title[0].plain_text;
                } else if (page.properties?.Name?.title?.[0]?.plain_text) {
                    title = page.properties.Name.title[0].plain_text;
                }
                return {
                    id: page.id,
                    title,
                    url: page.url,
                    last_edited_time: page.last_edited_time,
                };
            });
            
            const display = pages.map((p: any) => `• ${p.title} (${p.id})`).join("\n");
            
            return JSON.stringify({
                success: true,
                count: pages.length,
                pages,
                display: display || "No pages found",
            });
        } catch (err) {
            logger.error("notion", "Failed to query database", { error: String(err), databaseId });
            return JSON.stringify({ success: false, error: String(err) });
        }
    },
});

registerTool({
    name: "notion_list_databases",
    description: "List all databases the bot has access to in the Notion workspace.",
    inputSchema: {
        type: "object" as const,
        properties: {},
    },
    execute: async () => {
        if (!hasNotionConfig()) {
            return JSON.stringify({ success: false, error: "Notion API key not configured. Add NOTION_API_KEY to .env" });
        }
        
        try {
            const result = await notionClient!.databases.list();
            
            const databases = result.results.map((db: any) => ({
                id: db.id,
                title: db.title?.[0]?.plain_text || "Untitled",
                url: db.url,
            }));
            
            const display = databases.map((d: any) => `• ${d.title} (${d.id})`).join("\n");
            
            return JSON.stringify({
                success: true,
                count: databases.length,
                databases,
                display: display || "No databases found",
            });
        } catch (err) {
            logger.error("notion", "Failed to list databases", { error: String(err) });
            return JSON.stringify({ success: false, error: String(err) });
        }
    },
});
