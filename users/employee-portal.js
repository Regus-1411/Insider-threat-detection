/* employee-portal.js */

let currentUser = null;

const DEPT_ICONS = {
    IT: '🖥️', Engineering: '⚙️', Legal: '⚖️', HR: '👥', Finance: '💰',
};

const TASKS = {
    IT:          [
        { task: 'Patch server CVE-2024-0012',    due: 'Apr 3',  priority: 'High',   status: 'In Progress' },
        { task: 'Review firewall rules',          due: 'Apr 5',  priority: 'Medium', status: 'Open' },
        { task: 'Onboard new dev machine',        due: 'Apr 7',  priority: 'Low',    status: 'Open' },
        { task: 'Update network diagram',         due: 'Apr 10', priority: 'Low',    status: 'Open' },
    ],
    Engineering: [
        { task: 'Fix auth bug #ERR-4821',         due: 'Apr 2',  priority: 'High',   status: 'In Progress' },
        { task: 'Code review: payments module',   due: 'Apr 4',  priority: 'High',   status: 'Open' },
        { task: 'Write unit tests — user API',    due: 'Apr 6',  priority: 'Medium', status: 'Open' },
        { task: 'Deploy staging build',           due: 'Apr 8',  priority: 'Medium', status: 'Blocked' },
    ],
    Legal:       [
        { task: 'Review vendor NDA — TechCo',    due: 'Apr 3',  priority: 'High',   status: 'In Progress' },
        { task: 'Update GDPR documentation',     due: 'Apr 8',  priority: 'Medium', status: 'Open' },
        { task: 'Prepare arbitration brief',     due: 'Apr 12', priority: 'High',   status: 'Open' },
    ],
};

const FILES = {
    IT:          [
        { icon: '📋', name: 'Change Request Template.docx', meta: '22 KB · IT Dept' },
        { icon: '🔑', name: 'VPN Access Credentials.txt',  meta: 'Sensitive · 4 KB' },
        { icon: '📊', name: 'Server Uptime Report.xlsx',   meta: '18 KB · Mar 2025' },
    ],
    Engineering: [
        { icon: '💻', name: 'Project Roadmap Q2.pdf',       meta: '84 KB · Mar 2025' },
        { icon: '📖', name: 'API Documentation v3.md',      meta: '210 KB · Latest' },
        { icon: '🧪', name: 'Test Coverage Report.html',    meta: '42 KB · CI/CD' },
    ],
    Legal:       [
        { icon: '📜', name: 'Contract Template v4.docx',   meta: '55 KB · Legal' },
        { icon: '📁', name: 'Active Cases Overview.pdf',    meta: '128 KB · Confidential' },
        { icon: '📧', name: 'Correspondence Log.xlsx',      meta: '33 KB · Mar 2025' },
    ],
};

// ── Auth guard + off-hours check ──────────────────────────────────────────────
async function init() {
    try {
        const res = await fetch('/api/user/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = 'index.html'; return; }
        currentUser = await res.json();
    } catch {
        window.location.href = 'index.html'; return;
    }

    const dept = currentUser.department;

    document.getElementById('userName').textContent  = currentUser.name;
    const badge = document.getElementById('deptBadge');
    badge.textContent  = dept;
    badge.className    = `dept-badge dept-${dept}`;

    document.getElementById('pageTitle').textContent    = `${DEPT_ICONS[dept] || '🏢'} ${dept} Workspace`;
    document.getElementById('pageSubtitle').textContent = `Welcome back, ${currentUser.name} — ${currentUser.role || dept}`;

    const taskCount = (TASKS[dept] || TASKS.IT).length;
    document.getElementById('statTasks').textContent = taskCount;

    renderTasks(dept);
    renderFiles(dept);
    checkOffHours();
    pollTerminationStatus();
}

// ── Off-hours detection ───────────────────────────────────────────────────────
async function checkOffHours() {
    const now  = new Date();
    const hour = now.getHours();
    const isOffHours = hour < 9 || hour >= 17;

    if (isOffHours) {
        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('offHoursMsg').textContent =
            `You logged in at ${timeStr}, which is outside normal business hours (09:00–17:00). ` +
            `This has been automatically flagged as a Low-level security alert and reported to your administrator for review.`;
        document.getElementById('offHoursAlert').style.display = 'flex';

        // Auto-post low flag to backend
        await postAction(
            'after_hours_login',
            'suspicious',   // backend maps suspicious→Medium but low-tier off-hours we use a lighter note
            'After-Hours Login',
            `Employee ${currentUser.name} logged in at ${timeStr} outside business hours.`
        );

        showToast('⚠️ Off-hours login flagged. Admin has been notified.', 'medium');
    }
}

// ── Poll to see if admin terminated this session ──────────────────────────────
function pollTerminationStatus() {
    setInterval(async () => {
        try {
            const res = await fetch('/api/user/me', { credentials: 'include' });
            if (!res.ok) {
                // Session invalidated by admin
                document.getElementById('terminatedAlert').style.display = 'flex';
                document.getElementById('offHoursAlert').style.display   = 'none';
                setTimeout(() => { window.location.href = 'index.html'; }, 5000);
            }
        } catch { /* ignore */ }
    }, 8000); // check every 8s
}

// ── Render tasks ──────────────────────────────────────────────────────────────
function renderTasks(dept) {
    const tasks = TASKS[dept] || TASKS.IT;
    const pColors = { High: 'badge-high', Medium: 'badge-medium', Low: 'badge-normal' };
    const sColors = { 'In Progress': 'badge-active', Open: 'badge-normal', Blocked: 'badge-high' };

    document.getElementById('taskTable').innerHTML = tasks.map(t => `
        <tr>
            <td>${t.task}</td>
            <td style="color:var(--muted);font-size:12px">${t.due}</td>
            <td><span class="badge ${pColors[t.priority]}">${t.priority}</span></td>
            <td><span class="badge ${sColors[t.status]}">${t.status}</span></td>
        </tr>
    `).join('');
}

// ── Render file list ──────────────────────────────────────────────────────────
function renderFiles(dept) {
    const files = FILES[dept] || FILES.IT;
    document.getElementById('fileList').innerHTML = files.map(f => `
        <div class="file-item">
            <span class="file-icon">${f.icon}</span>
            <div class="file-info">
                <div class="file-name">${f.name}</div>
                <div class="file-meta">${f.meta}</div>
            </div>
            <div class="file-action">
                <button class="btn btn-default" onclick="openFile('${f.name}')">Open</button>
            </div>
        </div>
    `).join('');
}

// ── Generic actions ───────────────────────────────────────────────────────────
function openFile(name) {
    postAction('view_file', 'normal', '', '');
    showToast(`✅ Opened: ${name}`, 'ok');
}

function addTask() {
    postAction('create_task', 'normal', '', '');
    showToast('✅ New task created.', 'ok');
}

async function doAction(action, tier, flagType = '', notes = '') {
    if (tier === 'suspicious') {
        if (!confirm(`⚠️ SENSITIVE\n\nThis action may raise a security alert.\nProceed?`)) return;
    }
    if (tier === 'high') {
        if (!confirm(`🚨 RESTRICTED\n\nThis will trigger a HIGH severity flag visible to administrators.\nProceed anyway?`)) return;
    }
    await postAction(action, tier, flagType, notes);
    const msgs = {
        normal:     '✅ Action logged.',
        suspicious: '⚠️ Action flagged — Medium alert raised.',
        high:       '🚨 HIGH flag raised — admin notified.',
    };
    showToast(msgs[tier], tier === 'normal' ? 'ok' : tier === 'suspicious' ? 'medium' : 'high');
}

// ── API helper ────────────────────────────────────────────────────────────────
async function postAction(action, tier, flagType, notes) {
    try {
        await fetch('/api/user/action', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, risk_tier: tier, flag_type: flagType, notes }),
        });
    } catch { /* ignore */ }
}

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/user/logout', { method: 'POST', credentials: 'include' });
    window.location.href = 'index.html';
});

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `show toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 4500);
}

init();
