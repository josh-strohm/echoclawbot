import { registerTool } from "./registry.js";
import { logger } from "../logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

async function runBrowserCommand(args: string, timeout: number = 60000): Promise<string> {
    try {
        const { stdout, stderr } = await execAsync(`agent-browser ${args}`, { 
            timeout,
            maxBuffer: 50 * 1024 * 1024,  // Increased to 50MB
        });
        if (stderr && !stderr.includes("Warning") && !stderr.includes("Downloading")) {
            logger.warn("browser", "stderr", { stderr });
        }
        return stdout.trim();
    } catch (err: any) {
        if (err.stdout) {
            return err.stdout.trim();
        }
        throw new Error(err.message);
    }
}

registerTool({
    name: "browser_navigate",
    description:
        "Open a URL in the browser and get a snapshot of interactive elements. " +
        "This is the starting point for any web browsing task. " +
        "Use this first, then use browser_click, browser_fill, etc. to interact.",
    inputSchema: {
        type: "object" as const,
        properties: {
            url: {
                type: "string",
                description: "The URL to navigate to (e.g., 'https://example.com', 'https://google.com/search?q=test')",
            },
            wait_for: {
                type: "string",
                description: "Wait for something before getting snapshot: 'networkidle', 'load', 'domcontentloaded', or a text to wait for",
            },
        },
        required: ["url"],
    },
    execute: async (input) => {
        const url = input.url as string;
        const waitFor = input.wait_for as string | undefined;

        try {
            let cmd = `open "${url}"`;
            
            if (waitFor) {
                if (waitFor === "networkidle" || waitFor === "load" || waitFor === "domcontentloaded") {
                    cmd += ` && wait --load ${waitFor}`;
                } else {
                    cmd += ` && wait --text "${waitFor}"`;
                }
            }
            
            cmd += " && snapshot -i --json";

            const result = await runBrowserCommand(cmd, 90000);
            
            if (!result) {
                return JSON.stringify({
                    success: false,
                    error: "No output from browser",
                });
            }

            let snapshotText = "";
            let refsObj = {};
            let currentUrl = url;
            
            try {
                const parsed = JSON.parse(result);
                snapshotText = parsed.data?.snapshot || parsed.snapshot || "";
                refsObj = parsed.data?.refs || parsed.refs || {};
                currentUrl = parsed.url || parsed.data?.origin || url;
            } catch {
                snapshotText = result.substring(0, 10000);
            }

            const lines = snapshotText.split('\n').filter(l => l.trim());
            const summary = lines.slice(0, 20).join('\n');
            const interactiveCount = lines.filter(l => l.includes('[ref=')).length;
            
            return JSON.stringify({
                success: true,
                url: currentUrl,
                page_loaded: true,
                snapshot: snapshotText,
                summary: summary,
                interactive_elements_count: interactiveCount,
                hint: `Page loaded with ${interactiveCount} interactive elements. Review the snapshot above and provide your response.`
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("browser", "Navigate failed", { error: errorMsg });
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "browser_click",
    description:
        "Click an element on the page using a reference from the last snapshot (e.g., @e1, @e2). " +
        "First use browser_navigate to get a snapshot with refs.",
    inputSchema: {
        type: "object" as const,
        properties: {
            ref: {
                type: "string",
                description: "The element reference to click (e.g., '@e1', '@e2'). These come from the snapshot.",
            },
            new_tab: {
                type: "boolean",
                description: "Open link in new tab (default false)",
                default: false,
            },
        },
        required: ["ref"],
    },
    execute: async (input) => {
        const ref = input.ref as string;
        const newTab = input.new_tab as boolean || false;

        try {
            let cmd = `click ${ref}`;
            if (newTab) {
                cmd += " --new-tab";
            }
            cmd += " && snapshot -i --json";

            const result = await runBrowserCommand(cmd);
            
            let snapshotText = "";
            let refsObj = {};
            
            try {
                const parsed = JSON.parse(result);
                snapshotText = parsed.data?.snapshot || parsed.snapshot || "";
                refsObj = parsed.data?.refs || parsed.refs || {};
            } catch {
                snapshotText = result.substring(0, 5000);
            }

            // Extract key info from snapshot for the agent
            const lines = snapshotText.split('\n').filter(l => l.trim());
            const summary = lines.slice(0, 15).join('\n');
            
            return JSON.stringify({
                success: true,
                page_title: snapshotText.includes('✓') ? snapshotText.split('✓')[1]?.split('\n')[0] || "" : "",
                snapshot: snapshotText,
                summary: summary,
                interaction_complete: true,
                hint: "You now have the page snapshot. Please provide your response based on what you see."
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("browser", "Click failed", { error: errorMsg, ref });
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "browser_fill",
    description:
        "Fill an input field with text. Use refs from the last snapshot (e.g., @e3). " +
        "First use browser_navigate to get a snapshot with refs.",
    inputSchema: {
        type: "object" as const,
        properties: {
            ref: {
                type: "string",
                description: "The input element reference (e.g., '@e3'). These come from the snapshot.",
            },
            text: {
                type: "string",
                description: "The text to fill into the input field",
            },
        },
        required: ["ref", "text"],
    },
    execute: async (input) => {
        const ref = input.ref as string;
        const text = input.text as string;

        try {
            const cmd = `fill ${ref} "${text.replace(/"/g, '\\"')}" && snapshot -i --json`;
            const result = await runBrowserCommand(cmd);
            
            try {
                const parsed = JSON.parse(result);
                return JSON.stringify({
                    success: true,
                    snapshot: parsed.data?.snapshot || parsed.snapshot || "",
                    refs: parsed.data?.refs || parsed.refs || {},
                });
            } catch {
                return JSON.stringify({
                    success: true,
                    output: result.substring(0, 2000),
                });
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("browser", "Fill failed", { error: errorMsg, ref, textLength: text.length });
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "browser_get_text",
    description:
        "Get the text content of a specific element. Use refs from the last snapshot.",
    inputSchema: {
        type: "object" as const,
        properties: {
            ref: {
                type: "string",
                description: "The element reference (e.g., '@e1'). These come from the snapshot.",
            },
        },
        required: ["ref"],
    },
    execute: async (input) => {
        const ref = input.ref as string;

        try {
            const cmd = `get text ${ref} --json`;
            const result = await runBrowserCommand(cmd);
            
            return JSON.stringify({
                success: true,
                text: result,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("browser", "Get text failed", { error: errorMsg, ref });
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "browser_screenshot",
    description:
        "Take a screenshot of the current page. Useful for visual verification.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Optional path to save the screenshot. If not provided, saves to temp directory.",
            },
            full_page: {
                type: "boolean",
                description: "Capture full page (not just viewport)",
                default: false,
            },
            annotate: {
                type: "boolean",
                description: "Add numbered labels to interactive elements",
                default: false,
            },
        },
        required: [],
    },
    execute: async (input) => {
        const path = input.path as string | undefined;
        const fullPage = input.full_page as boolean || false;
        const annotate = input.annotate as boolean || false;

        try {
            let cmd = "screenshot";
            if (path) {
                cmd += ` "${path}"`;
            }
            if (fullPage) {
                cmd += " --full";
            }
            if (annotate) {
                cmd += " --annotate";
            }

            const result = await runBrowserCommand(cmd);
            
            return JSON.stringify({
                success: true,
                output: result,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("browser", "Screenshot failed", { error: errorMsg });
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "browser_close",
    description:
        "Close the browser session. Use when done with browsing tasks to free resources.",
    inputSchema: {
        type: "object" as const,
        properties: {},
    },
    execute: async () => {
        try {
            await runBrowserCommand("close");
            return JSON.stringify({
                success: true,
                message: "Browser closed",
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "browser_go_back",
    description: "Navigate back in browser history.",
    inputSchema: {
        type: "object" as const,
        properties: {},
    },
    execute: async () => {
        try {
            const cmd = "back && snapshot -i --json";
            const result = await runBrowserCommand(cmd);
            
            try {
                const parsed = JSON.parse(result);
                return JSON.stringify({
                    success: true,
                    snapshot: parsed.data?.snapshot || parsed.snapshot || "",
                    refs: parsed.data?.refs || parsed.refs || {},
                });
            } catch {
                return JSON.stringify({
                    success: true,
                    output: result.substring(0, 2000),
                });
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});

registerTool({
    name: "browser_scroll",
    description: "Scroll the page. Use 'up', 'down', 'left', 'right', or a pixel amount.",
    inputSchema: {
        type: "object" as const,
        properties: {
            direction: {
                type: "string",
                enum: ["up", "down", "left", "right", "top", "bottom"],
                description: "Direction to scroll",
            },
            pixels: {
                type: "number",
                description: "Number of pixels to scroll (default 300)",
                default: 300,
            },
        },
        required: ["direction"],
    },
    execute: async (input) => {
        const direction = input.direction as string;
        const pixels = (input.pixels as number) || 300;

        try {
            const cmd = `scroll ${direction} ${pixels} && snapshot -i --json`;
            const result = await runBrowserCommand(cmd);
            
            try {
                const parsed = JSON.parse(result);
                return JSON.stringify({
                    success: true,
                    snapshot: parsed.data?.snapshot || parsed.snapshot || "",
                    refs: parsed.data?.refs || parsed.refs || {},
                });
            } catch {
                return JSON.stringify({
                    success: true,
                    output: result.substring(0, 2000),
                });
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            return JSON.stringify({
                success: false,
                error: errorMsg,
            });
        }
    },
});
