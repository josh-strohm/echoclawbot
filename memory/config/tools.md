# 🔧 TOOLS.md — Tool Reference

*On-demand file. Load with `memory_get` only when reasoning about tool selection or when the user asks what you can do.*

---

## Usage Principles

- Always use the most targeted tool. Don't call `web_search` if the answer is in memory.
- Don't narrate tool use. Report results, not actions.
- If a tool returns `status: "error"`, check the message and either fix the input or report the failure clearly.
- If a tool fails unexpectedly, check `error.log` without being asked.

---

## 🧠 Memory Tools

| Tool | Purpose |
|---|---|
| `memory_search` | Hybrid search (BM25 + vector) across all Markdown memory files. Use for recall during a session. |
| `memory_get` | Read a specific memory file or a line range from it. Use `file: "daily"` for today's log, `file: "durable"` for memory.md. |
| `memory_write` | Write to memory. Use `target: "daily"` for session logs, `target: "durable"` for stable facts in memory.md. |
| `memory_flush` | Flush pending memory candidates to disk. Use before context compaction. |
| `memory_reindex` | Force full reindex of all Markdown files. Use if search results seem stale. |

### When to use which memory tool
- **Recall a fact** → `memory_search` first, then `memory_get` if you need the full file
- **Save a stable fact** → `memory_write` with `target: "durable"`, but check with `memory_search` first
- **Log a session event** → `memory_write` with `target: "daily"`
- **Search returning stale results** → `memory_reindex` then retry

---

## 📁 File Tools

*All file operations are sandboxed to `AGENT_WORKSPACE`. No access outside that boundary.*

| Tool | Purpose |
|---|---|
| `list_files` | List contents of a directory in the workspace. Use `"."` for workspace root. |
| `read_file` | Read a file's contents. Max 5MB. Returns error if target is a directory. |
| `write_file` | Create or overwrite a file. Creates parent directories automatically. |
| `delete_file` | Delete a file. Will not delete directories. |

---

## 🌐 Web Tools

| Tool | Purpose |
|---|---|
| `web_search` | Tavily-powered web search. Returns titles, URLs, and content snippets. Default 5 results. |

### When to use
- Only when the answer is not in memory and requires current/external information.
- Prefer `memory_search` first — if memory has it, skip the web.

---

## 🖼️ Vision Tools

| Tool | Purpose |
|---|---|
| `analyze_image` | Analyze an image by URL or local file path. Accepts a prompt/question about the image. |

### Notes
- Local files must be in the project root directory, not the workspace sandbox.
- `my_photo.jpg` is a known file — Josh's selfie (short hair, Columbia t-shirt, lanyard, office setting).

---

## 📊 Dashboard & System Tools

| Tool | Purpose |
|---|---|
| `get_dashboard_url` | Returns the local URL for Mission Control (`http://localhost:3100` by default). |
| `get_cost_summary` | API spend and token usage for a time range (`24h`, `7d`, `30d`, `all`). |
| `get_memory_stats` | Count of core facts, indexed messages, and summaries in SQLite. |
| `get_system_health` | CPU load, RAM usage, and process uptime. |
| `get_system_status` | Architecture overview — confirms SQLite/file-first mode, embedding status, removed integrations. |
| `list_available_tools` | Returns all currently registered tools and descriptions at runtime. |

---

## ✅ Task Tools

| Tool | Purpose |
|---|---|
| `get_pending_tasks` | List all tasks not yet marked Done from the Kanban board. |
| `update_task` | Update a task's status or progress notes by ID. Statuses: `Todo`, `In Progress`, `Done`, `Failed`. |
| `schedule_task` | Schedule a future or recurring task using a cron expression. Triggers an agent run at the scheduled time. |

### Cron expression quick reference
- `0 9 * * *` — daily at 9am
- `0 */6 * * *` — every 6 hours
- `*/30 * * * *` — every 30 minutes
- `0 14 * * 1` — every Monday at 2pm

---

## 🔧 Utility Tools

| Tool | Purpose |
|---|---|
| `get_current_time` | Returns current UTC timestamp. Use when time context is needed. |
| `calculator` | Evaluates a math expression. Basic arithmetic only — not a full interpreter. |
| `echo` | Echoes input back internally. Does NOT send a Telegram message. |

---

## 🎤 Speech Tools

| Tool | Purpose |
|---|---|
| `transcribe_audio` | Transcribes audio via Groq. Requires `GROQ_API_KEY`. Called automatically for Telegram voice messages — rarely needs manual invocation. |

---

---

## 🏢 CRM Tools (Less Annoying CRM)

*Requires `LACRM_API_KEY` in `.env`. All requests go to `https://api.lessannoyingcrm.com/v2/`.*

### Rules
- **Search before creating.** Always call `crm_get_contacts` before `crm_create_contact` to avoid duplicates.
- **Ask before deleting.** All CRM deletes are permanent. Confirm with Josh first.
- **Summarize results.** Never dump raw JSON — report what matters in plain language.
- **Tasks vs Events.** Tasks = to-do items (date only). Events = meetings/calls (date + time).
- **Completing tasks.** Use `crm_edit_task` with `IsComplete: true`. Never delete a task to complete it.
- **Dates.** Dates: `YYYY-MM-DD`. Datetimes: `YYYY-MM-DDTHH:mm:ss-05:00` (EST).

### Contacts & Companies

| Tool | Purpose |
|---|---|
| `crm_get_contacts` | Search contacts/companies by name, email, phone, etc. Use before creating. |
| `crm_get_contact` | Get full details for a single contact by ContactId. |
| `crm_create_contact` | Create a contact (`IsCompany: false`) or company (`IsCompany: true`). |
| `crm_edit_contact` | Update any fields on an existing contact. Only send changed fields. |
| `crm_delete_contact` | Permanently delete a contact. **Confirm first.** |

### Tasks

| Tool | Purpose |
|---|---|
| `crm_get_tasks` | Get tasks in a date range. Requires `StartDate` and `EndDate`. |
| `crm_get_tasks_for_contact` | Get all tasks attached to a specific contact. |
| `crm_create_task` | Create a new task (date only — no time). |
| `crm_edit_task` | Update a task. Use `IsComplete: true` to mark done. |
| `crm_delete_task` | Delete a task. **Do not use to complete — use `crm_edit_task` instead.** |

### Notes

| Tool | Purpose |
|---|---|
| `crm_get_notes` | Get notes, optionally filtered by contact or date range. |
| `crm_get_notes_for_contact` | Get all notes attached to a specific contact. |
| `crm_create_note` | Add a plain-text note to a contact. |
| `crm_edit_note` | Update note content or display date. |
| `crm_delete_note` | Permanently delete a note. **Confirm first.** |

### Events

| Tool | Purpose |
|---|---|
| `crm_get_events` | Get scheduled events, optionally filtered by date/contact. |
| `crm_get_events_for_contact` | Get all events attached to a specific contact. |
| `crm_create_event` | Create a scheduled event with start + end datetime. |
| `crm_edit_event` | Update an existing event. Only send changed fields. |
| `crm_delete_event` | Permanently delete an event. **Confirm first.** |

### Emails

| Tool | Purpose |
|---|---|
| `crm_get_emails` | Get logged emails, optionally filtered by contact or date range. |
| `crm_get_emails_for_contact` | Get all logged emails for a specific contact. |
| `crm_log_email` | Log an email to one or more contacts. Does NOT send — records only. |
| `crm_delete_email` | Delete a logged email. **Confirm first.** |

### Relationships

| Tool | Purpose |
|---|---|
| `crm_get_relationships_for_contact` | Get all relationships linked to a contact. |
| `crm_create_relationship` | Link two contacts/companies together. |
| `crm_edit_relationship` | Update the note on a relationship. |
| `crm_delete_relationship` | Delete a relationship link. **Confirm first.** |

### Pipelines

| Tool | Purpose |
|---|---|
| `crm_get_pipelines` | List all pipelines. Use to find PipelineIds. |
| `crm_get_pipeline_items` | Get items within a pipeline. Requires `PipelineId`. |
| `crm_create_pipeline` | Create a new pipeline. |
| `crm_edit_pipeline` | Update an existing pipeline. |
| `crm_delete_pipeline` | Permanently delete a pipeline. **Confirm first.** |

---

*This file is a reference, not a rulebook. Use judgment. The goal is always the most efficient path to a correct result.*