import { registerFunctionTool } from './registry';
import { sqlite } from '../dashboard/db';
import * as os from 'os';

registerFunctionTool(
    async () => {
        const port = process.env.DASHBOARD_PORT || 3100;
        return `Mission Control Dashboard is accessible at: http://localhost:${port}`;
    },
    {
        name: 'get_dashboard_url',
        description: 'Get the local URL to access the Mission Control Dashboard',
        parameters: { type: 'object', properties: {} }
    }
);

registerFunctionTool(
    async (args: { range: string }) => {
        let minDate = new Date(0);
        const now = new Date();
        if (args.range === '24h') {
            minDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        } else if (args.range === '7d') {
            minDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (args.range === '30d') {
            minDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const stmt = sqlite.prepare(`SELECT * FROM cost_log WHERE timestamp >= ?`);
        const data = stmt.all(minDate.toISOString()) as any[];

        if (!data || data.length === 0) return 'No cost logs found for the selected range.';

        let spend = 0, tokens = 0;
        data.forEach(r => { spend += (r.cost_usd || 0); tokens += (r.tokens || 0); });
        return `Total Spend: $${spend.toFixed(4)}, Total Tokens: ${tokens} across ${data.length} requests in the last ${args.range}.`;
    },
    {
        name: 'get_cost_summary',
        description: 'Get a summary of API costs and token usage over a given time range.',
        parameters: {
            type: 'object',
            properties: {
                range: { type: 'string', description: 'Time range (24h, 7d, 30d, all)', enum: ['24h', '7d', '30d', 'all'] }
            },
            required: ['range']
        }
    }
);

registerFunctionTool(
    async () => {
        try {
            const facts: any = sqlite.prepare('SELECT COUNT(*) as c FROM core_memory').get();
            const msgs: any = sqlite.prepare('SELECT COUNT(*) as c FROM messages').get();
            const sums: any = sqlite.prepare('SELECT COUNT(*) as c FROM summaries').get();
            return `Memory Stats:\n- Core Facts: ${facts.c}\n- Indexed Messages: ${msgs.c}\n- Summaries: ${sums.c}`;
        } catch (e: any) {
            return `Error retrieving memory stats: ${e.message}`;
        }
    },
    {
        name: 'get_memory_stats',
        description: 'Get quick statistics on currently stored local memory and facts.',
        parameters: { type: 'object', properties: {} }
    }
);

registerFunctionTool(
    async () => {
        const load = os.loadavg();
        const mem = process.memoryUsage();
        return `System Health:\n- CPU Load: ${load.map(l => l.toFixed(2)).join(', ')}\n- Uptime: ${(process.uptime() / 3600).toFixed(2)} hours\n- RAM Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`;
    },
    {
        name: 'get_system_health',
        description: 'Get the server CPU, memory, and uptime metrics.',
        parameters: { type: 'object', properties: {} }
    }
);
