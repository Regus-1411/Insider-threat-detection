/* hr-portal.js */

let currentUser = null;

const TEAM = [
    { name: 'Alice Martin',   dept: 'Finance',     role: 'Financial Analyst',     status: 'active',   progress: 82, lastActive: '10 min ago' },
    { name: 'Bob Singh',      dept: 'IT',          role: 'Systems Administrator', status: 'active',   progress: 67, lastActive: '1 hr ago'  },
    { name: 'David Lee',      dept: 'Engineering', role: 'Senior Developer',      status: 'active',   progress: 91, lastActive: '5 min ago' },
    { name: 'Eva Turner',     dept: 'Legal',       role: 'Legal Counsel',          status: 'idle',    progress: 54, lastActive: '3 hrs ago' },
    { name: 'Frank Adams',    dept: 'IT',          role: 'Network Engineer',       status: 'active',   progress: 73, lastActive: '30 min ago'},
    { name: 'Grace Patel',    dept: 'Finance',     role: 'Accounts Manager',       status: 'active',   progress: 88, lastActive: '15 min ago'},
    { name: 'Henry Brooks',   dept: 'Engineering', role: 'DevOps Engineer',        status: 'idle',    progress: 45, lastActive: '6 hrs ago' },
];

// ── Auth guard ────────────────────────────────────────────────────────────────
async function init() {
    try {
        const res = await fetch('/api/user/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = 'index.html'; return; }
        currentUser = await res.json();
    } catch {
        window.location.href = 'index.html'; return;
    }

    document.getElementById('userName').textContent = currentUser.name;
    renderTeam();
}

// ── Render team table ─────────────────────────────────────────────────────────
function renderTeam() {
    const tbody = document.getElementById('teamTable');
    tbody.innerHTML = TEAM.map(m => `
        <tr>
            <td><strong>${m.name}</strong></td>
            <td><span class="badge badge-normal">${m.dept}</span></td>
            <td style="color:var(--muted)">${m.role}</td>
            <td><span class="badge ${m.status === 'active' ? 'badge-active' : 'badge-idle'}">${m.status}</span></td>
            <td style="min-width:160px">
                <div class="progress-wrap">
                    <div class="progress-track">
                        <div class="progress-fill" style="width:${m.progress}%;background:${m.progress>70?'var(--low)':m.progress>40?'var(--medium)':'var(--high)'}"></div>
                    </div>
                    <span class="progress-pct">${m.progress}%</span>
                </div>
            </td>
            <td style="color:var(--muted);font-size:12px">${m.lastActive}</td>
            <td><button class="btn btn-default" onclick="viewMember('${m.name}')">Profile</button></td>
        </tr>
    `).join('');
}

// ── Actions ───────────────────────────────────────────────────────────────────
function viewMember(name) {
    postAction('view_employee_profile', 'normal', '', '');
    showToast(`Opened profile for ${name}`, 'ok');
}

function openFile(name) {
    postAction('view_hr_document', 'normal', '', '');
    showToast(`Opened: ${name}`, 'ok');
}

function accessSalary() {
    if (!confirm('⚠️ SENSITIVE\n\nAccessing full salary records may raise a security alert.\nProceed?')) return;
    postAction('access_all_salaries', 'suspicious', 'Unauthorized Salary Access', 'HR user accessed full company salary records.');
    showToast('⚠️ Salary records accessed — flagged as Medium', 'medium');
}

function exportPII() {
    if (!confirm('⚠️ SENSITIVE\n\nBulk exporting employee PII will trigger a security alert.\nProceed?')) return;
    postAction('bulk_export_employee_pii', 'suspicious', 'Bulk PII Data Export', 'Full employee PII exported by HR user.');
    showToast('⚠️ PII export flagged as Medium alert', 'medium');
}

function accessCode(file) {
    const isHigh = file.includes('.env') || file.includes('backup');
    if (isHigh) {
        if (!confirm(`🚨 RESTRICTED\n\n"${file}"\n\nThis will trigger a HIGH security alert.\nProceed?`)) return;
        postAction('unauthorized_engineering_access', 'high', 'Cross-Department Production Access', `HR user accessed restricted engineering file: ${file}`);
        showToast(`🚨 HIGH flag raised — admin notified`, 'high');
    } else {
        if (!confirm(`⚠️ SENSITIVE\n\n"${file}"\n\nThis may raise a security alert.\nProceed?`)) return;
        postAction('unauthorized_code_access', 'suspicious', 'Cross-Department File Access', `HR user opened engineering source file: ${file}`);
        showToast(`⚠️ Cross-dept access — flagged as Medium`, 'medium');
    }
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
function showToast(msg, type='ok') {
    const el = document.getElementById('toast');
    el.textContent  = msg;
    el.className    = `show toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 4000);
}

init();
