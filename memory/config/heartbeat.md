# 💓 HEARTBEAT.md — Background Process Reference

*On-demand file. Load with `memory_get` only when the user asks about scheduled tasks, background processes, or the heartbeat system.*

---

## What is the Heartbeat?

The heartbeat is a set of background intervals that run continuously while EchoClaw is active. It keeps memory healthy, drains async work queues, and ensures scheduled tasks fire correctly — all without blocking any user-facing response.

There are two heartbeat layers:

| Layer | Interval | Responsibility |
|---|---|---|
| **Reflection Heartbeat** | Every 2 minutes | Drains the memory reflection queue |
| **Cron Scheduler** | Every 60 seconds | Syncs active jobs from the database and fires due tasks |

---

## Reflection Heartbeat

- Defined in `src/dashboard/cron_scheduler.ts` → `startReflectionHeartbeat()`
- Starts automatically when `startDashboard()` is called
- On each tick, checks `memory.reflectionQueueDepth`
- If the queue is empty, it's a no-op (near-zero cost)
- If jobs are queued, calls `memory.processReflectionQueue()` to drain one job per tick
- Processes one job at a time to avoid concurrent LLM calls competing with user traffic
- Guarded by `isProcessing` flag — will never run two reflection jobs simultaneously

### How reflection gets queued
1. Agent finishes a response → calls `memory.enqueueReflection()` (fire-and-forget, zero latency)
2. `MemoryReflectionSystem.enqueue()` snapshots the current messages and pushes to the internal queue
3. Threshold: fires once every 20 meaningful exchanges (user + assistant messages)
4. Heartbeat picks it up within the next 2-minute window and processes it in the background

---

## Cron Scheduler

- Defined in `src/dashboard/cron_scheduler.ts` → `startCronScheduler()`
- Loads all `active` jobs from the `cron_jobs` SQLite table on start and every 60 seconds
- Dynamically adds new jobs and stops removed ones without restarting the process
- Uses `node-cron` for schedule parsing and execution

### Job types (determined by name prefix)

| Prefix | Behavior |
|---|---|
| `[TASK]` | Creates a Kanban task entry; background task poller picks it up and runs the agent |
| `[RECURRING]` | Runs the agent directly on schedule, stays active after completion |
| `[ONCE]` | Runs once, then sets itself to `inactive` automatically |
| `[REMINDER]` | Sends a Telegram message to all allowed user IDs |

### After a job runs
- On success: result logged to `cron_history`, Telegram notification sent with summary
- On failure: error logged to `cron_history`, Telegram failure notification sent
- One-time jobs (`[ONCE]` prefix or `[TASK]` with a specific date): deactivated after first successful run

---

## Background Task Poller

- Defined in `examples/telegram_bot.ts`
- Runs on a `setInterval` every **20 seconds**
- Polls the `tasks` table for any row with `status = 'Todo'`
- Picks up one task per tick, marks it `In Progress`, then runs the agent with the task context
- On completion: agent is expected to call `update_task` to set status to `Done` with progress notes
- On failure: status set to `Failed`, error message stored in `progress_notes`

---

## Interaction Between Systems

```
User message
    └─► agent.run()
            └─► response returned immediately
            └─► memory.enqueueReflection()  ← fire-and-forget

Reflection Heartbeat (every 2 min)
    └─► checks queue depth
            └─► if > 0: processReflectionQueue() → LLM call → memory.md updated

Cron Scheduler (every 60 sec)
    └─► syncs jobs from DB
            └─► fires due jobs → agent.run(taskDescription)

Task Poller (every 20 sec)
    └─► checks tasks table for Todo items
            └─► marks In Progress → agent.run(prompt) → update_task(Done)
```

---

## Rules for Scheduling

- Use `schedule_task` for user-facing future or recurring tasks
- Do not create cron jobs that duplicate what the heartbeat already handles (e.g. don't schedule a manual reflection task)
- All cron expressions use UTC internally — convert from EST (UTC-5 / UTC-4 DST) when scheduling
- Keep scheduled task descriptions detailed — the agent will wake up cold and needs full context to act

---

## Monitoring

- View all active cron jobs and history in the dashboard at `http://localhost:3100` → Cron tab
- Use `get_system_health` to check uptime and confirm the process is still running
- Use `get_pending_tasks` to see what the task poller is working through

---

*The heartbeat is what makes EchoClaw feel alive between conversations. Don't interfere with it unless something is broken.*