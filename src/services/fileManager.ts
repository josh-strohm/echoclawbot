import fs from "fs/promises";
import path from "path";
import { FILE_BASE_DIR, FILE_ALLOWED_DIRS, FILE_MAX_READ_SIZE } from "../config.js";
import { logFileOperation, migrateFileOperations } from "../db/fileOperations.js";
import { logger } from "../logger.js";

export interface FileStat {
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    isFile: boolean;
    isSymlink: boolean;
    created: string;
    modified: string;
    accessed: string;
}

export interface FileListItem {
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    modified: string;
}

export interface FileSearchResult {
    file: string;
    line: number;
    content: string;
}

function resolveUserPath(userPath: string): string {
    if (!userPath) return "";
    
    let resolved = userPath.replace(/~/g, process.env.HOME || process.env.USERPROFILE || "");
    resolved = resolved.replace(/\//g, path.sep);
    
    return path.resolve(resolved);
}

function isPathInDirectory(targetPath: string, allowedDir: string): boolean {
    const normalizedTarget = path.normalize(targetPath).toLowerCase();
    const normalizedDir = path.normalize(allowedDir).toLowerCase();
    return normalizedTarget.startsWith(normalizedDir + path.sep) || normalizedTarget === normalizedDir;
}

export function isPathAllowed(filePath: string): { allowed: boolean; resolvedPath: string; error?: string } {
    const resolvedPath = resolveUserPath(filePath);
    
    const allAllowedDirs = [FILE_BASE_DIR, ...FILE_ALLOWED_DIRS];
    
    for (const allowedDir of allAllowedDirs) {
        if (isPathInDirectory(resolvedPath, allowedDir)) {
            return { allowed: true, resolvedPath };
        }
    }
    
    return { 
        allowed: false, 
        resolvedPath, 
        error: `Path "${filePath}" is outside allowed directories. Allowed: ${allAllowedDirs.join(", ")}` 
    };
}

export async function fileRead(filePath: string, encoding: string = "utf-8"): Promise<{
    success: boolean;
    truncated?: boolean;
    content?: string;
    size?: number;
    error?: string;
}> {
    migrateFileOperations();
    
    const validation = isPathAllowed(filePath);
    if (!validation.allowed) {
        logFileOperation("file_read", filePath, "failed", undefined, validation.error);
        return { success: false, error: validation.error };
    }
    
    try {
        const stats = await fs.stat(validation.resolvedPath);
        
        if (stats.isDirectory()) {
            logFileOperation("file_read", filePath, "failed", undefined, "Path is a directory");
            return { success: false, error: "Cannot read a directory. Use file_list instead." };
        }
        
        const size = stats.size;
        
        if (size > FILE_MAX_READ_SIZE) {
            const buffer = await fs.readFile(validation.resolvedPath);
            const truncatedContent = buffer.toString("base64");
            logFileOperation("file_read", filePath, "success");
            return { 
                success: true, 
                content: truncatedContent, 
                truncated: true, 
                size 
            };
        }
        
        const content = await fs.readFile(validation.resolvedPath, encoding as BufferEncoding);
        logFileOperation("file_read", filePath, "success");
        
        return { success: true, content, size };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_read", filePath, "failed", undefined, errorMessage);
        
        if (errorMessage.includes("ENOENT")) {
            return { success: false, error: `File not found: ${filePath}` };
        }
        if (errorMessage.includes("EACCES")) {
            return { success: false, error: `Permission denied: ${filePath}` };
        }
        return { success: false, error: `Failed to read file: ${errorMessage}` };
    }
}

export async function fileWrite(
    filePath: string, 
    content: string, 
    encoding: string = "utf-8",
    append: boolean = false
): Promise<{ success: boolean; error?: string }> {
    migrateFileOperations();
    
    const validation = isPathAllowed(filePath);
    if (!validation.allowed) {
        logFileOperation("file_write", filePath, "failed", undefined, validation.error);
        return { success: false, error: validation.error };
    }
    
    try {
        const dir = path.dirname(validation.resolvedPath);
        await fs.mkdir(dir, { recursive: true });
        
        if (append) {
            await fs.appendFile(validation.resolvedPath, content, encoding as BufferEncoding);
        } else {
            await fs.writeFile(validation.resolvedPath, content, encoding as BufferEncoding);
        }
        
        logFileOperation("file_write", filePath, "success");
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_write", filePath, "failed", undefined, errorMessage);
        
        if (errorMessage.includes("EACCES")) {
            return { success: false, error: `Permission denied: ${filePath}` };
        }
        if (errorMessage.includes("ENOSPC")) {
            return { success: false, error: "Disk full" };
        }
        return { success: false, error: `Failed to write file: ${errorMessage}` };
    }
}

export async function fileDelete(
    filePath: string, 
    recursive: boolean = false
): Promise<{ success: boolean; error?: string }> {
    migrateFileOperations();
    
    const validation = isPathAllowed(filePath);
    if (!validation.allowed) {
        logFileOperation("file_delete", filePath, "failed", undefined, validation.error);
        return { success: false, error: validation.error };
    }
    
    try {
        const stats = await fs.stat(validation.resolvedPath);
        
        if (stats.isDirectory()) {
            if (!recursive) {
                const files = await fs.readdir(validation.resolvedPath);
                if (files.length > 0) {
                    logFileOperation("file_delete", filePath, "failed", undefined, "Directory not empty, use recursive=true");
                    return { success: false, error: "Directory is not empty. Use recursive=true to delete." };
                }
            }
            await fs.rm(validation.resolvedPath, { recursive });
        } else {
            await fs.unlink(validation.resolvedPath);
        }
        
        logFileOperation("file_delete", filePath, "success");
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_delete", filePath, "failed", undefined, errorMessage);
        
        if (errorMessage.includes("ENOENT")) {
            return { success: false, error: `File not found: ${filePath}` };
        }
        if (errorMessage.includes("EACCES")) {
            return { success: false, error: `Permission denied: ${filePath}` };
        }
        return { success: false, error: `Failed to delete: ${errorMessage}` };
    }
}

export async function fileMove(
    source: string, 
    destination: string
): Promise<{ success: boolean; error?: string }> {
    migrateFileOperations();
    
    const sourceValidation = isPathAllowed(source);
    if (!sourceValidation.allowed) {
        logFileOperation("file_move", source, "failed", destination, sourceValidation.error);
        return { success: false, error: sourceValidation.error };
    }
    
    const destValidation = isPathAllowed(destination);
    if (!destValidation.allowed) {
        logFileOperation("file_move", source, "failed", destination, destValidation.error);
        return { success: false, error: destValidation.error };
    }
    
    try {
        const destDir = path.dirname(destValidation.resolvedPath);
        await fs.mkdir(destDir, { recursive: true });
        
        await fs.rename(sourceValidation.resolvedPath, destValidation.resolvedPath);
        
        logFileOperation("file_move", source, "success", destination);
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_move", source, "failed", destination, errorMessage);
        
        if (errorMessage.includes("ENOENT")) {
            return { success: false, error: `Source file not found: ${source}` };
        }
        if (errorMessage.includes("EACCES")) {
            return { success: false, error: `Permission denied` };
        }
        return { success: false, error: `Failed to move: ${errorMessage}` };
    }
}

export async function fileCopy(
    source: string, 
    destination: string,
    recursive: boolean = false
): Promise<{ success: boolean; error?: string }> {
    migrateFileOperations();
    
    const sourceValidation = isPathAllowed(source);
    if (!sourceValidation.allowed) {
        logFileOperation("file_copy", source, "failed", destination, sourceValidation.error);
        return { success: false, error: sourceValidation.error };
    }
    
    const destValidation = isPathAllowed(destination);
    if (!destValidation.allowed) {
        logFileOperation("file_copy", source, "failed", destination, destValidation.error);
        return { success: false, error: destValidation.error };
    }
    
    try {
        const sourceStats = await fs.stat(sourceValidation.resolvedPath);
        
        if (sourceStats.isDirectory()) {
            if (!recursive) {
                logFileOperation("file_copy", source, "failed", destination, "Use recursive=true to copy directories");
                return { success: false, error: "Use recursive=true to copy directories" };
            }
            
            await fs.cp(sourceValidation.resolvedPath, destValidation.resolvedPath, { recursive: true });
        } else {
            const destDir = path.dirname(destValidation.resolvedPath);
            await fs.mkdir(destDir, { recursive: true });
            await fs.copyFile(sourceValidation.resolvedPath, destValidation.resolvedPath);
        }
        
        logFileOperation("file_copy", source, "success", destination);
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_copy", source, "failed", destination, errorMessage);
        
        if (errorMessage.includes("ENOENT")) {
            return { success: false, error: `Source file not found: ${source}` };
        }
        return { success: false, error: `Failed to copy: ${errorMessage}` };
    }
}

export async function fileList(
    dirPath: string, 
    recursive: boolean = false,
    pattern?: string
): Promise<{ success: boolean; files?: FileListItem[]; error?: string }> {
    migrateFileOperations();
    
    const validation = isPathAllowed(dirPath);
    if (!validation.allowed) {
        logFileOperation("file_list", dirPath, "failed", undefined, validation.error);
        return { success: false, error: validation.error };
    }
    
    try {
        const stats = await fs.stat(validation.resolvedPath);
        
        if (!stats.isDirectory()) {
            logFileOperation("file_list", dirPath, "failed", undefined, "Path is not a directory");
            return { success: false, error: "Path is not a directory" };
        }
        
        const files: FileListItem[] = [];
        
        async function walkDirectory(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(validation.resolvedPath, fullPath);
                
                if (pattern) {
                    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
                    if (!regex.test(entry.name)) continue;
                }
                
                if (entry.isDirectory()) {
                    const dirStats = await fs.stat(fullPath);
                    files.push({
                        name: entry.name,
                        path: relativePath,
                        size: 0,
                        isDirectory: true,
                        modified: dirStats.mtime.toISOString(),
                    });
                    
                    if (recursive) {
                        await walkDirectory(fullPath);
                    }
                } else {
                    const fileStats = await fs.stat(fullPath);
                    files.push({
                        name: entry.name,
                        path: relativePath,
                        size: fileStats.size,
                        isDirectory: false,
                        modified: fileStats.mtime.toISOString(),
                    });
                }
            }
        }
        
        await walkDirectory(validation.resolvedPath);
        
        logFileOperation("file_list", dirPath, "success");
        return { success: true, files };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_list", dirPath, "failed", undefined, errorMessage);
        
        if (errorMessage.includes("ENOENT")) {
            return { success: false, error: `Directory not found: ${dirPath}` };
        }
        return { success: false, error: `Failed to list: ${errorMessage}` };
    }
}

export async function fileStat(filePath: string): Promise<{ success: boolean; stat?: FileStat; error?: string }> {
    migrateFileOperations();
    
    const validation = isPathAllowed(filePath);
    if (!validation.allowed) {
        logFileOperation("file_stat", filePath, "failed", undefined, validation.error);
        return { success: false, error: validation.error };
    }
    
    try {
        const stats = await fs.stat(validation.resolvedPath);
        const name = path.basename(validation.resolvedPath);
        
        logFileOperation("file_stat", filePath, "success");
        
        return {
            success: true,
            stat: {
                name,
                path: validation.resolvedPath,
                size: stats.size,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                isSymlink: stats.isSymbolicLink(),
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString(),
                accessed: stats.atime.toISOString(),
            },
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_stat", filePath, "failed", undefined, errorMessage);
        
        if (errorMessage.includes("ENOENT")) {
            return { success: false, error: `File not found: ${filePath}` };
        }
        return { success: false, error: `Failed to get stat: ${errorMessage}` };
    }
}

export async function fileSearch(
    directory: string, 
    query: string,
    filePattern?: string
): Promise<{ success: boolean; results?: FileSearchResult[]; error?: string }> {
    migrateFileOperations();
    
    const validation = isPathAllowed(directory);
    if (!validation.allowed) {
        logFileOperation("file_search", directory, "failed", undefined, validation.error);
        return { success: false, error: validation.error };
    }
    
    try {
        const stats = await fs.stat(validation.resolvedPath);
        
        if (!stats.isDirectory()) {
            logFileOperation("file_search", directory, "failed", undefined, "Path is not a directory");
            return { success: false, error: "Path is not a directory" };
        }
        
        const results: FileSearchResult[] = [];
        const queryLower = query.toLowerCase();
        
        async function searchDirectory(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    await searchDirectory(fullPath);
                } else if (entry.isFile()) {
                    if (filePattern) {
                        const regex = new RegExp("^" + filePattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
                        if (!regex.test(entry.name)) continue;
                    }
                    
                    try {
                        const content = await fs.readFile(fullPath, "utf-8");
                        const lines = content.split("\n");
                        
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].toLowerCase().includes(queryLower)) {
                                const relativePath = path.relative(validation.resolvedPath, fullPath);
                                results.push({
                                    file: relativePath,
                                    line: i + 1,
                                    content: lines[i].trim().substring(0, 200),
                                });
                            }
                        }
                    } catch {
                        // Skip files that can't be read as text
                    }
                }
            }
        }
        
        await searchDirectory(validation.resolvedPath);
        
        logFileOperation("file_search", directory, "success");
        return { success: true, results };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_search", directory, "failed", undefined, errorMessage);
        
        return { success: false, error: `Search failed: ${errorMessage}` };
    }
}

export async function fileMkdir(dirPath: string): Promise<{ success: boolean; error?: string }> {
    migrateFileOperations();
    
    const validation = isPathAllowed(dirPath);
    if (!validation.allowed) {
        logFileOperation("file_mkdir", dirPath, "failed", undefined, validation.error);
        return { success: false, error: validation.error };
    }
    
    try {
        await fs.mkdir(validation.resolvedPath, { recursive: true });
        
        logFileOperation("file_mkdir", dirPath, "success");
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logFileOperation("file_mkdir", dirPath, "failed", undefined, errorMessage);
        
        if (errorMessage.includes("EACCES")) {
            return { success: false, error: `Permission denied: ${dirPath}` };
        }
        return { success: false, error: `Failed to create directory: ${errorMessage}` };
    }
}

export function getAllowedDirectories(): string[] {
    return [FILE_BASE_DIR, ...FILE_ALLOWED_DIRS];
}
