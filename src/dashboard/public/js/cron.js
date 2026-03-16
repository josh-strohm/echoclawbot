(function () {
    // Persistent state for cron tab
    let isInitialized = false;

    // Helper to refresh tab if we are on the cron tab
    const refresh = () => {
        if (window.location.hash.includes('cron')) {
            loadCurrentTab();
        }
    };

    // Global listener handler for table actions
    const handleTableClick = async (e) => {
        if (!window.location.hash.includes('cron')) return;

        const runBtn = e.target.closest('.btn-run');
        const toggleBtn = e.target.closest('.btn-toggle');
        const deleteBtn = e.target.closest('.btn-delete');

        if (runBtn) {
            const id = runBtn.dataset.id;
            console.log('[Cron UI] Manual Run Clicked:', id);
            runBtn.innerHTML = '...';
            const res = await fetchApi('/api/cron/jobs/' + id + '/run', { method: 'POST' });
            console.log('[Cron UI] Run Result:', res);
            refresh();
        } else if (toggleBtn) {
            const id = toggleBtn.dataset.id;
            console.log('[Cron UI] Toggle Clicked:', id);
            const status = toggleBtn.dataset.status;
            toggleBtn.innerHTML = '...';
            const res = await fetchApi('/api/cron/jobs/' + id + '/toggle', { method: 'POST' });
            console.log('[Cron UI] Toggle Result:', res);
            refresh();
        } else if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            console.log('[Cron UI] Delete Clicked:', id);
            if (!confirm('Permanently delete this scheduled job?')) return;

            // OPTIMISTIC UI: Remove row immediately from view
            const row = deleteBtn.closest('tr');
            if (row) row.remove();

            const res = await fetchApi('/api/cron/jobs/' + id + '/delete', { method: 'POST' });
            console.log('[Cron UI] Delete Result:', res);
            refresh();
        }
    };

    registerTab('cron', async (root) => {
        // Ensure static listener is attached to root DIV only once
        if (!isInitialized) {
            const contentArea = document.getElementById('main-content');
            if (contentArea) {
                contentArea.addEventListener('click', handleTableClick);
                isInitialized = true;
                console.log('[Cron UI] Static event delegation initialized on main-content');
            }
        }

        const jobs = await fetchApi('/api/cron/jobs?cb=' + Date.now());
        const history = await fetchApi('/api/cron/history?cb=' + Date.now());

        const sortedJobs = (jobs || []).sort((a, b) => b.id - a.id);

        let jobsHtml = '';
        if (sortedJobs.length) {
            jobsHtml = `<div style="overflow-x:auto;"><table>
                <tr><th>Job Name</th><th>Description</th><th>Schedule</th><th>Status</th><th>Actions</th></tr>
                ${sortedJobs.map(j => `
                    <tr data-job-id="${j.id}">
                        <td class="mono" style="color:var(--highlight-color); font-weight:bold;">${j.name}</td>
                        <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${j.description || ''}</td>
                        <td><span style="background:var(--bg-color); padding:4px 8px; border-radius:4px; border:1px solid var(--accent-border);" class="mono">${j.schedule}</span></td>
                        <td style="color:${j.status === 'active' ? 'var(--success-color)' : 'var(--danger-color)'}; font-weight:bold; font-size:12px; text-transform:uppercase;">${j.status}</td>
                        <td>
                            <div style="display:flex; gap:6px;">
                                <button class="btn-run" data-id="${j.id}" title="Run Now" style="padding:4px 8px; background:rgba(255,255,255,0.1); color:white;">▶</button>
                                <button class="btn-toggle" data-id="${j.id}" data-status="${j.status}" title="${j.status === 'active' ? 'Pause' : 'Resume'}" style="padding:4px 8px; background:rgba(255,255,255,0.1); color:white;">
                                    ${j.status === 'active' ? '⏸' : '⏯'}
                                </button>
                                <button class="btn-delete" data-id="${j.id}" title="Delete" style="padding:4px 8px; background:rgba(232, 65, 24, 0.2); color:#e84118; border:1px solid #e84118;">🗑</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </table></div>`;
        } else {
            jobsHtml = '<div style="text-align:center; padding:40px; color:var(--text-secondary);"><p>No scheduled jobs found. Create one above to get started.</p></div>';
        }

        let historyHtml = '';
        if (history && history.length) {
            historyHtml = `<table>
                <tr><th>Time</th><th>Job</th><th>Status</th><th>Output</th></tr>
                ${history.map(h => `
                    <tr>
                        <td style="white-space:nowrap; font-size:12px;">${new Date(h.timestamp).toLocaleString()}</td>
                        <td class="mono" style="color:var(--highlight-color); font-size:13px;">${h.job_name}</td>
                        <td><span style="padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; background:${h.status === 'success' ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 61, 0, 0.1)'}; color:${h.status === 'success' ? 'var(--success-color)' : 'var(--danger-color)'};">${h.status.toUpperCase()}</span></td>
                        <td style="font-size:12px; color:var(--text-secondary); max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${h.output}</td>
                    </tr>
                `).join('')}
            </table>`;
        } else {
            historyHtml = '<p style="padding:20px; color:var(--text-secondary);">No execution history found.</p>';
        }

        root.innerHTML = `
            <div class="module-section" style="margin-bottom:24px; border-left: 4px solid var(--highlight-color);">
                <h3 style="margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:20px;">➕</span> Create New Scheduled Job
                </h3>
                
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; margin-bottom:15px;">
                    <div style="flex:2;">
                        <label class="form-label">Job Name</label>
                        <input type="text" id="newCronName" placeholder="e.g. Daily Coffee Reminder" class="form-control">
                    </div>
                    <div>
                        <label class="form-label">Type</label>
                        <div class="toggle-group" id="cronTypeToggle" style="width:100%;">
                            <button class="active" data-type="once" style="flex:1;">ONE-TIME</button>
                            <button data-type="recurring" style="flex:1;">RECURRING</button>
                        </div>
                    </div>
                </div>

                <div id="recurrenceOptions" style="display:none; margin-bottom:15px; grid-template-columns: 1fr 1.5fr; gap:20px;">
                    <div>
                        <label class="form-label">Frequency</label>
                        <select id="recurringFreq" class="form-control">
                            <option value="daily">Once a Day (Daily)</option>
                            <option value="weekly">Once a Week (Weekly)</option>
                            <option value="monthly">Once a Month (Monthly)</option>
                            <option value="hourly">Every Hour</option>
                            <option value="interval">Interval (Every X...)</option>
                        </select>
                    </div>
                    <div id="freqDetailContainer">
                        <!-- Dynamic Frequency Details -->
                    </div>
                </div>

                <div id="onceOptions" style="margin-bottom:15px;">
                    <label class="form-label" id="onceLabel">Execution Date & Time</label>
                    <input type="datetime-local" id="newCronDatetime" class="form-control">
                </div>

                <div style="margin-bottom:20px;">
                    <label class="form-label">Task Description / Instructions</label>
                    <textarea id="newCronDesc" rows="3" placeholder="Instructions for the agent..." class="form-control" style="resize:none;"></textarea>
                </div>

                <button id="btn-create-cron" style="width:100%; height:48px; background:var(--highlight-color); color:black; font-weight:bold; font-size:16px;">CREATE JOB</button>
            </div>

            <div class="module-section" style="margin-bottom:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">📅</span> Active Schedules
                        <span style="font-size:12px; color:var(--highlight-color); background:var(--accent-color); padding:2px 8px; border-radius:10px; margin-left:10px;">${sortedJobs.length} Jobs</span>
                    </h3>
                    <button id="btn-clear-all" style="padding:6px 12px; background:rgba(232, 65, 24, 0.1); color:#e84118; border:1px solid #e84118; border-radius:4px; font-size:12px; font-weight:bold; box-shadow:none;">DELETE ALL JOBS</button>
                </div>
                <div style="margin-top:20px;">
                    ${jobsHtml}
                </div>
            </div>

            <div class="module-section">
                <h3 style="margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:20px;">📜</span> Execution History
                </h3>
                <div style="overflow-y:auto; max-height:400px; border-radius:8px; background:rgba(0,0,0,0.2);">
                    ${historyHtml}
                </div>
            </div>
        `;

        // UI Handlers
        const onceOptions = document.getElementById('onceOptions');
        const recurringOptions = document.getElementById('recurrenceOptions');
        const freqDetailContainer = document.getElementById('freqDetailContainer');
        const recurringFreq = document.getElementById('recurringFreq');
        const dtInput = document.getElementById('newCronDatetime');
        
        // Default to 1 hour from now
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        dtInput.value = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

        let currentType = 'once';

        const updateFreqDetails = () => {
            const freq = recurringFreq.value;
            if (freq === 'daily') {
                freqDetailContainer.innerHTML = `
                    <label class="form-label">At what time?</label>
                    <input type="time" id="newCronTime" class="form-control" value="09:00">
                `;
            } else if (freq === 'weekly') {
                freqDetailContainer.innerHTML = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <label class="form-label">On which day?</label>
                            <select id="newCronDayOfWeek" class="form-control">
                                <option value="0">Sunday</option>
                                <option value="1">Monday</option>
                                <option value="2">Tuesday</option>
                                <option value="3">Wednesday</option>
                                <option value="4">Thursday</option>
                                <option value="5">Friday</option>
                                <option value="6">Saturday</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label">At what time?</label>
                            <input type="time" id="newCronTime" class="form-control" value="09:00">
                        </div>
                    </div>
                `;
            } else if (freq === 'monthly') {
                freqDetailContainer.innerHTML = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <label class="form-label">On day of month</label>
                            <input type="number" id="newCronDayOfMonth" min="1" max="31" class="form-control" value="1">
                        </div>
                        <div>
                            <label class="form-label">At what time?</label>
                            <input type="time" id="newCronTime" class="form-control" value="09:00">
                        </div>
                    </div>
                `;
            } else if (freq === 'hourly') {
                freqDetailContainer.innerHTML = `
                    <label class="form-label">Minute of the hour</label>
                    <input type="number" id="newCronMinute" min="0" max="59" class="form-control" value="0">
                `;
            } else if (freq === 'interval') {
                freqDetailContainer.innerHTML = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                        <div>
                            <label class="form-label">Every</label>
                            <input type="number" id="newCronIntervalValue" min="1" class="form-control" value="2">
                        </div>
                        <div>
                            <label class="form-label">Unit</label>
                            <select id="newCronIntervalUnit" class="form-control">
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                                <option value="weeks">Weeks</option>
                                <option value="months">Months</option>
                                <option value="years">Years</option>
                            </select>
                        </div>
                    </div>
                    <div id="intervalSubSettings"></div>
                `;
                
                const unitSelect = document.getElementById('newCronIntervalUnit');
                const subSettings = document.getElementById('intervalSubSettings');
                
                const updateSubSettings = () => {
                    const unit = unitSelect.value;
                    if (unit === 'minutes') {
                        subSettings.innerHTML = '';
                    } else if (unit === 'hours') {
                        subSettings.innerHTML = `
                            <label class="form-label">At minute</label>
                            <input type="number" id="newCronIntervalMinute" min="0" max="59" class="form-control" value="0">
                        `;
                    } else if (unit === 'days') {
                        subSettings.innerHTML = `
                            <label class="form-label">At what time?</label>
                            <input type="time" id="newCronIntervalTime" class="form-control" value="09:00">
                        `;
                    } else if (unit === 'weeks') {
                        subSettings.innerHTML = `
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="form-label">On which day?</label>
                                    <select id="newCronIntervalDayOfWeek" class="form-control">
                                        <option value="0">Sunday</option>
                                        <option value="1">Monday</option>
                                        <option value="2">Tuesday</option>
                                        <option value="3">Wednesday</option>
                                        <option value="4">Thursday</option>
                                        <option value="5">Friday</option>
                                        <option value="6">Saturday</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="form-label">At what time?</label>
                                    <input type="time" id="newCronIntervalTime" class="form-control" value="09:00">
                                </div>
                            </div>
                        `;
                    } else if (unit === 'months') {
                        subSettings.innerHTML = `
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="form-label">On day of month</label>
                                    <input type="number" id="newCronIntervalDayOfMonth" min="1" max="31" class="form-control" value="1">
                                </div>
                                <div>
                                    <label class="form-label">At what time?</label>
                                    <input type="time" id="newCronIntervalTime" class="form-control" value="09:00">
                                </div>
                            </div>
                        `;
                    } else if (unit === 'years') {
                        subSettings.innerHTML = `
                            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="form-label">Month</label>
                                    <select id="newCronIntervalMonth" class="form-control">
                                        <option value="1">January</option>
                                        <option value="2">February</option>
                                        <option value="3">March</option>
                                        <option value="4">April</option>
                                        <option value="5">May</option>
                                        <option value="6">June</option>
                                        <option value="7">July</option>
                                        <option value="8">August</option>
                                        <option value="9">September</option>
                                        <option value="10">October</option>
                                        <option value="11">November</option>
                                        <option value="12">December</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="form-label">Day</label>
                                    <input type="number" id="newCronIntervalDayOfMonth" min="1" max="31" class="form-control" value="1">
                                </div>
                                <div>
                                    <label class="form-label">Time</label>
                                    <input type="time" id="newCronIntervalTime" class="form-control" value="09:00">
                                </div>
                            </div>
                        `;
                    }
                };
                
                unitSelect.onchange = updateSubSettings;
                updateSubSettings();
            }
        };

        const toggleBtns = document.querySelectorAll('#cronTypeToggle button');
        toggleBtns.forEach(btn => {
            btn.onclick = () => {
                toggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentType = btn.dataset.type;
                if (currentType === 'once') {
                    onceOptions.style.display = 'block';
                    recurringOptions.style.display = 'none';
                } else {
                    onceOptions.style.display = 'none';
                    recurringOptions.style.display = 'grid';
                    updateFreqDetails();
                }
            };
        });

        recurringFreq.onchange = updateFreqDetails;

        const createBtn = document.getElementById('btn-create-cron');
        if (createBtn) {
            createBtn.onclick = async (e) => {
                const name = document.getElementById('newCronName').value;
                const description = document.getElementById('newCronDesc').value;

                let schedule = '';
                if (currentType === 'once') {
                    const dtInput = document.getElementById('newCronDatetime');
                    if (!dtInput.value) return alert('Select execution date and time.');
                    const dt = new Date(dtInput.value);
                    schedule = `${dt.getMinutes()} ${dt.getHours()} ${dt.getDate()} ${dt.getMonth() + 1} *`;
                } else {
                    const freq = recurringFreq.value;
                    if (freq === 'daily') {
                        const time = document.getElementById('newCronTime').value.split(':');
                        schedule = `${time[1]} ${time[0]} * * *`;
                    } else if (freq === 'weekly') {
                        const time = document.getElementById('newCronTime').value.split(':');
                        const day = document.getElementById('newCronDayOfWeek').value;
                        schedule = `${time[1]} ${time[0]} * * ${day}`;
                    } else if (freq === 'monthly') {
                        const time = document.getElementById('newCronTime').value.split(':');
                        const day = document.getElementById('newCronDayOfMonth').value;
                        schedule = `${time[1]} ${time[0]} ${day} * *`;
                    } else if (freq === 'hourly') {
                        const min = document.getElementById('newCronMinute').value;
                        schedule = `${min} * * * *`;
                    } else if (freq === 'interval') {
                        const val = parseInt(document.getElementById('newCronIntervalValue').value) || 1;
                        const unit = document.getElementById('newCronIntervalUnit').value;
                        
                        const timeInput = document.getElementById('newCronIntervalTime');
                        let [h, m] = timeInput ? timeInput.value.split(':') : ['09', '00'];
                        
                        if (unit === 'minutes') {
                            schedule = `*/${val} * * * *`;
                        } else if (unit === 'hours') {
                            const minVal = document.getElementById('newCronIntervalMinute').value || '0';
                            schedule = `${minVal} */${val} * * *`;
                        } else if (unit === 'days') {
                            schedule = `${m} ${h} */${val} * *`;
                        } else if (unit === 'weeks') {
                            const dow = document.getElementById('newCronIntervalDayOfWeek').value;
                            // Approximating 'Every X Weeks' using days */(X*7)
                            // This anchors to the scheduled day of month logic in cron
                            if (val === 1) {
                                schedule = `${m} ${h} * * ${dow}`;
                            } else {
                                schedule = `${m} ${h} */${val * 7} * *`;
                            }
                        } else if (unit === 'months') {
                            const dom = document.getElementById('newCronIntervalDayOfMonth').value || '1';
                            schedule = `${m} ${h} ${dom} */${val} *`;
                        } else if (unit === 'years') {
                            const month = document.getElementById('newCronIntervalMonth').value || '1';
                            const dom = document.getElementById('newCronIntervalDayOfMonth').value || '1';
                            // Years is mostly a reminder to run "Once a Year" on a date if val=1
                            // Cron doesn't support Every X Years well, so we default to annual
                            schedule = `${m} ${h} ${dom} ${month} *`;
                        }
                    }
                }

                if (!name || !schedule) return alert('Missing required fields.');
                createBtn.innerHTML = 'Creating...';
                await fetchApi('/api/cron/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: `[${currentType.toUpperCase()}] ${name}`, schedule, description })
                });
                refresh();
            };
        }

        const clearBtn = document.getElementById('btn-clear-all');
        if (clearBtn) {
            clearBtn.onclick = async () => {
                if (!confirm('Delete ALL jobs?')) return;
                // OPTIMISTIC UI: Clear list
                root.querySelector('table')?.remove();
                await fetchApi('/api/cron/jobs', { method: 'DELETE' });
                refresh();
            };
        }
    });
})();
