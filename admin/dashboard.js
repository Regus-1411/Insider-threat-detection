/* dashboard.js */
const API = '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
}

function badge(cls, text) {
    return `<span class="badge badge-${cls.toLowerCase()}">${text}</span>`;
}

// ── Auth guard ────────────────────────────────────────────────────────────────
async function checkAuth() {
    try {
        const res = await fetch(`${API}/api/admin/me`, { credentials: 'include' });
        if (!res.ok) { window.location.href = 'index.html'; return false; }
        const data = await res.json();
        document.getElementById('adminBadge').textContent = data.email;
        document.getElementById('adminName').textContent = data.email.split('@')[0];
        return true;
    } catch {
        window.location.href = 'index.html';
        return false;
    }
}

// ── Clock + Date ───────────────────────────────────────────────────────────────
function startClock() {
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('todayDate');
    const tick = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString();
        dateEl.textContent = now.toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    };
    tick();
    setInterval(tick, 1000);
}

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch(`${API}/api/admin/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = 'index.html';
});

// ── Summary cards ─────────────────────────────────────────────────────────────
async function loadSummary() {
    try {
        const res = await fetch(`${API}/api/summary`, { credentials: 'include' });
        const d = await res.json();
        document.getElementById('statTotal').textContent = d.total_users ?? '—';
        document.getElementById('statActive').textContent = d.active_users ?? '—';
        document.getElementById('statFlags').textContent = d.flags_today ?? '—';
        document.getElementById('statHighRisk').textContent = d.high_risk ?? '—';
    } catch { /* keep previous */ }
}

// ── Users list ────────────────────────────────────────────────────────────────
let allUsers = [];
let activeUserId = null;

async function loadUsers() {
    try {
        const res = await fetch(`${API}/api/users`, { credentials: 'include' });
        allUsers = await res.json();
        renderUsers(allUsers);
    } catch {
        document.getElementById('userTbody').innerHTML =
            '<tr class="empty-row"><td colspan="6">Failed to load users.</td></tr>';
    }
}

function renderUsers(list) {
    const tbody = document.getElementById('userTbody');
    if (!list.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No users found.</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(u => `
        <tr class="user-row${u.id === activeUserId ? ' active' : ''}"
            data-id="${u.id}" onclick="openDrawer(${u.id})">
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${u.department}</td>
            <td>${u.sessions_today}</td>
            <td>${badge(u.risk_level.toLowerCase(), u.risk_level)}</td>
            <td>${u.is_active ? badge('online', 'Online') : badge('offline', 'Offline')}</td>
        </tr>
    `).join('');
}

document.getElementById('userSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderUsers(allUsers.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q)
    ));
});

// ── Drawer open / close ───────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
const drawer = document.getElementById('detailDrawer');
const drawerBody = document.getElementById('drawerBody');
const drawerTitle = document.getElementById('drawerTitle');

function openDrawer(userId) {
    activeUserId = userId;
    renderUsers(allUsers);            // highlight active row
    overlay.classList.add('open');
    drawer.classList.add('open');
    drawerBody.innerHTML = '<div class="drawer-loading">Loading…</div>';
    fetchUserDetail(userId);
}

function closeDrawer() {
    activeUserId = null;
    renderUsers(allUsers);
    overlay.classList.remove('open');
    drawer.classList.remove('open');
}

document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
overlay.addEventListener('click', closeDrawer);

// ── User detail fetch + render ─────────────────────────────────────────────
async function fetchUserDetail(userId) {
    try {
        const res = await fetch(`${API}/api/users/${userId}`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const d = await res.json();
        renderDrawer(d);
    } catch {
        drawerBody.innerHTML = '<div class="drawer-loading">Failed to load user details.</div>';
    }
}

function renderDrawer({ user, fingerprint, flags }) {
    drawerTitle.textContent = user.name;

    // ── Terminate session section (shown always, active only when threat confirmed) ──
    const isHigh = user.risk_level === 'High';
    const isOnline = !!user.is_active;
    const canTerminate = isOnline && isHigh;
    const terminateSection = `
        <div class="terminate-box">
            <div class="term-label">
                <span>Terminate Session</span>
                <p>${isOnline
            ? (isHigh ? '<span style="color:var(--danger)">High-risk threat confirmed — session can be forcefully terminated.</span>'
                : 'Active session, but threat is not confirmed. Termination locked.')
            : 'User session is currently offline.'}</p>
            </div>
            <div class="toggle-wrap">
                <span class="toggle-label" id="termLabel">${isOnline ? (isHigh ? 'Active' : 'Locked') : 'Offline'}</span>
                <label class="toggle" title="${isOnline ? (isHigh ? 'Terminate session' : 'Threat not confirmed') : 'Session already offline'}">
                    <input type="checkbox" id="terminateSwitch"
                        ${canTerminate ? '' : 'disabled'}
                        onchange="handleTerminate(${user.id}, this)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>`;

    // ── Basic info ────────────────────────────────────────────────────────────
    const infoSection = `
        <div class="detail-section">
            <h4>User Info</h4>
            <div class="info-grid">
                <div class="info-item"><div class="key">Name</div><div class="val">${user.name}</div></div>
                <div class="info-item"><div class="key">Email</div><div class="val">${user.email}</div></div>
                <div class="info-item"><div class="key">Department</div><div class="val">${user.department}</div></div>
                <div class="info-item"><div class="key">Status</div><div class="val">${user.is_active ? badge('online', 'Online') : badge('offline', 'Offline')}</div></div>
                <div class="info-item"><div class="key">Sessions Today</div><div class="val">${user.sessions_today}</div></div>
                <div class="info-item"><div class="key">Last Active</div><div class="val">${fmtTime(user.last_active)}</div></div>
            </div>
        </div>`;

    // ── Risk section ──────────────────────────────────────────────────────────
    const riskSection = `
        <div class="detail-section">
            <h4>Risk Weightage</h4>
            <div class="info-grid">
                <div class="info-item"><div class="key">Score (0–100)</div><div class="val">${user.risk_score}</div></div>
                <div class="info-item"><div class="key">Level</div><div class="val">${badge(user.risk_level.toLowerCase(), user.risk_level)}</div></div>
                <div class="info-item"><div class="key">Last Calculated</div><div class="val">${fmtTime(user.last_calculated)}</div></div>
            </div>
        </div>`;

    // ── Fingerprint section ────────────────────────────────────────────────────
    let fpSection = '';
    if (fingerprint) {
        fpSection = `
        <div class="detail-section">
            <h4>Behavioral Fingerprint</h4>
            <div class="info-grid">
                <div class="info-item"><div class="key">Usual Login Hours</div><div class="val">${fingerprint.usual_login_hours ?? '—'}</div></div>
                <div class="info-item"><div class="key">Common IP</div><div class="val">${fingerprint.common_ip ?? '—'}</div></div>
                <div class="info-item"><div class="key">Common OS</div><div class="val">${fingerprint.common_os ?? '—'}</div></div>
                <div class="info-item"><div class="key">Browser</div><div class="val">${fingerprint.common_browser ?? '—'}</div></div>
                <div class="info-item"><div class="key">Anomaly Score</div><div class="val">${(fingerprint.anomaly_score * 100).toFixed(0)}%</div></div>
                <div class="info-item"><div class="key">Last Updated</div><div class="val">${fmtTime(fingerprint.last_updated)}</div></div>
            </div>
        </div>`;
    }

    // ── Flags section ─────────────────────────────────────────────────────────
    let flagsHtml = '<div class="empty-row" style="color:var(--muted);font-size:13px;">No flags raised.</div>';
    if (flags && flags.length) {
        flagsHtml = `<div class="flags-list">${flags.map(f => `
            <div class="flag-item" id="drawer-flag-${f.id}">
                <div>
                    <div class="flag-type">${f.flag_type}</div>
                    <div class="flag-meta">${fmtTime(f.timestamp)}</div>
                </div>
                ${badge(f.severity.toLowerCase(), f.severity)}
                ${f.resolved ? badge('resolved', 'Resolved') : badge('open', 'Open')}
                <div class="flag-actions">
                    ${!f.resolved
                ? `<button class="btn-resolve" onclick="resolveFlag(${f.id}, ${user.id})">Resolve</button>`
                : ''}
                </div>
            </div>`).join('')}</div>`;
    }

    const flagsSection = `
        <div class="detail-section">
            <h4>Flags Raised (${flags.length})</h4>
            ${flagsHtml}
        </div>`;

    drawerBody.innerHTML = terminateSection + infoSection + riskSection + fpSection + flagsSection;
}

// ── Terminate session ────────────────────────────────────────────────────────
async function handleTerminate(userId, checkbox) {
    const confirmed = confirm('Terminate this user\'s session? This will mark them as offline immediately.');
    if (!confirmed) {
        checkbox.checked = false;
        return;
    }
    try {
        await fetch(`${API}/api/admin/terminate/${userId}`, {
            method: 'POST',
            credentials: 'include',
        });
        // Update local data & re-render
        const u = allUsers.find(u => u.id === userId);
        if (u) u.is_active = 0;
        renderUsers(allUsers);
        loadSummary();
        loadActiveSessions();
        // Re-fetch drawer to update status display
        fetchUserDetail(userId);
    } catch {
        alert('Failed to terminate session. Please try again.');
        checkbox.checked = false;
    }
}

// ── Resolve flag (from drawer) ────────────────────────────────────────────────
async function resolveFlag(flagId, userId) {
    try {
        await fetch(`${API}/api/flags/${flagId}/resolve`, {
            method: 'POST',
            credentials: 'include',
        });
        loadSummary();
        fetchUserDetail(userId); // refresh drawer
    } catch {
        alert('Failed to resolve flag.');
    }
}

// ── Active Sessions (Off-Hours Alerts) ───────────────────────────────────────
async function loadActiveSessions() {
    const tbody = document.getElementById('activeSessionsTbody');
    try {
        const res = await fetch(`${API}/api/admin/active-sessions`, { credentials: 'include' });
        const rows = await res.json();

        // Show all active sessions that have an unresolved flag
        const flagged = rows;

        if (!flagged.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7" style="color:var(--muted)">No off-hours sessions detected.</td></tr>';
            return;
        }

        tbody.innerHTML = flagged.map(r => `
            <tr>
                <td><strong>${r.name}</strong></td>
                <td>${r.email}</td>
                <td>${r.department}</td>
                <td><span class="badge badge-medium">${r.flag_type || '—'}</span></td>
                <td style="color:var(--muted);font-size:12px">${r.flag_time ? new Date(r.flag_time).toLocaleString() : '—'}</td>
                <td><span class="badge badge-low">${r.severity || 'Low'}</span></td>
                <td>
                    <button class="btn-terminate" onclick="terminateFromPanel(${r.id}, this)">
                        ⛔ Terminate Session
                    </button>
                </td>
            </tr>
        `).join('');
    } catch {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Failed to load active sessions.</td></tr>';
    }
}

async function terminateFromPanel(userId, btn) {
    if (!confirm('Terminate this user\'s session? They will be forced off within ~8 seconds.')) return;
    btn.disabled = true;
    btn.textContent = 'Terminating…';
    try {
        await fetch(`${API}/api/admin/terminate/${userId}`, {
            method: 'POST', credentials: 'include',
        });
        const u = allUsers.find(u => u.id === userId);
        if (u) u.is_active = 0;
        renderUsers(allUsers);
        loadSummary();
        loadActiveSessions();
        btn.closest('tr').style.opacity = '0.4';
        btn.textContent = '✓ Terminated';
    } catch {
        alert('Failed to terminate session.');
        btn.disabled = false;
        btn.textContent = '⛔ Terminate Session';
    }
}

// ── Poll + init ───────────────────────────────────────────────────────────────
async function refreshAll() {
    await Promise.all([loadSummary(), loadUsers(), loadActiveSessions()]);
}

// ── SocketIO — Real-time Alert Feed ──────────────────────────────────────────
let _alertCount = 0;

function initSocketIO() {
    const socket = io('/admin', { withCredentials: true });

    socket.on('connect', () => {
        const badge = document.getElementById('liveIndicator');
        if (badge) { badge.textContent = 'LIVE'; badge.style.background = 'rgba(239,68,68,.15)'; badge.style.color = '#ef4444'; }
    });

    socket.on('disconnect', () => {
        const badge = document.getElementById('liveIndicator');
        if (badge) { badge.textContent = 'offline'; badge.style.color = '#64748b'; }
    });

    socket.on('security_alert', (data) => {
        _alertCount++;
        const feed = document.getElementById('alertFeed');
        if (!feed) return;

        // Clear placeholder on first real event
        if (_alertCount === 1) feed.innerHTML = '';

        const sevClass = {
            'Critical': 'dot-critical',
            'High':     'dot-high',
            'Medium':   'dot-medium',
        }[data.severity] || 'dot-medium';

        const ts = data.timestamp
            ? new Date(data.timestamp).toLocaleTimeString()
            : new Date().toLocaleTimeString();

        const item = document.createElement('div');
        item.className = 'alert-item';
        item.innerHTML = `
            <div class="alert-dot ${sevClass}"></div>
            <div class="alert-body">
                <div class="alert-title">${data.user_name} — ${data.flag.replace(/_/g, ' ')}</div>
                <div class="alert-sub">
                    Severity: <strong>${data.severity}</strong> &nbsp;|&nbsp;
                    Risk Score: <strong>${data.score}</strong> &nbsp;|&nbsp;
                    ${data.notes} &nbsp;|&nbsp; ${ts}
                </div>
            </div>
        `;
        // Prepend so newest alerts appear at top
        feed.insertBefore(item, feed.firstChild);

        // Refresh the user table so risk scores update
        loadUsers();
        loadSummary();
    });
}

// ── Forensic Search ───────────────────────────────────────────────────────────
async function runForensicSearch() {
    const query    = (document.getElementById('forensicQuery')?.value || '').trim();
    const severity = document.getElementById('forensicSeverity')?.value || '';
    const count    = document.getElementById('fsCount');
    const results  = document.getElementById('forensicResults');

    if (count) count.textContent = 'Searching…';

    try {
        const params = new URLSearchParams();
        if (query)    params.set('q', query);
        if (severity) params.set('severity', severity);
        params.set('limit', '50');

        const res = await fetch(`${API}/api/forensic/search?${params}`, { credentials: 'include' });
        const data = await res.json();

        if (count) count.textContent = `${data.length} result(s) found`;

        const header = `<div class="fs-row fs-header"><span>Flag / Path</span><span>User</span><span>Severity</span><span>Time</span></div>`;
        if (!data.length) {
            results.innerHTML = header + '<div style="color:#64748b;font-size:12px;padding:10px 0">No events match your query.</div>';
            return;
        }

        results.innerHTML = header + data.map(row => {
            const sevClass = `sev-${(row.severity || 'low').toLowerCase()}`;
            const ts = row.timestamp ? new Date(row.timestamp).toLocaleString() : '—';
            return `
                <div class="fs-row">
                    <span title="${row.path || ''}">${row.flag_type || row.path || '—'}</span>
                    <span>${row.user_name || '—'}</span>
                    <span class="${sevClass}">${row.severity || '—'}</span>
                    <span style="color:#64748b">${ts}</span>
                </div>
            `;
        }).join('');

    } catch {
        if (count) count.textContent = 'Search failed. Check connection.';
    }
}

// Support pressing Enter in the search field
document.getElementById('forensicQuery')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') runForensicSearch();
});

(async () => {
    const ok = await checkAuth();
    if (!ok) return;
    startClock();
    await refreshAll();
    initSocketIO();
    setInterval(refreshAll, 5000);
})();
