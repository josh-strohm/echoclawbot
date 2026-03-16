registerTab('memory', async (root) => {
    const stats = await fetchApi('/api/memory/stats');
    const facts = await fetchApi('/api/memory/core-facts');

    let factsHtml = '';
    for (const [cat, list] of Object.entries(facts)) {
        factsHtml += `<div style="margin-bottom:15px; background:var(--bg-color); padding:10px; border-radius:8px;">
            <h4 style="color:var(--highlight-color); margin-bottom:10px;">Category: ${cat}</h4>
            <ul>
                ${list.map(f => `<li style="margin-bottom:5px;">
                    ${f.content} (Imp: ${f.importance}) 
                    <button style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer;" onclick="deleteFact(${f.id})">[X]</button>
                </li>`).join('')}
            </ul>
        </div>`;
    }

    if (factsHtml === '') factsHtml = '<p>No core facts stored.</p>';

    root.innerHTML = `
        <div class="grid-cards">
            <div class="card">
                <h3>Total Core Facts</h3>
                <div class="value">${stats.coreFacts || 0}</div>
            </div>
            <div class="card">
                <h3>Total Messages</h3>
                <div class="value">${stats.messages || 0}</div>
            </div>
            <div class="card">
                <h3>Total Summaries</h3>
                <div class="value">${stats.summaries || 0}</div>
            </div>
            <div class="card">
                <h3>Local Vectors</h3>
                <div class="value">${stats.vectors || 0}</div>
            </div>
        </div>

        <div class="module-section">
            <h3>Core Facts Inspector</h3>
            <br>
            ${factsHtml}
        </div>
    `;

    window.deleteFact = async (id) => {
        if (confirm('Delete this fact?')) {
            await fetchApi(`/api/memory/core-facts/${id}`, { method: 'DELETE' });
            loadCurrentTab();
        }
    };
});
