registerTab('activity', async (root) => {
    const stats = await fetchApi('/api/activity/stats');
    const recent = await fetchApi('/api/activity/recent?limit=50');

    let rowsHtml = '';
    if (recent.length) {
        rowsHtml = `<table>
            <tr><th style="width:150px;">Time</th><th>Action & Results</th><th style="width:100px;">Status</th></tr>
            ${recent.map(r => {
            let detailsText = r.details;
            try {
                const parsed = JSON.parse(r.details);
                detailsText = JSON.stringify(parsed, null, 2);
            } catch (e) { }

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="vertical-align:top; font-size:12px; padding-top:12px;">${new Date(r.timestamp).toLocaleString()}</td>
                    <td style="padding-top:12px; padding-bottom:12px;">
                        <strong style="color:var(--text-primary);">${r.action}</strong>
                        <pre style="margin-top:8px; font-size:11px; background:var(--surface-color); padding:8px; border-radius:4px; max-height:150px; overflow-y:auto; color:var(--text-secondary); white-space:pre-wrap; word-break:break-all;">${detailsText}</pre>
                    </td>
                    <td style="vertical-align:top; padding-top:12px; color:${r.status === 'success' ? '#4cd137' : '#e84118'}">${r.status}</td>
                </tr>
            `}).join('')}
        </table>`;
    } else {
        rowsHtml = '<p>No recent activity found in Supabase.</p>';
    }

    root.innerHTML = `
        <div class="grid-cards">
            <div class="card">
                <h3>Total Actions</h3>
                <div class="value">${stats.total || 0}</div>
            </div>
            <div class="card">
                <h3>Success Rate</h3>
                <div class="value">${stats.successRate ? stats.successRate.toFixed(1) : 0}%</div>
            </div>
            <div class="card">
                <h3>Most Common</h3>
                <div class="value" style="font-size:24px;">${stats.mostCommon || 'N/A'}</div>
            </div>
        </div>

        <div class="module-section">
            <h3>Live Activity Feed</h3>
            <br>
            <div style="overflow-y:auto; max-height: 400px; border-radius:8px;">
                ${rowsHtml}
            </div>
        </div>
    `;
});
