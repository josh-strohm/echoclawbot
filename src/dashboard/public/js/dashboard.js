registerTab('dashboard', async (root) => {
    const stats = await fetchApi('/api/activity/stats');
    const health = await fetchApi('/api/health');

    const errorCount = (await fetchApi('/api/health/errors')).length;

    const agents = await fetchApi('/api/agents');

    root.innerHTML = `
        <div class="grid-cards">
            <div class="card">
                <h3>Total Activities</h3>
                <div class="value">${stats.total || 0}</div>
            </div>
            <div class="card">
                <h3>Success Rate</h3>
                <div class="value">${stats.successRate ? stats.successRate.toFixed(1) : 0}%</div>
            </div>
            <div class="card">
                <h3>System Uptime</h3>
                <div class="value">${(health.uptime / 3600).toFixed(1)}h</div>
            </div>
            <div class="card" style="border-color: var(--highlight-color);">
                <h3>Recent Errors</h3>
                <div class="value" style="color: var(--highlight-color);">${errorCount}</div>
            </div>
        </div>
        
        <div class="module-section">
            <h2>Multi-Agent System</h2>
            <br>
            <div class="grid-cards">
                ${agents.map(a => `
                <div class="card" style="text-align: center; border-top: 4px solid ${a.status === 'online' ? '#4cd137' : '#e84118'};">
                    <h3>${a.name}</h3>
                    <div style="color: ${a.status === 'online' ? '#4cd137' : '#e84118'}; font-weight: bold; margin-top: 10px;">
                        ${a.status === 'online' ? '🟢 Connected' : '🔴 Offline'}
                    </div>
                </div>
                `).join('') || '<p>No agents available.</p>'}
            </div>
        </div>
    `;
});
