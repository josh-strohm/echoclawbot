const state = {
    token: localStorage.getItem('DASHBOARD_AUTH_TOKEN') || '',
    timeRange: localStorage.getItem('DASHBOARD_TIME_RANGE') || '24h'
};

document.getElementById('timeRangeSelector').value = state.timeRange;
document.getElementById('timeRangeSelector').addEventListener('change', (e) => {
    state.timeRange = e.target.value;
    localStorage.setItem('DASHBOARD_TIME_RANGE', state.timeRange);
    loadCurrentTab();
});

async function checkAuth() {
    // If we already have a token in state, verify it directly with the Authorization header
    const res = await fetchApi('/api/health');
    if (res.error === 'Unauthorized') {
        // Clear any bad token that may be stored
        localStorage.removeItem('DASHBOARD_AUTH_TOKEN');
        state.token = '';
        const t = prompt('Enter Dashboard Auth Token:');
        if (t) {
            // Verify the token actually works before saving it
            const verifyRes = await fetch('/api/health', {
                headers: { 'Authorization': `Bearer ${t}` }
            });
            const verifyData = await verifyRes.json();
            if (verifyData.error === 'Unauthorized') {
                alert('Invalid token. Please try again.');
                await checkAuth();
                return;
            }
            localStorage.setItem('DASHBOARD_AUTH_TOKEN', t);
            state.token = t;
            location.reload();
        }
    }
}

async function fetchApi(path, options = {}) {
    const url = new URL(path, window.location.origin);
    // don't append range if already present
    if (!url.searchParams.has('range')) {
        url.searchParams.append('range', state.timeRange);
    }

    if (!options.headers) options.headers = {};
    if (state.token) {
        options.headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
        const res = await fetch(url, options);
        if (res.status === 401 && path !== '/api/health') {
            localStorage.removeItem('DASHBOARD_AUTH_TOKEN');
            state.token = '';
            location.reload();
        }
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await res.json();
        } else {
            return await res.text();
        }
    } catch (e) {
        console.error(e);
        return { error: e.message };
    }
}

const tabModules = {};

function registerTab(name, renderFn) {
    tabModules[name] = renderFn;
}

async function loadCurrentTab() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Set active nav
    const activeNav = document.querySelector(`.nav-item[data-tab="${hash}"]`);
    if (activeNav) activeNav.classList.add('active');

    const contentArea = document.getElementById('main-content');

    let isSameTab = contentArea.dataset.currentTab === hash;
    contentArea.dataset.currentTab = hash;

    if (!isSameTab) {
        contentArea.innerHTML = `
            <h1 class="page-title">${activeNav ? activeNav.textContent : 'Module'}</h1>
            <div id="tab-root">Loading...</div>
        `;
    }

    const root = document.getElementById('tab-root');
    const oldScroll = contentArea.scrollTop;

    if (tabModules[hash]) {
        await tabModules[hash](root);
        // Ensure scroll jumps directly back to where user was
        if (isSameTab) {
            requestAnimationFrame(() => contentArea.scrollTop = oldScroll);
        }
    } else {
        root.innerHTML = `<p class="module-section">Module <code>${hash}</code> not fully implemented. Try another tab.</p>`;
    }
}

window.addEventListener('hashchange', loadCurrentTab);

document.getElementById('globalSearch').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const q = e.target.value;
        const res = await fetchApi(`/api/search?q=${encodeURIComponent(q)}`);
        alert('Search Results:\n\n' + JSON.stringify(res.results, null, 2));
    }
});

let pollInterval;
async function init() {
    await checkAuth();
    pollInterval = setInterval(() => {
        // Prevent auto-refresh if the user is actively typing or has unsaved text in any input
        let hasUnsavedInput = false;
        document.querySelectorAll('#main-content input, #main-content textarea').forEach(el => {
            if (el.type !== 'submit' && el.type !== 'button' && el.value.trim() !== '') {
                hasUnsavedInput = true;
            }
        });

        const ae = document.activeElement;
        const isEditing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');

        const currentHash = window.location.hash.replace('#', '');

        if (isEditing || hasUnsavedInput || currentHash === 'chat') {
            return;
        }

        loadCurrentTab();
    }, 15000);
}

document.addEventListener('DOMContentLoaded', init);
