import './Sidebar.css';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
    const tabs = [
        { id: 'system', name: 'System', icon: '💻' },
        { id: 'chat', name: 'Chat', icon: '💬' },
        { id: 'files', name: 'Files', icon: '📁' },
        { id: 'memory', name: 'Memory', icon: '🧠' },
        { id: 'agents', name: 'Agents', icon: '🤖' },
        { id: 'activity', name: 'Activity', icon: '📈' },
        { id: 'cron', name: 'Cron', icon: '⏱️' },
        { id: 'sessions', name: 'Sessions', icon: '👥' },
        { id: 'skills', name: 'Skills', icon: '🧩' },
        { id: 'costs', name: 'Costs', icon: '💲' },
        { id: 'settings', name: 'Settings', icon: '⚙️' },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <span className="lobster-icon">🦞</span>
            </div>

            <nav className="sidebar-nav">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="nav-icon">{tab.icon}</span>
                        <span className="nav-label">{tab.name}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
}
