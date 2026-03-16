registerTab('health', async (root) => {
    const health = await fetchApi('/api/health');
    const tiers = await fetchApi('/api/health/tiers');
    const errors = await fetchApi('/api/health/errors');

    const renderTier = (name, data) => {
        let color = data.status === 'healthy' ? '#4cd137' : (data.status === 'degraded' ? '#fbc531' : '#e84118');
        if (data.status === 'not_configured') color = '#7f8fa6';

        return `<div class="card" style="border-top: 4px solid ${color}">
            <h3>${name}</h3>
            <div style="font-size: 18px; font-weight: bold; color: ${color}; text-transform: uppercase;">${data.status}</div>
            <p style="font-size: 12px; margin-top: 8px; color: var(--text-secondary);">${data.details}</p>
        </div>`;
    };

    let errorsHtml = '';
    if (errors.length) {
        errorsHtml = `<table style="font-size:12px;">
            <tr><th>Time</th><th>Action</th><th>Details</th></tr>
            ${errors.map(e => `
                <tr>
                    <td>${new Date(e.timestamp).toLocaleString()}</td>
                    <td>${e.action}</td>
                    <td class="mono">${JSON.stringify(e.details || {})}</td>
                </tr>
            `).join('')}
        </table>`;
    } else {
        errorsHtml = '<p>No recent errors.</p>';
    }

    root.innerHTML = `
        <div class="grid-cards">
            ${renderTier('Local SQLite', tiers.sqlite || { status: 'down', details: 'Unknown' })}
            ${renderTier('Supabase', tiers.supabase || { status: 'down', details: 'Unknown' })}
            ${renderTier('Pinecone', tiers.pinecone || { status: 'down', details: 'Unknown' })}
        </div>
        
        <div class="grid-cards">
            <div class="card">
                <h3>Uptime</h3>
                <div class="value">${(health.uptime ? health.uptime / 3600 : 0).toFixed(2)}h</div>
            </div>
            <div class="card">
                <h3>CPU Model</h3>
                <div class="value" style="font-size:14px;">${health.cpu || 'Unknown'}</div>
            </div>
            <div class="card">
                <h3>Mem Usage (Heap)</h3>
                <div class="value">${health.memory ? (health.memory.heapUsed / 1024 / 1024).toFixed(2) : 0} MB</div>
            </div>
        </div>

        <div class="module-section" style="border-color: var(--highlight-color);">
            <h3 style="color: var(--highlight-color);">Recent Errors Log</h3>
            <br>
            <div style="max-height: 400px; overflow-y: auto;">
                ${errorsHtml}
            </div>
        </div>
    `;
});
