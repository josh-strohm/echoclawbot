import { globalToolRegistry } from './registry';

const LACRM_ENDPOINT = 'https://api.lessannoyingcrm.com/v2/';

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

const FUNCTIONS_REQUIRING_ASSIGNED_TO = new Set([
    'CreateContact',
]);

async function lacrmRequest(fn: string, params: Record<string, any> = {}): Promise<any> {
    const apiKey = process.env.LACRM_API_KEY;
    if (!apiKey) {
        return { status: 'error', message: 'LACRM_API_KEY is not set in environment.' };
    }

    // Auto-inject AssignedTo for functions that require it, if not already provided
    if (FUNCTIONS_REQUIRING_ASSIGNED_TO.has(fn) && !params.AssignedTo) {
        const userId = process.env.LACRM_USER_ID;
        if (!userId) {
            return { status: 'error', message: 'LACRM_USER_ID is not set in environment. Add your LACRM user ID to .env as LACRM_USER_ID=1165626.' };
        }
        params = { ...params, AssignedTo: userId };
    }

    const payload = { Function: fn, Parameters: params };
    const body = JSON.stringify(payload);

    console.log(`[LACRM] --> ${fn}`, JSON.stringify(params, null, 2));

    let response: Response;
    try {
        response = await fetch(LACRM_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
            },
            body,
        });
    } catch (fetchErr: any) {
        console.error(`[LACRM] Network error calling ${fn}:`, fetchErr.message);
        return { status: 'error', message: `LACRM network error: ${fetchErr.message}` };
    }

    console.log(`[LACRM] <-- ${fn} HTTP ${response.status}`);

    if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
            const errJson = await response.json() as any;
            console.error(`[LACRM] Error body for ${fn}:`, JSON.stringify(errJson, null, 2));
            errorDetail = errJson?.ErrorDescription || errJson?.ErrorCode || errorDetail;
        } catch { /* ignore */ }
        return { status: 'error', message: `LACRM API error: ${errorDetail}` };
    }

    const data = await response.json() as any;
    console.log(`[LACRM] Response for ${fn}:`, JSON.stringify(data, null, 2));

    // LACRM returns HTTP 200 even for errors — check the body too
    if (data?.ErrorCode || data?.ErrorDescription) {
        console.error(`[LACRM] API-level error for ${fn}: ${data.ErrorDescription || data.ErrorCode}`);
        return { status: 'error', message: `LACRM error: ${data.ErrorDescription || data.ErrorCode}` };
    }

    return { status: 'success', ...data as object };
}

// ---------------------------------------------------------------------------
// Contacts & Companies
// ---------------------------------------------------------------------------

globalToolRegistry.register({
    name: 'crm_get_contacts',
    description: 'Search for contacts or companies in the CRM. Use SearchTerms to find by name, email, phone, etc. Use RecordTypeFilter to limit to "Contacts" or "Companies". Always use this before creating a new contact to avoid duplicates.',
    parameters: {
        type: 'object',
        properties: {
            SearchTerms: { type: 'string', description: 'Name, email, phone, or any keyword to search for.' },
            RecordTypeFilter: { type: 'string', enum: ['Contacts', 'Companies'], description: 'Filter to only contacts or only companies.' },
            SortBy: { type: 'string', enum: ['Relevance', 'FirstName', 'LastName', 'CompanyName', 'DateCreated', 'LastUpdate'], description: 'Sort order.' },
            SortDirection: { type: 'string', enum: ['ASC', 'DESC'] },
            MaxNumberOfResults: { type: 'number', description: 'Max results to return (default 500, max 10000).' },
            Page: { type: 'number', description: 'Page number for pagination (default 1).' },
        },
    },
    execute: async (args: any) => lacrmRequest('GetContacts', args),
});

globalToolRegistry.register({
    name: 'crm_get_contact',
    description: 'Get full details for a single contact or company by their ContactId.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The unique ID of the contact or company.' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('GetContact', args),
});

globalToolRegistry.register({
    name: 'crm_get_contacts_by_id',
    description: 'Get full details for multiple contacts at once by providing an array of ContactIds.',
    parameters: {
        type: 'object',
        properties: {
            ContactIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of ContactIds to retrieve.',
            },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['ContactIds'],
    },
    execute: async (args: any) => lacrmRequest('GetContactsById', args),
});

globalToolRegistry.register({
    name: 'crm_create_contact',
    description: 'Create a new contact or company in the CRM. Set IsCompany to true for companies. Always search first with crm_get_contacts to avoid duplicates. Company names must be unique.',
    parameters: {
        type: 'object',
        properties: {
            IsCompany: { type: 'boolean', description: 'True to create a company, false for a person.' },
            Name: { type: 'string', description: 'Full name of the contact or company name.' },
            AssignedTo: { type: 'string', description: 'User ID to assign the contact to.' },
            Email: {
                description: 'Email address(es). Can be a string, array of strings, or array of {Text, Type} objects.',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                    { type: 'array', items: { type: 'object', properties: { Text: { type: 'string' }, Type: { type: 'string' } } } },
                ],
            },
            Phone: {
                description: 'Phone number(s). Can be a string, array of strings, or array of {Text, Type} objects.',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                    { type: 'array', items: { type: 'object', properties: { Text: { type: 'string' }, Type: { type: 'string' } } } },
                ],
            },
            Address: {
                description: 'Address(es). Can be a string, array of strings, or array of {Text, Type} objects.',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                    { type: 'array', items: { type: 'object', properties: { Text: { type: 'string' }, Type: { type: 'string' } } } },
                ],
            },
            Website: {
                description: 'Website(s).',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                ],
            },
            'Company Name': { type: 'string', description: 'Company the contact works at (for person contacts).' },
            'Job Title': { type: 'string', description: 'Job title of the contact.' },
            'Background Info': { type: 'string', description: 'Notes or background info about the contact.' },
            Birthday: { type: 'string', description: 'Birthday in YYYY-MM-DD format.' },
        },
        required: ['IsCompany', 'Name'],
        // Note: AssignedTo is listed as required by LACRM docs but defaults to the API key owner if omitted
    },
    execute: async (args: any) => lacrmRequest('CreateContact', args),
});

globalToolRegistry.register({
    name: 'crm_edit_contact',
    description: 'Update an existing contact or company. Only provide the fields you want to change. Use crm_get_contacts to find the ContactId first.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The unique ID of the contact or company to update.' },
            Name: { type: 'string' },
            AssignedTo: { type: 'string' },
            Email: {
                description: 'Updated email(s).',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                    { type: 'array', items: { type: 'object', properties: { Text: { type: 'string' }, Type: { type: 'string' } } } },
                ],
            },
            Phone: {
                description: 'Updated phone(s).',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                    { type: 'array', items: { type: 'object', properties: { Text: { type: 'string' }, Type: { type: 'string' } } } },
                ],
            },
            Address: {
                description: 'Updated address(es).',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                    { type: 'array', items: { type: 'object', properties: { Text: { type: 'string' }, Type: { type: 'string' } } } },
                ],
            },
            Website: {
                description: 'Updated website(s).',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } },
                ],
            },
            'Company Name': { type: 'string' },
            'Job Title': { type: 'string' },
            'Background Info': { type: 'string' },
            Birthday: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('EditContact', args),
});

globalToolRegistry.register({
    name: 'crm_delete_contact',
    description: 'Permanently delete a contact or company. This cannot be undone. Always confirm with Josh before calling this.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The unique ID of the contact or company to delete.' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('DeleteContact', args),
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

globalToolRegistry.register({
    name: 'crm_get_tasks',
    description: 'Get tasks within a date range from the CRM. Tasks are date-only (no times). Use crm_get_events for scheduled meetings with times.',
    parameters: {
        type: 'object',
        properties: {
            StartDate: { type: 'string', description: 'Start of date range in YYYY-MM-DD format.' },
            EndDate: { type: 'string', description: 'End of date range in YYYY-MM-DD format.' },
            ContactId: { type: 'string', description: 'Filter tasks attached to a specific contact.' },
            CompletionStatus: { type: 'string', enum: ['Both', 'Incomplete', 'Complete'], description: 'Filter by completion status (default: Both).' },
            SortDirection: { type: 'string', enum: ['ASC', 'DESC'] },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['StartDate', 'EndDate'],
    },
    execute: async (args: any) => lacrmRequest('GetTasks', args),
});

globalToolRegistry.register({
    name: 'crm_create_task',
    description: 'Create a new task in the CRM. Tasks are date-only — use crm_create_event for meetings that need a specific time.',
    parameters: {
        type: 'object',
        properties: {
            Name: { type: 'string', description: 'Task name / what needs to be done.' },
            DueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format.' },
            Description: { type: 'string', description: 'Additional details about the task.' },
            ContactId: { type: 'string', description: 'Attach this task to a specific contact.' },
            AssignedTo: { type: 'string', description: 'User ID to assign the task to.' },
            CalendarId: { type: 'string', description: 'Calendar to add the task to.' },
        },
        required: ['Name'],
    },
    execute: async (args: any) => lacrmRequest('CreateTask', args),
});

globalToolRegistry.register({
    name: 'crm_edit_task',
    description: 'Update a task. To mark a task complete, set IsComplete to true. Do NOT delete tasks to complete them.',
    parameters: {
        type: 'object',
        properties: {
            TaskId: { type: 'string', description: 'The unique ID of the task to update.' },
            Name: { type: 'string' },
            DueDate: { type: 'string', description: 'YYYY-MM-DD' },
            Description: { type: 'string' },
            ContactId: { type: 'string' },
            AssignedTo: { type: 'string' },
            CalendarId: { type: 'string' },
            IsComplete: { type: 'boolean', description: 'Set to true to mark the task as complete.' },
        },
        required: ['TaskId'],
    },
    execute: async (args: any) => lacrmRequest('EditTask', args),
});

globalToolRegistry.register({
    name: 'crm_delete_task',
    description: 'Permanently delete a task. Do NOT use this to complete a task — use crm_edit_task with IsComplete: true instead. Confirm with Josh before deleting.',
    parameters: {
        type: 'object',
        properties: {
            TaskId: { type: 'string', description: 'The unique ID of the task to delete.' },
        },
        required: ['TaskId'],
    },
    execute: async (args: any) => lacrmRequest('DeleteTask', args),
});

globalToolRegistry.register({
    name: 'crm_get_tasks_for_contact',
    description: 'Get all tasks attached to a specific contact.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The contact to get tasks for.' },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('GetTasksAttachedToContact', args),
});

globalToolRegistry.register({
    name: 'crm_get_task',
    description: 'Get full details for a single task by its TaskId.',
    parameters: {
        type: 'object',
        properties: {
            TaskId: { type: 'string', description: 'The unique ID of the task to retrieve.' },
        },
        required: ['TaskId'],
    },
    execute: async (args: any) => lacrmRequest('GetTask', args),
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

globalToolRegistry.register({
    name: 'crm_get_notes',
    description: 'Get notes from the CRM, optionally filtered by contact or date range.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'Filter notes for a specific contact.' },
            DateFilterStart: { type: 'string', description: 'Start date filter in YYYY-MM-DD format.' },
            DateFilterEnd: { type: 'string', description: 'End date filter in YYYY-MM-DD format.' },
            SortDirection: { type: 'string', enum: ['ASC', 'DESC'] },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
    },
    execute: async (args: any) => lacrmRequest('GetNotes', args),
});

globalToolRegistry.register({
    name: 'crm_create_note',
    description: 'Add a note to a contact in the CRM. Notes are plain text — HTML and markdown are escaped. Newlines are honored.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The contact to attach this note to.' },
            Note: { type: 'string', description: 'The note content (plain text).' },
            DateDisplayedInHistory: { type: 'string', description: 'Optional datetime to show in history (ISO 8601).' },
        },
        required: ['ContactId', 'Note'],
    },
    execute: async (args: any) => lacrmRequest('CreateNote', args),
});

globalToolRegistry.register({
    name: 'crm_edit_note',
    description: 'Update the content or date of an existing note.',
    parameters: {
        type: 'object',
        properties: {
            NoteId: { type: 'string', description: 'The unique ID of the note to update.' },
            Note: { type: 'string', description: 'Updated note content.' },
            DateDisplayedInHistory: { type: 'string', description: 'Updated display datetime (ISO 8601).' },
        },
        required: ['NoteId'],
    },
    execute: async (args: any) => lacrmRequest('EditNote', args),
});

globalToolRegistry.register({
    name: 'crm_delete_note',
    description: 'Permanently delete a note. Confirm with Josh before deleting.',
    parameters: {
        type: 'object',
        properties: {
            NoteId: { type: 'string', description: 'The unique ID of the note to delete.' },
        },
        required: ['NoteId'],
    },
    execute: async (args: any) => lacrmRequest('DeleteNote', args),
});

globalToolRegistry.register({
    name: 'crm_get_notes_for_contact',
    description: 'Get all notes attached to a specific contact.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The contact to get notes for.' },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('GetNotesAttachedToContact', args),
});

globalToolRegistry.register({
    name: 'crm_get_note',
    description: 'Get full details for a single note by its NoteId.',
    parameters: {
        type: 'object',
        properties: {
            NoteId: { type: 'string', description: 'The unique ID of the note to retrieve.' },
        },
        required: ['NoteId'],
    },
    execute: async (args: any) => lacrmRequest('GetNote', args),
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

globalToolRegistry.register({
    name: 'crm_get_events',
    description: 'Get scheduled events (meetings, calls, etc.) from the CRM. Events have specific start and end times, unlike tasks which are date-only.',
    parameters: {
        type: 'object',
        properties: {
            StartDate: { type: 'string', description: 'Filter events starting after this datetime (ISO 8601).' },
            EndDate: { type: 'string', description: 'Filter events ending before this datetime (ISO 8601).' },
            ContactId: { type: 'string', description: 'Filter events for a specific contact.' },
            SortDirection: { type: 'string', enum: ['ASC', 'DESC'] },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
    },
    execute: async (args: any) => lacrmRequest('GetEvents', args),
});

globalToolRegistry.register({
    name: 'crm_create_event',
    description: 'Create a scheduled event (meeting, call, appointment, etc.) in the CRM. Use ISO 8601 datetimes with timezone offset for StartDate and EndDate.',
    parameters: {
        type: 'object',
        properties: {
            Name: { type: 'string', description: 'Event name.' },
            StartDate: { type: 'string', description: 'Start datetime in ISO 8601 format (e.g. 2026-03-20T14:00:00-05:00).' },
            EndDate: { type: 'string', description: 'End datetime in ISO 8601 format.' },
            IsAllDay: { type: 'boolean', description: 'True if this is an all-day event.' },
            Location: { type: 'string', description: 'Event location.' },
            Description: { type: 'string', description: 'Event description or agenda.' },
            CalendarId: { type: 'string', description: 'Calendar to add the event to.' },
            Attendees: {
                type: 'array',
                description: 'List of attendees.',
                items: {
                    type: 'object',
                    properties: {
                        IsUser: { type: 'boolean' },
                        AttendeeId: { type: 'string' },
                        AttendanceStatus: { type: 'string', enum: ['IsAttending', 'Maybe', 'NotAttending'] },
                    },
                },
            },
            IsRecurring: { type: 'boolean', description: 'True if this is a recurring event.' },
            RecurrenceRule: { type: 'string', description: 'RFC 5545 recurrence rule (e.g. FREQ=WEEKLY;BYDAY=MO).' },
            EndRecurrenceRule: { type: 'string', description: 'When the recurrence ends (RFC 5545).' },
        },
        required: ['Name', 'StartDate', 'EndDate'],
    },
    execute: async (args: any) => lacrmRequest('CreateEvent', args),
});

globalToolRegistry.register({
    name: 'crm_edit_event',
    description: 'Update an existing event. Only provide the fields you want to change.',
    parameters: {
        type: 'object',
        properties: {
            EventId: { type: 'string', description: 'The unique ID of the event to update.' },
            Name: { type: 'string' },
            StartDate: { type: 'string', description: 'ISO 8601 datetime.' },
            EndDate: { type: 'string', description: 'ISO 8601 datetime.' },
            IsAllDay: { type: 'boolean' },
            Location: { type: 'string' },
            Description: { type: 'string' },
            CalendarId: { type: 'string' },
            Attendees: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        IsUser: { type: 'boolean' },
                        AttendeeId: { type: 'string' },
                        AttendanceStatus: { type: 'string', enum: ['IsAttending', 'Maybe', 'NotAttending'] },
                    },
                },
            },
            IsRecurring: { type: 'boolean' },
            RecurrenceRule: { type: 'string' },
            EndRecurrenceRule: { type: 'string' },
        },
        required: ['EventId'],
    },
    execute: async (args: any) => lacrmRequest('EditEvent', args),
});

globalToolRegistry.register({
    name: 'crm_delete_event',
    description: 'Permanently delete an event. Confirm with Josh before deleting.',
    parameters: {
        type: 'object',
        properties: {
            EventId: { type: 'string', description: 'The unique ID of the event to delete.' },
        },
        required: ['EventId'],
    },
    execute: async (args: any) => lacrmRequest('DeleteEvent', args),
});

globalToolRegistry.register({
    name: 'crm_get_events_for_contact',
    description: 'Get all events attached to a specific contact.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The contact to get events for.' },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('GetEventsAttachedToContact', args),
});

globalToolRegistry.register({
    name: 'crm_get_event',
    description: 'Get full details for a single event by its EventId.',
    parameters: {
        type: 'object',
        properties: {
            EventId: { type: 'string', description: 'The unique ID of the event to retrieve.' },
        },
        required: ['EventId'],
    },
    execute: async (args: any) => lacrmRequest('GetEvent', args),
});

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

globalToolRegistry.register({
    name: 'crm_get_emails',
    description: 'Get logged emails from the CRM, optionally filtered by contact or date range.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'Filter emails for a specific contact.' },
            DateFilterStart: { type: 'string', description: 'Start date filter (ISO 8601).' },
            DateFilterEnd: { type: 'string', description: 'End date filter (ISO 8601).' },
            SortDirection: { type: 'string', enum: ['ASC', 'DESC'] },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
    },
    execute: async (args: any) => lacrmRequest('GetEmails', args),
});

globalToolRegistry.register({
    name: 'crm_log_email',
    description: 'Log an email to one or more contacts in the CRM. This records the email in contact history — it does not send an email.',
    parameters: {
        type: 'object',
        properties: {
            ContactIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of ContactIds this email is associated with.',
            },
            From: {
                type: 'object',
                description: 'Sender info.',
                properties: {
                    Address: { type: 'string', description: 'Sender email address.' },
                    Name: { type: 'string', description: 'Sender display name.' },
                },
                required: ['Address'],
            },
            To: {
                type: 'array',
                description: 'Recipients.',
                items: {
                    type: 'object',
                    properties: {
                        Address: { type: 'string' },
                        Name: { type: 'string' },
                    },
                    required: ['Address'],
                },
            },
            Subject: { type: 'string', description: 'Email subject line.' },
            Body: { type: 'string', description: 'Email body content.' },
            Date: { type: 'string', description: 'Datetime the email was sent (ISO 8601).' },
            Cc: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        Address: { type: 'string' },
                        Name: { type: 'string' },
                    },
                },
                description: 'CC recipients.',
            },
        },
        required: ['ContactIds', 'From', 'To', 'Body', 'Date'],
    },
    execute: async (args: any) => lacrmRequest('CreateEmail', args),
});

globalToolRegistry.register({
    name: 'crm_delete_email',
    description: 'Delete a logged email from the CRM. Confirm with Josh before deleting.',
    parameters: {
        type: 'object',
        properties: {
            EmailId: { type: 'string', description: 'The unique ID of the email to delete.' },
        },
        required: ['EmailId'],
    },
    execute: async (args: any) => lacrmRequest('DeleteEmail', args),
});

globalToolRegistry.register({
    name: 'crm_get_emails_for_contact',
    description: 'Get all logged emails attached to a specific contact.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The contact to get emails for.' },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('GetEmailsAttachedToContact', args),
});

globalToolRegistry.register({
    name: 'crm_get_email',
    description: 'Get full details for a single logged email by its EmailId.',
    parameters: {
        type: 'object',
        properties: {
            EmailId: { type: 'string', description: 'The unique ID of the email to retrieve.' },
        },
        required: ['EmailId'],
    },
    execute: async (args: any) => lacrmRequest('GetEmail', args),
});

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

globalToolRegistry.register({
    name: 'crm_create_relationship',
    description: 'Create a relationship link between two contacts or companies in the CRM.',
    parameters: {
        type: 'object',
        properties: {
            ContactId1: { type: 'string', description: 'First contact in the relationship.' },
            ContactId2: { type: 'string', description: 'Second contact in the relationship.' },
            Note: { type: 'string', description: 'Optional note describing the relationship.' },
        },
        required: ['ContactId1', 'ContactId2'],
    },
    execute: async (args: any) => lacrmRequest('CreateRelationship', args),
});

globalToolRegistry.register({
    name: 'crm_edit_relationship',
    description: 'Update the note on an existing relationship between two contacts.',
    parameters: {
        type: 'object',
        properties: {
            RelationshipId: { type: 'string', description: 'The unique ID of the relationship to update.' },
            Note: { type: 'string', description: 'Updated relationship note.' },
        },
        required: ['RelationshipId', 'Note'],
    },
    execute: async (args: any) => lacrmRequest('EditRelationship', args),
});

globalToolRegistry.register({
    name: 'crm_delete_relationship',
    description: 'Delete a relationship link between two contacts. Confirm with Josh before deleting.',
    parameters: {
        type: 'object',
        properties: {
            RelationshipId: { type: 'string', description: 'The unique ID of the relationship to delete.' },
        },
        required: ['RelationshipId'],
    },
    execute: async (args: any) => lacrmRequest('DeleteRelationship', args),
});

globalToolRegistry.register({
    name: 'crm_get_relationships_for_contact',
    description: 'Get all relationships attached to a specific contact.',
    parameters: {
        type: 'object',
        properties: {
            ContactId: { type: 'string', description: 'The contact to get relationships for.' },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['ContactId'],
    },
    execute: async (args: any) => lacrmRequest('GetRelationshipsAttachedToContact', args),
});

globalToolRegistry.register({
    name: 'crm_get_relationship',
    description: 'Get full details for a single relationship by its RelationshipId.',
    parameters: {
        type: 'object',
        properties: {
            RelationshipId: { type: 'string', description: 'The unique ID of the relationship to retrieve.' },
        },
        required: ['RelationshipId'],
    },
    execute: async (args: any) => lacrmRequest('GetRelationship', args),
});

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

globalToolRegistry.register({
    name: 'crm_get_pipelines',
    description: 'Get all pipelines configured in the CRM.',
    parameters: {
        type: 'object',
        properties: {
            IncludeArchivedPipelines: { type: 'boolean', description: 'Include archived pipelines in results.' },
            IncludeCustomFields: { type: 'boolean', description: 'Include custom field definitions.' },
            IncludeHiddenPipelines: { type: 'boolean', description: 'Include hidden pipelines.' },
        },
    },
    execute: async (args: any) => lacrmRequest('GetPipelines', args),
});

globalToolRegistry.register({
    name: 'crm_get_pipeline',
    description: 'Get full details for a single pipeline by its PipelineId.',
    parameters: {
        type: 'object',
        properties: {
            PipelineId: { type: 'string', description: 'The unique ID of the pipeline to retrieve.' },
        },
        required: ['PipelineId'],
    },
    execute: async (args: any) => lacrmRequest('GetPipeline', args),
});

globalToolRegistry.register({
    name: 'crm_get_pipeline_items',
    description: 'Get items (deals, leads, etc.) within a specific pipeline. Use crm_get_pipelines to find the PipelineId first.',
    parameters: {
        type: 'object',
        properties: {
            PipelineId: { type: 'string', description: 'The unique ID of the pipeline.' },
            StatusFilter: { type: 'string', description: 'Filter by pipeline status name.' },
            SortBy: { type: 'string', enum: ['Status', 'DateCreated', 'LastUpdate'] },
            SortDirection: { type: 'string', enum: ['ASC', 'DESC'] },
            MaxNumberOfResults: { type: 'number' },
            Page: { type: 'number' },
        },
        required: ['PipelineId'],
    },
    execute: async (args: any) => lacrmRequest('GetPipelineItems', args),
});

globalToolRegistry.register({
    name: 'crm_create_pipeline',
    description: 'Create a new pipeline in the CRM.',
    parameters: {
        type: 'object',
        properties: {
            Name: { type: 'string', description: 'Pipeline name.' },
            Icon: { type: 'string', description: 'Icon identifier for the pipeline.' },
            Permissions: { type: 'string', description: 'Permission setting for the pipeline.' },
            TeamIds: { type: 'array', items: { type: 'string' }, description: 'Team IDs with access to this pipeline.' },
        },
        required: ['Name', 'Icon'],
    },
    execute: async (args: any) => lacrmRequest('CreatePipeline', args),
});

globalToolRegistry.register({
    name: 'crm_edit_pipeline',
    description: 'Update an existing pipeline.',
    parameters: {
        type: 'object',
        properties: {
            PipelineId: { type: 'string', description: 'The unique ID of the pipeline to update.' },
            Name: { type: 'string' },
            Icon: { type: 'string' },
            Permissions: { type: 'string' },
            TeamIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['PipelineId'],
    },
    execute: async (args: any) => lacrmRequest('EditPipeline', args),
});

globalToolRegistry.register({
    name: 'crm_delete_pipeline',
    description: 'Permanently delete a pipeline. This cannot be undone. Confirm with Josh before deleting.',
    parameters: {
        type: 'object',
        properties: {
            PipelineId: { type: 'string', description: 'The unique ID of the pipeline to delete.' },
        },
        required: ['PipelineId'],
    },
    execute: async (args: any) => lacrmRequest('DeletePipeline', args),
});
