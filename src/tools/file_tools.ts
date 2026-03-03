import * as fs from 'fs/promises';
import * as path from 'path';
import { globalToolRegistry } from './registry';

// Define the root sandbox directory for all file operations
const WORKSPACE_ENV = process.env.AGENT_WORKSPACE || './agent_workspace';
// Resolve the absolute path of the sandbox directory
const BASE_DIR = path.resolve(process.cwd(), WORKSPACE_ENV);

// Maximum allowed file size for reading (e.g., 5MB) to prevent memory exhaustion
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Validates and resolves a user-provided file path against the sandbox base directory.
 * Ensures the resolved path is strictly confined within BASE_DIR.
 *
 * @param targetPath The relative or absolute path provided by the agent.
 * @returns The resolved absolute path if safe.
 * @throws Error if the path attempts to break out of the sandbox.
 */
async function resolveAndValidatePath(targetPath: string): Promise<string> {
    // Ensure base directory exists
    try {
        await fs.mkdir(BASE_DIR, { recursive: true });
    } catch (err: any) {
        // Ignore if exists
    }

    // 1. Sanitize the path:
    // Remove leading slashes so path.join treats it as relative to BASE_DIR, preventing absolute overriding
    const sanitizedInput = targetPath.replace(/^[\\/]+/, "");

    // 2. Resolve to absolute path securely
    const resolvedPath = path.resolve(BASE_DIR, path.normalize(sanitizedInput));

    // 3. Strict Boundary Enforcement
    if (!resolvedPath.startsWith(BASE_DIR)) {
        throw new Error(`Access denied. Path is outside the designated workspace sandbox.`);
    }

    return resolvedPath;
}

// ==========================================
// Tool: list_files
// ==========================================
globalToolRegistry.register({
    name: 'list_files',
    description: 'Lists files and folders within a specified directory inside the secure workspace sandbox. Returns an array of file/folder names.',
    parameters: {
        type: 'object',
        properties: {
            targetDir: {
                type: 'string',
                description: 'The directory path to list, relative to the workspace root. Use "." or "" for the root.'
            }
        },
        required: ['targetDir']
    },
    execute: async (args: { targetDir: string }) => {
        try {
            const dirPath = args.targetDir || '.';
            const safePath = await resolveAndValidatePath(dirPath);

            const stats = await fs.stat(safePath);
            if (!stats.isDirectory()) {
                return { status: 'error', message: `Path is not a directory: ${dirPath}` };
            }

            const entries = await fs.readdir(safePath, { withFileTypes: true });

            const files = entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file'
            }));

            return { status: 'success', path: dirPath, contents: files };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return { status: 'error', message: `Directory not found.` };
            }
            return { status: 'error', message: error.message };
        }
    }
});

// ==========================================
// Tool: read_file
// ==========================================
globalToolRegistry.register({
    name: 'read_file',
    description: 'Reads and returns the text contents of a specified file within the secure workspace sandbox. Has a strict size limit.',
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The path of the file to read, relative to the workspace root.'
            }
        },
        required: ['filePath']
    },
    execute: async (args: { filePath: string }) => {
        try {
            const safePath = await resolveAndValidatePath(args.filePath);

            // Check file existence and size
            const stats = await fs.stat(safePath);
            if (stats.isDirectory()) {
                return { status: 'error', message: `Target is a directory, not a file.` };
            }

            if (stats.size > MAX_FILE_SIZE_BYTES) {
                return { status: 'error', message: `File size exceeds the maximum allowed limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` };
            }

            const content = await fs.readFile(safePath, 'utf8');
            return { status: 'success', filePath: args.filePath, content };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return { status: 'error', message: `File not found.` };
            }
            return { status: 'error', message: error.message };
        }
    }
});

// ==========================================
// Tool: write_file
// ==========================================
globalToolRegistry.register({
    name: 'write_file',
    description: 'Creates a new file or overwrites an existing file with the provided content inside the secure workspace sandbox.',
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The path of the file to write, relative to the workspace root.'
            },
            content: {
                type: 'string',
                description: 'The text content to write into the file.'
            }
        },
        required: ['filePath', 'content']
    },
    execute: async (args: { filePath: string; content: string }) => {
        try {
            const safePath = await resolveAndValidatePath(args.filePath);

            // Ensure parent directory exists
            const parentDir = path.dirname(safePath);
            await fs.mkdir(parentDir, { recursive: true });

            await fs.writeFile(safePath, args.content, 'utf8');
            return { status: 'success', message: `File successfully written to ${args.filePath}` };
        } catch (error: any) {
            return { status: 'error', message: error.message };
        }
    }
});

// ==========================================
// Tool: delete_file
// ==========================================
globalToolRegistry.register({
    name: 'delete_file',
    description: 'Deletes a specific file within the secure workspace sandbox. Will fail if the target is a directory.',
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The path of the file to delete, relative to the workspace root.'
            }
        },
        required: ['filePath']
    },
    execute: async (args: { filePath: string }) => {
        try {
            const safePath = await resolveAndValidatePath(args.filePath);

            // Check existence and verify it's a file, not a directory
            const stats = await fs.stat(safePath);
            if (stats.isDirectory()) {
                return { status: 'error', message: `Target is a directory. Use a directory deletion tool if authorized, or specify a file.` };
            }

            await fs.unlink(safePath);
            return { status: 'success', message: `File ${args.filePath} successfully deleted.` };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return { status: 'error', message: `File not found.` };
            }
            return { status: 'error', message: error.message };
        }
    }
});
