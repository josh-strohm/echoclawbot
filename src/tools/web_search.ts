import { globalToolRegistry } from './registry';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
}

async function tavilySearch(query: string, maxResults = 5): Promise<TavilySearchResult[]> {
    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query,
            max_results: maxResults,
            include_answer: true,
            include_raw_content: false,
        }),
    });

    if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();
    
    return data.results.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score,
    }));
}

globalToolRegistry.register({
    name: 'web_search',
    description: 'Performs a web search using Tavily to find relevant information. Returns a list of search results with titles, URLs, and snippets.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query to look up on the web.'
            },
            maxResults: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5).',
                default: 5
            }
        },
        required: ['query']
    },
    execute: async (args: { query: string; maxResults?: number }) => {
        try {
            const results = await tavilySearch(args.query, args.maxResults);
            return {
                status: 'success',
                query: args.query,
                results: results.map(r => ({
                    title: r.title,
                    url: r.url,
                    content: r.content,
                    score: r.score
                }))
            };
        } catch (error: any) {
            return {
                status: 'error',
                message: error.message
            };
        }
    }
});
