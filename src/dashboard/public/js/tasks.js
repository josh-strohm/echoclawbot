registerTab('tasks', async (root) => {
    const tasks = await fetchApi('/api/tasks');

    const grouped = {
        'Todo': tasks.filter(t => t.status === 'Todo'),
        'In Progress': tasks.filter(t => t.status === 'In Progress'),
        'Completed': tasks.filter(t => t.status === 'Done' || t.status === 'Failed')
    };

    const renderCard = (t) => `
        <div style="background:var(--bg-color); padding:15px; border-radius:8px; margin-bottom:10px; border-left:4px solid ${t.status === 'Done' ? '#4cd137' : (t.status === 'Failed' ? '#e84118' : (t.status === 'In Progress' ? '#f39c12' : '#0f3460'))}; cursor:grab; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <strong style="font-size:14px; margin-bottom:10px; display:block;">${t.title}</strong>
                <button style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px;" onclick="deleteTask(${t.id})">&times;</button>
            </div>
            ${t.status !== 'Todo' ? `<div style="font-size:12px; color:var(--text-secondary); background:var(--surface-color); padding:6px; border-radius:4px; max-height:80px; overflow-y:auto;">${t.progress_notes ? t.progress_notes.substring(0, 100) + '...' : 'No notes.'}</div>` : ''}
        </div>
    `;

    root.innerHTML = `
        <div class="grid-cards" style="grid-template-columns: 1fr; margin-bottom:20px;">
            <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1;">
                    <h3 style="margin-bottom:10px;">Agent Kanban Board</h3>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="newTaskTitle" placeholder="What should the agent do...?" style="flex:1; padding:10px; border-radius:6px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--accent-color);">
                        <button onclick="createTask()" style="padding:10px 20px; background:var(--highlight-color); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Drop Task</button>
                    </div>
                </div>
            </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px; min-height:600px;">
            <div style="background:var(--surface-color); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                    <h3 style="margin:0; font-size:16px;">To Do</h3>
                    <span style="background:var(--bg-color); padding:2px 8px; border-radius:12px; font-size:12px;">${grouped['Todo'].length}</span>
                </div>
                <div>${grouped['Todo'].map(renderCard).join('') || '<div style="color:var(--text-secondary); text-align:center; padding:20px; font-size:14px;">Empty</div>'}</div>
            </div>

            <div style="background:var(--surface-color); padding:15px; border-radius:12px; border:1px solid rgba(243, 156, 18, 0.2);">
                <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                    <h3 style="margin:0; font-size:16px; color:#f39c12;">In Progress</h3>
                    <span style="background:var(--bg-color); padding:2px 8px; border-radius:12px; font-size:12px;">${grouped['In Progress'].length}</span>
                </div>
                <div>${grouped['In Progress'].map(renderCard).join('') || '<div style="color:var(--text-secondary); text-align:center; padding:20px; font-size:14px;">Empty</div>'}</div>
            </div>

            <div style="background:var(--surface-color); padding:15px; border-radius:12px; border:1px solid rgba(76, 209, 55, 0.2);">
                <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                    <h3 style="margin:0; font-size:16px; color:#4cd137;">Completed</h3>
                    <span style="background:var(--bg-color); padding:2px 8px; border-radius:12px; font-size:12px;">${grouped['Completed'].length}</span>
                </div>
                <div>${grouped['Completed'].map(renderCard).join('') || '<div style="color:var(--text-secondary); text-align:center; padding:20px; font-size:14px;">Empty</div>'}</div>
            </div>
        </div>
    `;

    window.updateTaskStatus = async (id, status) => {
        await fetchApi(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        loadCurrentTab();
    };

    window.deleteTask = async (id) => {
        if (confirm('Delete task?')) {
            await fetchApi(`/api/tasks/${id}`, { method: 'DELETE' });
            loadCurrentTab();
        }
    };

    window.createTask = async () => {
        const t = document.getElementById('newTaskTitle').value;
        if (!t) return;
        await fetchApi(`/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: t })
        });
        loadCurrentTab();
    };
});
