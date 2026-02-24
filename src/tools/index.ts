/**
 * tools/index.ts — Tool loader.
 *
 * Import this file to register all tools.
 * Each tool file self-registers via registerTool() on import.
 */

// Level 1
import "./get_current_time.js";

// Level 2 — Memory
import "./memory.js";

// Reminders
import "./reminders.js";

// Gmail
import "./gmail.js";

// Google Calendar
import "./google_calendar.js";

// Notion
import "./notion.js";

// Level 4: import "./shell.js"; import "./mcp_bridge.js";

// Level 5: Zapier MCP Integration (called explicitly in index.ts)
// import "./zapier_mcp.js";
