registerTab('costs', async (root) => {
    const summary = await fetchApi('/api/costs/summary');
    const timeline = await fetchApi('/api/costs/timeline');
    const byModel = await fetchApi('/api/costs/by-model');
    const byService = await fetchApi('/api/costs/by-service');

    const rootEl = root;
    rootEl.innerHTML = `
        <div class="grid-cards">
            <div class="card">
                <h3>Total Spend (USD)</h3>
                <div class="value">$${(summary.spend || 0).toFixed(4)}</div>
            </div>
            <div class="card">
                <h3>Total Tokens</h3>
                <div class="value">${summary.tokens || 0}</div>
            </div>
            <div class="card">
                <h3>Total Requests</h3>
                <div class="value">${summary.requests || 0}</div>
            </div>
            <div class="card">
                <h3>Avg Cost / Req</h3>
                <div class="value">$${(summary.avgCost || 0).toFixed(4)}</div>
            </div>
        </div>
        
        <div class="module-section">
            <h3>Spend Over Time</h3>
            <div style="position: relative; height:300px; width:100%;">
                <canvas id="spendChart" style="background:#1a1a2e; border-radius:8px; padding:10px;"></canvas>
            </div>
        </div>
        
        <div class="module-section">
            <h3>Cost By Provider</h3>
            <div style="position: relative; height:300px; width:100%;">
                <canvas id="serviceChart" style="background:#1a1a2e; border-radius:8px; padding:10px;"></canvas>
            </div>
        </div>

        <div class="module-section">
            <h3>Cost By Model</h3>
            <div style="position: relative; height:300px; width:100%;">
                <canvas id="modelChart" style="background:#1a1a2e; border-radius:8px; padding:10px;"></canvas>
            </div>
        </div>
    `;

    // Only draw charts if we are still on the costs tab
    setTimeout(() => {
        if (!document.getElementById('spendChart')) return;

        if (window.spendChartInstance) window.spendChartInstance.destroy();
        if (window.modelChartInstance) window.modelChartInstance.destroy();
        if (window.serviceChartInstance) window.serviceChartInstance.destroy();

        const ctx1 = document.getElementById('spendChart').getContext('2d');
        window.spendChartInstance = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: timeline.map(t => t.time),
                datasets: [{
                    label: 'Spend ($)',
                    data: timeline.map(t => t.cost),
                    borderColor: '#e94560',
                    backgroundColor: 'rgba(233, 69, 96, 0.2)',
                    fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        const ctx2 = document.getElementById('modelChart').getContext('2d');
        window.modelChartInstance = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: byModel.map(m => m.model),
                datasets: [{
                    label: 'Cost by Model ($)',
                    data: byModel.map(m => m.cost),
                    backgroundColor: '#0f3460'
                }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
        });

        const ctx3 = document.getElementById('serviceChart').getContext('2d');
        window.serviceChartInstance = new Chart(ctx3, {
            type: 'pie',
            data: {
                labels: byService.map(s => s.service),
                datasets: [{
                    label: 'Cost by Provider ($)',
                    data: byService.map(s => s.cost),
                    backgroundColor: ['#e94560', '#0f3460', '#4cd137', '#f39c12', '#9b59b6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }, 100);
});
