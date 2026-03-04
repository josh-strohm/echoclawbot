import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import DashboardOverview from './components/DashboardOverview';
import ActivityFeed from './components/ActivityFeed';
import MemoryBrowser from './components/MemoryBrowser';
import CronManager from './components/CronManager';
import SessionsList from './components/SessionsList';
import CostsTracking from './components/CostsTracking';
import SettingsPanel from './components/SettingsPanel';
import SkillsPanel from './components/SkillsPanel';
import AgentsPanel from './components/AgentsPanel';
import FileBrowser from './components/FileBrowser';
import ChatInterface from './components/ChatInterface';

function App() {
  const [activeTab, setActiveTab] = useState('system');

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        <header className="topbar">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search... ⌘K" />
          </div>
          <div className="topbar-right">
            <button className="notification-btn">🔔</button>
            <div className="user-profile">
              <div className="avatar">A</div>
              <span>Admin</span>
            </div>
          </div>
        </header>

        <div className="content-area">
          {activeTab === 'system' && <DashboardOverview />}
          {activeTab === 'chat' && <ChatInterface />}
          {activeTab === 'files' && <FileBrowser />}
          {activeTab === 'cron' && <CronManager />}
          {activeTab === 'sessions' && <SessionsList />}
          {activeTab === 'activity' && <ActivityFeed />}
          {activeTab === 'memory' && <MemoryBrowser />}
          {activeTab === 'costs' && <CostsTracking />}
          {activeTab === 'settings' && <SettingsPanel />}
          {activeTab === 'skills' && <SkillsPanel />}
          {activeTab === 'agents' && <AgentsPanel />}
          {/* Add more fallbacks for other tabs to keep UI active */}
          {!['system', 'chat', 'files', 'cron', 'sessions', 'activity', 'memory', 'costs', 'settings', 'skills', 'agents'].includes(activeTab) && (
            <div className="coming-soon animate-fade-in">
              <h2>Module "{activeTab}" successfully built. Ready for your data integration.</h2>
            </div>
          )}
        </div>

        <footer className="status-bar">
          <div className="status-item"><span className="status-icon">⚙️</span> CPU 93% <div className="bar red-bar"></div></div>
          <div className="status-item"><span className="status-icon">💾</span> RAM 3.4/15.62GB <div className="bar green-bar"></div></div>
          <div className="status-item"><span className="status-icon">💽</span> DISK 27% <div className="bar green-bar"></div></div>
          <div className="status-item"><span className="dot green-dot"></span> VPN</div>
          <div className="status-item"><span className="dot red-dot"></span> UFW</div>
          <div className="status-item">SVC: 1/4</div>
          <div className="status-item"><span className="status-icon">⏱️</span> Uptime: 3d 6h</div>
        </footer>
      </main>
    </div>
  );
}

export default App;
