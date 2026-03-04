import { registerTool } from "./registry.js";
import {
    fileRead,
    fileWrite,
    fileDelete,
    fileMove,
    fileCopy,
    fileList,
    fileStat,
    fileSearch,
    fileMkdir,
    getAllowedDirectories,
} from "../services/fileManager.js";

registerTool({
    name: "file_read",
    description:
        "Read the contents of a file. " +
        "For binary files, returns base64 encoded content. " +
        "For large files (over 1MB), returns truncated preview with note about full size.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to the file to read (relative to allowed directories or absolute)",
            },
            encoding: {
                type: "string",
                description: "File encoding (default: utf-8)",
            },
        },
        required: ["path"],
    },
    execute: async (input) => {
        const filePath = input.path as string;
        const encoding = (input.encoding as string) || "utf-8";

        const result = await fileRead(filePath, encoding);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_write",
    description:
        "Create or overwrite a file with the given content. " +
        "Creates parent directories automatically if they don't exist. " +
        "Use append=true to append to existing files.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path where to create the file",
            },
            content: {
                type: "string",
                description: "Content to write to the file",
            },
            encoding: {
                type: "string",
                description: "File encoding (default: utf-8)",
            },
            append: {
                type: "boolean",
                description: "Append to file instead of overwriting (default: false)",
            },
        },
        required: ["path", "content"],
    },
    execute: async (input) => {
        const filePath = input.path as string;
        const content = input.content as string;
        const encoding = (input.encoding as string) || "utf-8";
        const append = (input.append as boolean) || false;

        const result = await fileWrite(filePath, content, encoding, append);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_delete",
    description:
        "Delete a file or directory. " +
        "For directories, must use recursive=true to delete non-empty directories.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to the file or directory to delete",
            },
            recursive: {
                type: "boolean",
                description: "Delete directories recursively (default: false)",
            },
        },
        required: ["path"],
    },
    execute: async (input) => {
        const filePath = input.path as string;
        const recursive = (input.recursive as boolean) || false;

        const result = await fileDelete(filePath, recursive);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_move",
    description: "Move or rename a file or directory to a new location.",
    inputSchema: {
        type: "object" as const,
        properties: {
            source: {
                type: "string",
                description: "Source path of the file or directory to move",
            },
            destination: {
                type: "string",
                description: "Destination path where to move the file/directory",
            },
        },
        required: ["source", "destination"],
    },
    execute: async (input) => {
        const source = input.source as string;
        const destination = input.destination as string;

        const result = await fileMove(source, destination);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_copy",
    description:
        "Copy a file or directory to a new location. " +
        "For directories, must use recursive=true.",
    inputSchema: {
        type: "object" as const,
        properties: {
            source: {
                type: "string",
                description: "Source path of the file or directory to copy",
            },
            destination: {
                type: "string",
                description: "Destination path where to copy the file/directory",
            },
            recursive: {
                type: "boolean",
                description: "Copy directories recursively (default: false)",
            },
        },
        required: ["source", "destination"],
    },
    execute: async (input) => {
        const source = input.source as string;
        const destination = input.destination as string;
        const recursive = (input.recursive as boolean) || false;

        const result = await fileCopy(source, destination, recursive);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_list",
    description:
        "List contents of a directory. " +
        "Returns file names, sizes, and modified dates. " +
        "Use recursive=true to list subdirectories. " +
        "Use pattern for glob-style filtering (e.g., '*.ts').",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to the directory to list",
            },
            recursive: {
                type: "boolean",
                description: "List subdirectories recursively (default: false)",
            },
            pattern: {
                type: "string",
                description: "Glob pattern to filter files (e.g., '*.ts', '*.js')",
            },
        },
        required: ["path"],
    },
    execute: async (input) => {
        const dirPath = input.path as string;
        const recursive = (input.recursive as boolean) || false;
        const pattern = input.pattern as string | undefined;

        const result = await fileList(dirPath, recursive, pattern);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_stat",
    description:
        "Get metadata about a file or directory - size, created date, modified date, type, and permissions.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to the file or directory",
            },
        },
        required: ["path"],
    },
    execute: async (input) => {
        const filePath = input.path as string;

        const result = await fileStat(filePath);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_search",
    description:
        "Search for text content within files in a directory. " +
        "Returns matching file paths and line numbers with context. " +
        "Use file_pattern to limit which files are searched (e.g., '*.ts').",
    inputSchema: {
        type: "object" as const,
        properties: {
            directory: {
                type: "string",
                description: "Directory to search in",
            },
            query: {
                type: "string",
                description: "Text to search for in file contents",
            },
            file_pattern: {
                type: "string",
                description: "Glob pattern to filter which files to search (e.g., '*.ts', '*.js')",
            },
        },
        required: ["directory", "query"],
    },
    execute: async (input) => {
        const directory = input.directory as string;
        const query = input.query as string;
        const filePattern = input.file_pattern as string | undefined;

        const result = await fileSearch(directory, query, filePattern);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_mkdir",
    description:
        "Create a new directory. " +
        "Creates parent directories automatically if they don't exist.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path of the directory to create",
            },
        },
        required: ["path"],
    },
    execute: async (input) => {
        const dirPath = input.path as string;

        const result = await fileMkdir(dirPath);
        return JSON.stringify(result);
    },
});

registerTool({
    name: "file_get_allowed_dirs",
    description:
        "Get the list of directories that the agent is allowed to access for file operations.",
    inputSchema: {
        type: "object" as const,
        properties: {},
    },
    execute: async () => {
        const dirs = getAllowedDirectories();
        return JSON.stringify({ success: true, directories: dirs });
    },
});
