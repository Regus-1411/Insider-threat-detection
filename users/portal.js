/* portal.js — simple employee workspace, no risk/flags visible to user */

let currentUser = null;
let actionCount = 0;

// ── Department workspace definitions ─────────────────────────────────────────
// Each action has a hidden risk_tier and flag info that the USER never sees.
// The UI shows them as normal work buttons.

const WORKSPACES = {

    Finance: {
        icon: '💰',
        title: 'Finance Workspace',
        customLayout: true, // Signal to use a simplified layout
        sections: [
            {
                title: 'Available Reports',
                actions: [
                    { label: 'Q1 Financial Summary.pdf', icon: '📄', risk: 'normal', flag: '' },
                    { label: 'Q2 Financial Summary.pdf', icon: '📄', risk: 'normal', flag: '' },
                    { label: 'Q3 Financial Summary.pdf', icon: '📄', risk: 'normal', flag: '' },
                ]
            }
        ],
        footerAction: { label: 'Download All Financial Statements (.zip)', icon: '⬇️', risk: 'high', flag: 'Mass Data Exfiltration', notes: 'User performed an unauthorized bulk download of all restricted financial statements.' }
    },

    IT: {
        icon: '🖥️',
        title: 'IT Workspace',
        sections: [
            {
                title: 'System Tasks',
                actions: [
                    { label: 'Check Server Status', icon: '🩺', risk: 'normal', flag: '' },
                    { label: 'Update System Packages', icon: '📦', risk: 'normal', flag: '' },
                    { label: 'Restart Web Service', icon: '🔄', risk: 'suspicious', flag: 'Service Restart', notes: 'User restarted a critical web service without a ticket.' },
                ]
            }
        ]
    },

    HR: {
        icon: '👥',
        title: 'HR Workspace',
        sections: [
            {
                title: 'Personnel Records',
                actions: [
                    { label: 'View Employee Directory', icon: '📋', risk: 'normal', flag: '' },
                    { label: 'Update Policy Document', icon: '📄', risk: 'normal', flag: '' },
                    { label: 'Export PII Data (Draft)', icon: '📤', risk: 'suspicious', flag: 'PII Export Attempt', notes: 'User attempted to export a list containing employee PII data.' },
                ]
            }
        ]
    }
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    try {
        const res = await fetch('/api/user/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = 'index.html'; return; }
        currentUser = await res.json();
    } catch {
        window.location.href = 'index.html';
        return;
    }

    // Header
    document.getElementById('userName').textContent = currentUser.name;
    const badge = document.getElementById('deptBadge');
    badge.textContent = currentUser.department;
    badge.className   = `dept-badge dept-${currentUser.department}`;

    // Welcome
    document.getElementById('welcomeTitle').textContent = `Welcome, ${currentUser.name.split(' ')[0]}`;
    document.getElementById('welcomeSub').textContent =
        `${currentUser.department} · ${currentUser.role || 'Employee'} — your workspace is ready.`;
    document.getElementById('statTime').textContent =
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    renderWorkspace(currentUser.department);
}

// ── Render workspace ─────────────────────────────────────────────────────────
function renderWorkspace(dept) {
    const ws = WORKSPACES[dept];
    if (!ws) {
        document.getElementById('workspace').innerHTML =
            `<div class="empty-msg">No workspace configured for: ${dept}</div>`;
        return;
    }

    let html = ws.sections.map(section => `
        <div class="ws-section">
            <div class="ws-section-title">${section.title}</div>
            <div class="ws-grid">
                ${section.actions.map((a, i) => `
                    <button class="ws-btn" id="action-${dept}-${i}"
                        onclick='doAction(${JSON.stringify(a).replace(/'/g, "&#39;")})'>
                        <span class="ws-btn-icon">${a.icon}</span>
                        <span class="ws-btn-label">${a.label}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');

    if (ws.footerAction) {
        html += `
            <div class="ws-footer-section" style="margin-top: 40px; border-top: 1px solid var(--border); padding-top: 20px; text-align: center;">
                <p style="color: var(--muted); font-size: 12px; margin-bottom: 15px;">Additional Operations</p>
                <button class="ws-btn" style="display: inline-flex; width: auto; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 24px;"
                    onclick='doAction(${JSON.stringify(ws.footerAction).replace(/'/g, "&#39;")})'>
                    <span class="ws-btn-icon">${ws.footerAction.icon}</span>
                    <span class="ws-btn-label" style="font-weight: 600;">${ws.footerAction.label}</span>
                </button>
            </div>
        `;
    }

    document.getElementById('workspace').innerHTML = html;
}

// ── Execute action (user sees simple feedback, backend logs everything) ──────
async function doAction(action) {
    try {
        const res = await fetch('/api/user/action', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action:    action.label.toLowerCase().replace(/\s+/g, '_'),
                risk_tier: action.risk,
                flag_type: action.flag || '',
                notes:     action.notes || '',
            }),
        });
        if (res.ok) {
            actionCount++;
            document.getElementById('statActions').textContent = actionCount;
            showToast(`✓ ${action.label}`);
        } else {
            showToast('Action failed — try again.');
        }
    } catch {
        showToast('Cannot reach server.');
    }
}

// ── Logout ───────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/user/logout', { method: 'POST', credentials: 'include' });
    window.location.href = 'index.html';
});

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

// Boot
init();
