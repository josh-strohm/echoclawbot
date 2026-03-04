import puppeteer, { Browser } from "puppeteer";
import { logger } from "../logger.js";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browser || !browser.connected) {
        logger.info("websearch", "Launching browser...");
        browser = await puppeteer.launch({
            headless: true,
            executablePath: "C:\\Users\\josh.strohm\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
                "--no-zygote",
                "--single-process",
            ],
        });
        logger.info("websearch", "Browser launched successfully");
    }
    return browser;
}

export interface SearchResult {
    title: string;
    url: string;
    summary: string;
}

export interface WebSearchResult {
    query: string;
    results: SearchResult[];
    retrieval_time: string;
    result_count: number;
}

async function closeBrowser(): Promise<void> {
    if (browser) {
        try {
            await browser.close();
            browser = null;
            logger.info("websearch", "Browser closed");
        } catch (e) {
            logger.warn("websearch", "Error closing browser", { error: String(e) });
        }
    }
}

process.on("exit", () => closeBrowser());
process.on("SIGINT", () => closeBrowser());
process.on("SIGTERM", () => closeBrowser());

export async function webSearch(query: string, maxResults: number = 10): Promise<WebSearchResult> {
    const startTime = Date.now();
    const retrievalTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    
    logger.info("websearch", `Searching for: ${query}`);

    let browserInstance: Browser | null = null;

    try {
        browserInstance = await getBrowser();
        const page = await browserInstance.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        const encodedQuery = encodeURIComponent(query);
        await page.goto(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const results: SearchResult[] = await page.evaluate((limit) => {
            const searchResults: SearchResult[] = [];
            
            const resultElements = document.querySelectorAll(".result__body");
            
            resultElements.forEach((element) => {
                if (searchResults.length >= limit) return;

                const titleElement = element.querySelector(".result__a");
                const urlElement = element.querySelector(".result__a");
                const summaryElement = element.querySelector(".result__snippet");

                if (titleElement && urlElement) {
                    const title = titleElement.textContent?.trim() || "";
                    const url = (urlElement as HTMLAnchorElement).href || "";
                    const summary = summaryElement?.textContent?.trim() || "";

                    if (title && url) {
                        searchResults.push({ title, url, summary });
                    }
                }
            });

            return searchResults;
        }, maxResults);

        await page.close();

        const duration = Date.now() - startTime;
        logger.info("websearch", `Search completed in ${duration}ms, found ${results.length} results`);

        return {
            query,
            results,
            retrieval_time: retrievalTime,
            result_count: results.length,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("websearch", "Search failed", { error: errorMessage, query });

        return {
            query,
            results: [],
            retrieval_time: retrievalTime,
            result_count: 0,
        };
    }
}

export async function webSearchJson(query: string, maxResults: number = 10): Promise<string> {
    const result = await webSearch(query, maxResults);
    return JSON.stringify(result, null, 2);
}

import { registerTool } from "./registry.js";

registerTool({
    name: "web_search",
    description:
        "Search the internet using your local browser to get live, real-time information. " +
        "Use this when you need current information, news, weather, or any data that may have changed recently. " +
        "Returns structured results with titles, URLs, and summaries.",
    inputSchema: {
        type: "object" as const,
        properties: {
            query: {
                type: "string",
                description: "The search query (e.g., 'current weather in Tokyo', 'latest AI news 2026').",
            },
            max_results: {
                type: "number",
                description: "Maximum number of results to return (default 10).",
            },
        },
        required: ["query"],
    },
    execute: async (input) => {
        const query = input.query as string;
        const maxResults = (input.max_results as number) || 10;

        try {
            const result = await webSearch(query, maxResults);
            return JSON.stringify(result, null, 2);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return JSON.stringify({
                error: "Search failed",
                message: errorMessage,
                query,
            });
        }
    },
});
