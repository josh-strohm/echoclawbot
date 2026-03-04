import { useEffect, useState } from 'react';
import './MemoryBrowser.css';

interface Reminder {
    id: number;
    title: string;
    body: string;
    due_at: string;
    status: string;
}

export default function CronManager() {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [newJobContent, setNewJobContent] = useState('');
    const [jobDate, setJobDate] = useState('');
    const [jobTime, setJobTime] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const fetchData = async () => {
        try {
            const res = await fetch('http://localhost:4000/api/db/reminders');
            if (res.ok) setReminders(await res.json());
        } catch (e) {
            console.error("Error fetching reminders", e);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newJobContent || !jobDate || !jobTime) return;

        setIsCreating(true);
        setStatusMsg(null);

        // Build ISO date string matching existing DB format: "2026-02-25T19:30:00.000Z"
        const due_at = new Date(`${jobDate}T${jobTime}:00`).toISOString();

        try {
            const res = await fetch('http://localhost:4000/api/db/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newJobContent.substring(0, 50),
                    body: newJobContent,
                    due_at: due_at
                }),
            });

            if (res.ok) {
                setNewJobContent('');
                setJobDate('');
                setJobTime('');
                setStatusMsg({ text: 'Job scheduled successfully!', type: 'success' });
                await fetchData();
            } else {
                const err = await res.json();
                setStatusMsg({ text: err.error || 'Failed to create job', type: 'error' });
            }
        } catch (e) {
            console.error("Error creating job", e);
            setStatusMsg({ text: 'Network error — is the API running?', type: 'error' });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange" style={{ color: '#ff4d4d' }}>Cron & Reminders</h2>
                <p className="subtitle">Agent scheduled tasks and cron jobs</p>
            </div>

            <div className="mem-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '20px' }}>
                <div className="mem-column">
                    <div className="mem-list">
                        <h3 style={{ color: '#fff', marginBottom: '15px', fontSize: '1.2rem' }}>Scheduled Jobs</h3>
                        {reminders.length === 0 && <div className="empty" style={{ background: '#1a1a1a' }}>No scheduled jobs found in DB.</div>}
                        {reminders.map(r => (
                            <div key={r.id} className="mem-card glass-panel" style={{ background: '#1a1a1a', borderLeft: '3px solid #00e676', marginBottom: '12px' }}>
                                <div className="mem-meta">
                                    <span className="badge" style={{ background: 'rgba(0, 230, 118, 0.15)', color: '#00e676' }}>{r.status}</span>
                                    <span className="date">{new Date(r.due_at).toLocaleString()}</span>
                                </div>
                                <div className="mem-content" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '8px', color: '#fff' }}>{r.title}</div>
                                <div className="mem-content" style={{ color: '#aaa' }}>{r.body}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mem-column">
                    <div className="glass-panel" style={{ padding: '20px', background: '#1a1a1a', border: '1px solid rgba(255, 77, 77, 0.2)' }}>
                        <h3 style={{ color: '#ff4d4d', marginBottom: '15px', fontSize: '1.2rem' }}>Create New Job</h3>
                        <form onSubmit={handleCreateJob}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', color: '#888', marginBottom: '5px', fontSize: '0.9rem' }}>Job Content</label>
                                <textarea
                                    value={newJobContent}
                                    onChange={(e) => setNewJobContent(e.target.value)}
                                    placeholder="What should the agent do?"
                                    style={{
                                        width: '100%',
                                        background: '#0a0a0a',
                                        border: '1px solid #333',
                                        color: '#fff',
                                        padding: '10px',
                                        borderRadius: '4px',
                                        minHeight: '80px',
                                        resize: 'vertical'
                                    }}
                                    required
                                />
                            </div>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', color: '#888', marginBottom: '5px', fontSize: '0.9rem' }}>Schedule Date</label>
                                <input
                                    type="date"
                                    value={jobDate}
                                    onChange={(e) => setJobDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        background: '#0a0a0a',
                                        border: '1px solid #333',
                                        color: '#fff',
                                        padding: '10px',
                                        borderRadius: '4px'
                                    }}
                                    required
                                />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', color: '#888', marginBottom: '5px', fontSize: '0.9rem' }}>Schedule Time</label>
                                <input
                                    type="time"
                                    value={jobTime}
                                    onChange={(e) => setJobTime(e.target.value)}
                                    style={{
                                        width: '100%',
                                        background: '#0a0a0a',
                                        border: '1px solid #333',
                                        color: '#fff',
                                        padding: '10px',
                                        borderRadius: '4px'
                                    }}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isCreating}
                                style={{
                                    width: '100%',
                                    background: '#ff4d4d',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '12px',
                                    borderRadius: '4px',
                                    fontWeight: 'bold',
                                    cursor: isCreating ? 'not-allowed' : 'pointer',
                                    opacity: isCreating ? 0.7 : 1,
                                    transition: 'all 0.2s'
                                }}
                            >
                                {isCreating ? 'Creating...' : 'Schedule Job'}
                            </button>
                            {statusMsg && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    fontSize: '0.9rem',
                                    background: statusMsg.type === 'success' ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                                    color: statusMsg.type === 'success' ? '#00e676' : '#ff4d4d',
                                    border: `1px solid ${statusMsg.type === 'success' ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 77, 77, 0.3)'}`
                                }}>
                                    {statusMsg.text}
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
