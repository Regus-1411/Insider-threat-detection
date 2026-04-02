/**
 * portal.js — Nexus Corp Employee Workspace
 *
 * All user actions (file downloads, report opens, settings changes) are logged
 * silently to the backend. The user experiences this as a normal productivity app.
 * The interceptor layer handles all anomaly detection server-side.
 */

'use strict';

let currentUser = null;
let currentView = 'dashboard';

// ── Department-specific file sets ────────────────────────────────────────────
const FILE_CATALOG = {
    Finance: [
        { name: 'Q4_Financial_Report_2024.xlsx',   type: 'spreadsheet', size: '2.3 MB', modified: '2025-03-31', restricted: false },
        { name: 'Annual_Budget_Projection.xlsx',   type: 'spreadsheet', size: '1.8 MB', modified: '2025-03-20', restricted: false },
        { name: 'Payroll_Summary_March.csv',        type: 'csv',         size: '890 KB', modified: '2025-03-18', restricted: true  },
        { name: 'Client_Invoices_Q1.pdf',           type: 'pdf',         size: '5.1 MB', modified: '2025-03-15', restricted: false },
        { name: 'Expense_Reports_All_Depts.xlsx',   type: 'spreadsheet', size: '3.2 MB', modified: '2025-03-10', restricted: true  },
        { name: 'Audit_Logs_FY2024.txt',            type: 'text',        size: '220 KB', modified: '2025-03-05', restricted: true  },
        { name: 'Tax_Filing_2024.pdf',              type: 'pdf',         size: '1.1 MB', modified: '2025-02-28', restricted: false },
    ],
    IT: [
        { name: 'Network_Topology_Diagram.png',    type: 'image',    size: '890 KB', modified: '2025-03-20', restricted: false },
        { name: 'Server_Configuration_Backup.tar.gz', type: 'archive', size: '8.7 MB', modified: '2025-03-10', restricted: true  },
        { name: 'Incident_Response_Runbook.pdf',   type: 'pdf',      size: '3.4 MB', modified: '2025-03-01', restricted: false },
        { name: 'Security_Policy_2025.docx',       type: 'document', size: '312 KB', modified: '2025-02-15', restricted: true  },
        { name: 'VPN_Access_Log_March.txt',        type: 'text',     size: '450 KB', modified: '2025-03-28', restricted: true  },
        { name: 'Firewall_Rules_Backup.conf',      type: 'text',     size: '78 KB',  modified: '2025-03-22', restricted: true  },
        { name: 'Software_Asset_Inventory.xlsx',   type: 'spreadsheet', size: '1.2 MB', modified: '2025-03-05', restricted: false },
    ],
    HR: [
        { name: 'Employee_Directory_Q1.pdf',       type: 'pdf',  size: '2.1 MB', modified: '2025-03-28', restricted: false },
        { name: 'Employee_Records_Full.csv',       type: 'csv',  size: '1.4 MB', modified: '2025-03-18', restricted: true  },
        { name: 'Onboarding_Handbook_2025.pdf',    type: 'pdf',  size: '4.3 MB', modified: '2025-03-12', restricted: false },
        { name: 'Salary_Bands_FY2025.xlsx',        type: 'spreadsheet', size: '650 KB', modified: '2025-03-01', restricted: true  },
        { name: 'Performance_Review_Template.docx',type: 'document', size: '280 KB', modified: '2025-02-20', restricted: false },
        { name: 'Disciplinary_Actions_Log.xlsx',   type: 'spreadsheet', size: '430 KB', modified: '2025-02-15', restricted: true  },
        { name: 'Benefits_Policy_2025.pdf',        type: 'pdf',  size: '1.9 MB', modified: '2025-02-10', restricted: false },
    ],
    Engineering: [
        { name: 'Architecture_Diagram_v3.png',     type: 'image',    size: '3.2 MB', modified: '2025-03-25', restricted: false },
        { name: 'API_Documentation_v2.pdf',         type: 'pdf',      size: '5.8 MB', modified: '2025-03-20', restricted: false },
        { name: 'Source_Code_Backup_Mar.tar.gz',   type: 'archive',  size: '41 MB',  modified: '2025-03-15', restricted: true  },
        { name: 'Database_Schema_Export.sql',       type: 'text',     size: '890 KB', modified: '2025-03-10', restricted: true  },
        { name: 'Sprint_Retrospective_Q1.docx',    type: 'document', size: '310 KB', modified: '2025-03-05', restricted: false },
        { name: 'Deployment_Keys.csv',              type: 'csv',      size: '12 KB',  modified: '2025-02-28', restricted: true  },
        { name: 'Project_Requirements_v4.pdf',      type: 'pdf',      size: '2.7 MB', modified: '2025-02-22', restricted: false },
    ],
    Legal: [
        { name: 'NDA_Template_2025.docx',          type: 'document', size: '180 KB', modified: '2025-03-28', restricted: false },
        { name: 'Client_Contracts_Q1.pdf',          type: 'pdf',      size: '7.2 MB', modified: '2025-03-20', restricted: true  },
        { name: 'Compliance_Assessment_2024.pdf',   type: 'pdf',      size: '4.1 MB', modified: '2025-03-15', restricted: false },
        { name: 'Litigation_Case_Files.zip',        type: 'archive',  size: '12 MB',  modified: '2025-03-10', restricted: true  },
        { name: 'IP_Registration_Records.xlsx',    type: 'spreadsheet', size: '780 KB', modified: '2025-03-01', restricted: true  },
        { name: 'Employment_Agreements_Bulk.pdf',  type: 'pdf',      size: '9.3 MB', modified: '2025-02-25', restricted: true  },
        { name: 'Regulatory_Filings_2024.docx',    type: 'document', size: '560 KB', modified: '2025-02-10', restricted: false },
    ],
};

// ── Report catalog (shared across departments, filtered by relevance) ─────────
const REPORTS_CATALOG = [
    { id: 'q4-finance', title: 'Q4 Financial Summary',     dept: 'Finance',    deptClass: 'dept-finance',   icon: '📊', date: '2025-03-31', status: 'complete',  action: 'open_report_financial',    restricted: false },
    { id: 'sec-audit',  title: 'Security Audit Report',    dept: 'Security',   deptClass: 'dept-security',  icon: '🔒', date: '2025-03-28', status: 'review',    action: 'open_report_security_audit', restricted: true  },
    { id: 'net-perf',   title: 'Network Performance',      dept: 'IT Infra',   deptClass: 'dept-it',        icon: '🌐', date: '2025-03-25', status: 'complete',  action: 'open_report_network',       restricted: false },
    { id: 'emp-access', title: 'Employee Access Review',   dept: 'HR / Sec',   deptClass: 'dept-hr',        icon: '👤', date: '2025-03-20', status: 'review',    action: 'open_report_employee_access', restricted: true  },
    { id: 'compliance', title: 'Compliance Assessment',    dept: 'Compliance', deptClass: 'dept-compliance',icon: '📋', date: '2025-03-15', status: 'complete',  action: 'open_report_compliance',    restricted: false },
    { id: 'incident',   title: 'Incident Response Log',    dept: 'Security',   deptClass: 'dept-security',  icon: '⚠️', date: '2025-03-10', status: 'archived',  action: 'open_report_incident_log',  restricted: true  },
];

// ── Quick actions per department (Dashboard) ──────────────────────────────────
const QUICK_ACTIONS = {
    Finance: [
        { icon: '📤', label: 'Submit Expense',      sub: 'Expense reporting portal',    action: 'submit_expense_form',       risk: 'normal',     flag: ''  },
        { icon: '📊', label: 'View Budget',          sub: 'FY2025 department budget',    action: 'view_department_budget',    risk: 'normal',     flag: ''  },
        { icon: '🧾', label: 'Generate Invoice',     sub: 'Client billing system',       action: 'generate_invoice',          risk: 'suspicious', flag: 'Unauthorized Invoice Generation' },
        { icon: '💳', label: 'Petty Cash Request',   sub: 'Request small disbursement',  action: 'petty_cash_request',        risk: 'normal',     flag: ''  },
        { icon: '📁', label: 'Archive Q3 Reports',   sub: 'Move old reports to archive', action: 'archive_reports_bulk',      risk: 'suspicious', flag: 'Bulk Archive Operation' },
        { icon: '📩', label: 'Send Report to CFO',   sub: 'Forward financial summary',   action: 'forward_restricted_report', risk: 'high',       flag: 'Unauthorised Report Forwarding' },
    ],
    IT: [
        { icon: '🩺', label: 'Check Server Status',   sub: 'Infrastructure health',      action: 'check_server_status',       risk: 'normal',     flag: ''  },
        { icon: '📦', label: 'Update Packages',        sub: 'Run system update',          action: 'update_system_packages',    risk: 'normal',     flag: ''  },
        { icon: '🔑', label: 'Rotate API Keys',        sub: 'Credential lifecycle',       action: 'rotate_api_keys',           risk: 'suspicious', flag: 'Credential Rotation Without Ticket' },
        { icon: '📋', label: 'Review Access Logs',     sub: 'Last 30-day log review',     action: 'review_access_logs',        risk: 'suspicious', flag: 'Sensitive Log Access' },
        { icon: '🔄', label: 'Restart Web Service',    sub: 'Restart primary web server', action: 'restart_web_service',       risk: 'suspicious', flag: 'Unapproved Service Restart' },
        { icon: '⬇️', label: 'Export System Config',   sub: 'Download server settings',   action: 'export_system_config',      risk: 'high',       flag: 'Configuration Exfiltration' },
    ],
    HR: [
        { icon: '📋', label: 'View Directory',         sub: 'Employee directory lookup',  action: 'view_employee_directory',   risk: 'normal',     flag: ''  },
        { icon: '➕', label: 'Onboard Employee',       sub: 'New hire workflow',          action: 'onboard_new_employee',      risk: 'normal',     flag: ''  },
        { icon: '📤', label: 'Export PII Data',         sub: 'Export employee records',    action: 'export_pii_employee_data',  risk: 'high',       flag: 'PII Data Exfiltration' },
        { icon: '📄', label: 'Update HR Policy',        sub: 'Policy document update',     action: 'update_hr_policy',          risk: 'normal',     flag: ''  },
        { icon: '🔍', label: 'Audit Employee Records',  sub: 'Full record audit sweep',    action: 'audit_employee_records_bulk', risk: 'suspicious', flag: 'Bulk Record Access' },
        { icon: '📩', label: 'Send Salary Data',        sub: 'Forward payroll to vendor',  action: 'forward_salary_data',       risk: 'high',       flag: 'Payroll Data Exfiltration' },
    ],
    Engineering: [
        { icon: '🔀', label: 'Merge Pull Request',     sub: 'Code review & merge',        action: 'merge_pull_request',        risk: 'normal',     flag: ''  },
        { icon: '🚀', label: 'Deploy to Staging',       sub: 'Staging environment push',   action: 'deploy_to_staging',         risk: 'normal',     flag: ''  },
        { icon: '⬇️', label: 'Download Source Code',    sub: 'Full repo backup download',  action: 'download_source_code_bulk', risk: 'high',       flag: 'Source Code Exfiltration' },
        { icon: '🗄️', label: 'Export Database Dump',    sub: 'Production DB snapshot',     action: 'export_database_dump',      risk: 'high',       flag: 'Database Exfiltration' },
        { icon: '🔍', label: 'Run Dependency Audit',    sub: 'Security vulnerability scan', action: 'run_dependency_audit',      risk: 'normal',     flag: ''  },
        { icon: '🔑', label: 'Access Prod Secrets',     sub: 'View production credentials', action: 'access_production_secrets', risk: 'high',       flag: 'Unauthorized Secret Access' },
    ],
    Legal: [
        { icon: '📄', label: 'Review NDA',             sub: 'Pending signatures',         action: 'review_nda_documents',      risk: 'normal',     flag: ''  },
        { icon: '📁', label: 'Open Case Files',         sub: 'Active litigation cases',    action: 'open_litigation_cases',     risk: 'suspicious', flag: 'Sensitive Case File Access' },
        { icon: '📤', label: 'Export All Contracts',    sub: 'Bulk contract download',     action: 'export_contracts_bulk',     risk: 'high',       flag: 'Mass Contract Exfiltration' },
        { icon: '✍️', label: 'Sign Agreement',           sub: 'DocuSign workflow',          action: 'sign_agreement',            risk: 'normal',     flag: ''  },
        { icon: '📩', label: 'Forward Contract Data',   sub: 'Send to external counsel',   action: 'forward_contract_external', risk: 'high',       flag: 'Unauthorized Data Forwarding' },
        { icon: '🔍', label: 'Audit IP Filings',        sub: 'Intellectual property review', action: 'audit_ip_filings',         risk: 'suspicious', flag: 'IP Record Access' },
    ],
};

const AVATAR_COLORS = ['#2563eb','#16a34a','#d97706','#9333ea','#dc2626','#0891b2'];

// ── Utility: log an action silently in the background ─────────────────────────
async function logAction(action, risk = 'normal', flag = '', notes = '') {
    try {
        await fetch('/api/user/action', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, risk_tier: risk, flag_type: flag, notes }),
        });
    } catch { /* silent */ }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

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

    // Set sidebar user info
    const initials = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const colorIdx = currentUser.id % AVATAR_COLORS.length;
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userAvatar').style.background = AVATAR_COLORS[colorIdx];
    document.getElementById('sidebarName').textContent = currentUser.name;
    document.getElementById('sidebarDept').textContent = `${currentUser.department} · ${currentUser.role}`;
    document.getElementById('topbarMeta').textContent =
        `${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;

    // Show shell
    document.getElementById('appShell').style.display = 'flex';

    // Sidebar nav
    document.getElementById('sideNav').addEventListener('click', e => {
        const btn = e.target.closest('[data-view]');
        if (!btn) return;
        switchView(btn.dataset.view);
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/api/user/logout', { method: 'POST', credentials: 'include' });
        window.location.href = 'index.html';
    });

    renderView('dashboard');
}

// ── View Router ───────────────────────────────────────────────────────────────
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-view="${view}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderView(view);
}

function renderView(view) {
    const titles = { dashboard: 'Dashboard', inbox: 'Inbox', files: 'File Manager', reports: 'Reports', settings: 'Settings' };
    document.getElementById('topbarTitle').textContent = titles[view] || view;
    const content = document.getElementById('pageContent');
    switch (view) {
        case 'dashboard': renderDashboard(content); break;
        case 'inbox':     renderInbox(content);     break;
        case 'files':     renderFiles(content);     break;
        case 'reports':   renderReports(content);   break;
        case 'settings':  renderSettings(content);  break;
    }
}

// ── Dashboard View ────────────────────────────────────────────────────────────
function renderDashboard(el) {
    const greeting = getGreeting();
    const dept = currentUser.department;
    const actions = QUICK_ACTIONS[dept] || QUICK_ACTIONS.Finance;

    const actionsHtml = actions.map((a, i) => `
        <button class="action-card" id="qa-${i}" onclick="handleQuickAction(${JSON.stringify(a).replace(/"/g, '&quot;')})">
            <span class="action-icon">${a.icon}</span>
            <span class="action-label">${a.label}</span>
            <span class="action-sub">${a.sub}</span>
        </button>
    `).join('');

    const recentActivity = getRecentActivity(dept);

    el.innerHTML = `
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-label">Good ${greeting}</div>
                <div class="stat-value">${currentUser.name.split(' ')[0]}</div>
                <div class="stat-sub">${dept} Department</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Session Started</div>
                <div class="stat-value" style="font-size:16px">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                <div class="stat-sub">Today, ${new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short'})}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Pending Tasks</div>
                <div class="stat-value">3</div>
                <div class="stat-sub">2 due this week</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Notifications</div>
                <div class="stat-value">1</div>
                <div class="stat-sub">New message from IT</div>
            </div>
        </div>

        <div class="section-card">
            <div class="section-card-header">
                <span class="section-card-title">Quick Actions</span>
                <span style="font-size:11px;color:var(--muted)">${dept} Workspace</span>
            </div>
            <div class="section-card-body">
                <div class="actions-grid">${actionsHtml}</div>
            </div>
        </div>

        <div class="section-card">
            <div class="section-card-header">
                <span class="section-card-title">Recent Activity</span>
            </div>
            <div class="section-card-body">
                <div class="activity-list">${recentActivity}</div>
            </div>
        </div>
    `;
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Morning';
    if (h < 17) return 'Afternoon';
    return 'Evening';
}

function getRecentActivity(dept) {
    const items = {
        Finance:     ['Submitted Q4 expense report', 'Opened Budget_Projection.xlsx', 'Replied to CFO email thread'],
        IT:          ['Ran server health check', 'Updated firewall ruleset review', 'Opened VPN access log'],
        HR:          ['Updated onboarding checklist for 2 new hires', 'Reviewed performance review templates', 'Accessed employee directory'],
        Engineering: ['Merged feature branch into staging', 'Reviewed sprint retrospective', 'Ran dependency audit'],
        Legal:       ['Reviewed NDA for vendor partnership', 'Accessed compliance assessment', 'Signed employment agreement draft'],
    };
    const times = ['9 minutes ago', '32 minutes ago', '1 hour ago'];
    return (items[dept] || items.Finance).map((text, i) => `
        <div class="activity-item">
            <div class="activity-dot"></div>
            <div>
                <div class="activity-text">${text}</div>
                <div class="activity-time">${times[i]}</div>
            </div>
        </div>
    `).join('');
}

async function handleQuickAction(action) {
    // User sees a friendly confirmation, backend silently logs the real tier
    const btn = document.querySelector(`[onclick*="${action.action}"]`);
    if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
    try {
        const res = await fetch('/api/user/action', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: action.action,
                risk_tier: action.risk,
                flag_type: action.flag || '',
                notes: `User performed: ${action.label} (${action.sub})`,
            }),
        });
        if (res.status === 401 || res.status === 503) {
            toast(res.status === 401 ? 'Your session has expired.' : 'Service temporarily unavailable. Please try again later.');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }
        toast(`✓ ${action.label} — completed successfully.`);
    } catch {
        toast('Unable to reach server. Check your connection.');
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
}

// ── Inbox View (Phishing Simulation) ──────────────────────────────────────────
function renderInbox(el) {
    el.innerHTML = `
        <style>
            .email-list { display: flex; flex-direction: column; gap: 8px; }
            .email-item { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; }
            .email-item:hover { border-color: var(--primary); }
            .email-item.unread { border-left: 4px solid var(--danger); background: rgba(239, 68, 68, 0.05); }
            .email-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .email-sender { font-weight: 600; color: var(--text); }
            .email-time { font-size: 11px; color: var(--muted); }
            .email-subject { font-size: 14px; font-weight: 500; margin-bottom: 4px; color: var(--text); }
            .email-preview { font-size: 13px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
            
            #emailReader { display: none; margin-top: 20px; background: var(--bg-card); border: 1px solid var(--danger); border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .reader-header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 16px; }
            .reader-body { font-size: 14px; line-height: 1.6; color: var(--text); }
            .phishing-btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: var(--danger); color: white; text-decoration: none; border-radius: 6px; font-weight: 600; border: none; cursor: pointer; }
            .phishing-btn:hover { opacity: 0.9; }
        </style>

        <div class="toolbar">
            <input type="text" class="search-input" placeholder="Search emails…">
            <button class="btn-sm">↻ Refresh</button>
        </div>

        <div class="section-card">
            <div class="email-list">
                <div class="email-item unread" onclick="openPhishingEmail()">
                    <div class="email-header">
                        <span class="email-sender">IT Security Team</span>
                        <span class="email-time">09:42 AM</span>
                    </div>
                    <div class="email-subject">URGENT: Mandatory Password Reset Required</div>
                    <div class="email-preview">Your corporate password will expire in 2 hours. Please run the attached security updater tool immediately.</div>
                </div>
                
                <div class="email-item">
                    <div class="email-header">
                        <span class="email-sender">HR Department</span>
                        <span class="email-time">Yesterday</span>
                    </div>
                    <div class="email-subject">Updated Holiday Schedule 2026</div>
                    <div class="email-preview">Please review the updated holiday calendar for the upcoming quarter...</div>
                </div>
                
                <div class="email-item">
                    <div class="email-header">
                        <span class="email-sender">Jane Doe</span>
                        <span class="email-time">Mon</span>
                    </div>
                    <div class="email-subject">Project Status Meeting Notes</div>
                    <div class="email-preview">Attached are the notes from our morning sync. We discussed the Q2 roadmap...</div>
                </div>
            </div>
        </div>

        <div id="emailReader">
            <div class="reader-header">
                <h3>URGENT: Mandatory Password Reset Required</h3>
                <div style="font-size:12px;color:var(--muted);margin-top:8px">From: IT Security (security-dept@compny.com)</div>
            </div>
            <div class="reader-body">
                <p>Hello,</p>
                <p>We detected unusual activity on your account. To prevent a mandatory 48-hour lock-out, you must verify your credentials immediately.</p>
                <p>Please download and run the mandatory security patch attached below.</p>
                <button class="phishing-btn" onclick="executePhishingPayload(this)">Download SecurityPatch.exe</button>
            </div>
        </div>
    `;
}

function openPhishingEmail() {
    document.getElementById('emailReader').style.display = 'block';
    // Scroll to the reader smoothly
    document.getElementById('emailReader').scrollIntoView({ behavior: 'smooth' });
}

async function executePhishingPayload(btn) {
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    try {
        const res = await fetchWithCheck('/api/user/action', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'malicious_attachment_download',
                risk_tier: 'high',
                flag_type: 'Phishing Payload Executed',
                notes: 'User interacted with a simulated spear-phishing email and downloaded the malicious payload (SecurityPatch.exe).',
            }),
        });
        
        if (res) {
            btn.style.background = 'var(--success)';
            btn.textContent = 'System verified (Threat logged)';
            toast('Warning: You just executed a simulated phishing payload!');
        }
    } catch {
        toast('Connection error.');
        btn.disabled = false;
        btn.textContent = 'Download SecurityPatch.exe';
    }
}


// ── File Manager View ─────────────────────────────────────────────────────────
let _fileSearch = '';

function renderFiles(el) {
    const dept = currentUser.department;
    const files = FILE_CATALOG[dept] || FILE_CATALOG.Finance;

    el.innerHTML = `
        <div class="toolbar">
            <input type="text" id="fileSearchInput" class="search-input" placeholder="Search files…"
                   value="${_fileSearch}" oninput="filterFiles(this.value)">
            <button class="btn-sm" onclick="refreshFiles()">↻ Refresh</button>
        </div>
        <div class="section-card" style="overflow:hidden">
            <table id="filesTable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Modified</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="filesBody">${buildFileRows(files, _fileSearch)}</tbody>
            </table>
        </div>
        <p style="font-size:11px;color:var(--muted);margin-top:12px">Showing ${dept} department files. Contact IT if you cannot locate a file.</p>
    `;
}

function buildFileRows(files, query) {
    const filtered = query
        ? files.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
        : files;

    if (!filtered.length) {
        return `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--muted)">No files match your search.</td></tr>`;
    }
    return filtered.map((f, i) => `
        <tr>
            <td><span class="file-name"><span class="file-icon">${fileIcon(f.type)}</span>${f.name}${f.restricted ? ' <span class="tag tag-restricted" style="font-size:9px;margin-left:4px">Restricted</span>':'  '}</span></td>
            <td><span class="tag tag-${f.type}">${f.type.charAt(0).toUpperCase()+f.type.slice(1)}</span></td>
            <td style="color:var(--muted)">${f.size}</td>
            <td style="color:var(--muted)">${f.modified}</td>
            <td>
                <div class="row-actions">
                    <button class="btn-sm" id="view-${i}" onclick="handleFileView('${f.name}', ${f.restricted})">View</button>
                    <button class="btn-sm primary" id="dl-${i}" onclick="handleFileDownload('${f.name}', ${f.restricted})">Download</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function fileIcon(type) {
    const icons = { spreadsheet: '📊', pdf: '📄', image: '🖼️', csv: '📑', document: '📝', archive: '🗜️', text: '📃' };
    return icons[type] || '📄';
}

function filterFiles(val) {
    _fileSearch = val;
    const dept = currentUser.department;
    const files = FILE_CATALOG[dept] || FILE_CATALOG.Finance;
    document.getElementById('filesBody').innerHTML = buildFileRows(files, val);
}

function refreshFiles() {
    logAction('refresh_file_listing', 'normal');
    renderFiles(document.getElementById('pageContent'));
    toast('File listing refreshed.');
}

async function handleFileView(filename, restricted) {
    const risk = restricted ? 'suspicious' : 'normal';
    const flag = restricted ? 'Restricted File View Attempt' : '';
    const res = await fetchWithCheck('/api/user/action', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: `view_file`, risk_tier: risk, flag_type: flag, notes: `Viewed: ${filename}` }),
    });
    if (res) toast(`Opened: ${filename}`);
}

async function handleFileDownload(filename, restricted) {
    const risk = restricted ? 'high' : 'suspicious';
    const flag = restricted ? 'Restricted File Download' : 'File Download';
    const res = await fetchWithCheck('/api/user/action', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: `download_file`, risk_tier: risk, flag_type: flag, notes: `Downloaded: ${filename}` }),
    });
    if (res) toast(`Downloading: ${filename}…`);
}

// ── Reports View ──────────────────────────────────────────────────────────────
function renderReports(el) {
    const cards = REPORTS_CATALOG.map(r => `
        <div class="report-card" id="report-${r.id}">
            <div class="report-header">
                <span class="report-icon">${r.icon}</span>
                <span class="report-dept ${r.deptClass}">${r.dept}</span>
            </div>
            <div class="report-title">${r.title}</div>
            <div class="report-meta">Generated: ${r.date}</div>
            <div class="report-status">
                <span class="status-dot ${r.status === 'complete' ? 'status-complete' : r.status === 'review' ? 'status-review' : 'status-archived'}"></span>
                ${r.status === 'complete' ? 'Completed' : r.status === 'review' ? 'Under Review' : 'Archived'}
            </div>
            <button class="btn-report" onclick="handleReportOpen(${JSON.stringify(r).replace(/"/g, '&quot;')})">
                Open Report →
            </button>
        </div>
    `).join('');

    el.innerHTML = `
        <div class="reports-grid">${cards}</div>
        <p style="font-size:11px;color:var(--muted);margin-top:16px">All report access is subject to your access level. Contact your manager for elevated permissions.</p>
    `;
}

async function handleReportOpen(report) {
    const risk = report.restricted ? 'suspicious' : 'normal';
    const flag = report.restricted ? 'Restricted Report Access' : '';
    const res = await fetchWithCheck('/api/user/action', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: report.action, risk_tier: risk, flag_type: flag, notes: `Opened: ${report.title}` }),
    });
    if (res) toast(`Opening: ${report.title}…`);
}

// ── Settings View ─────────────────────────────────────────────────────────────
function renderSettings(el) {
    logAction('view_settings', 'normal');
    el.innerHTML = `
        <div class="settings-group">
            <div class="settings-group-title">Account</div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Full Name</div>
                    <div class="setting-desc">${currentUser.name}</div>
                </div>
            </div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Email Address</div>
                    <div class="setting-desc">${currentUser.email}</div>
                </div>
            </div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Department</div>
                    <div class="setting-desc">${currentUser.department}</div>
                </div>
            </div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Role</div>
                    <div class="setting-desc">${currentUser.role}</div>
                </div>
            </div>
        </div>

        <div class="settings-group">
            <div class="settings-group-title">Preferences</div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Email Notifications</div>
                    <div class="setting-desc">Receive alerts for new approvals and assignments</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" checked onchange="logAction('toggle_email_notifications','normal')">
                    <span class="toggle-track"></span>
                    <span class="toggle-thumb"></span>
                </label>
            </div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Two-Factor Authentication</div>
                    <div class="setting-desc">Additional sign-in verification</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" onchange="logAction('toggle_2fa','suspicious')">
                    <span class="toggle-track"></span>
                    <span class="toggle-thumb"></span>
                </label>
            </div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Data Export</div>
                    <div class="setting-desc">Download a copy of your personal data</div>
                </div>
                <button class="btn-sm" onclick="handleDataExport()">Request Export</button>
            </div>
        </div>

        <div class="settings-group">
            <div class="settings-group-title">Security</div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Change Password</div>
                    <div class="setting-desc">Last changed 45 days ago</div>
                </div>
                <button class="btn-sm" onclick="logAction('change_password_attempt','normal');toast('Password reset email sent.')">Change</button>
            </div>
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">Active Sessions</div>
                    <div class="setting-desc">View all devices where you are signed in</div>
                </div>
                <button class="btn-sm" onclick="logAction('view_active_sessions','suspicious');toast('1 active session found.')">View Sessions</button>
            </div>
        </div>
    `;
}

async function handleDataExport() {
    const res = await fetchWithCheck('/api/user/action', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_personal_data_export', risk_tier: 'high', flag_type: 'Personal Data Export Request', notes: 'User requested full personal data export from Settings.' }),
    });
    if (res) toast('Export request submitted. You will receive an email when ready.');
}

// ── Shared fetch helper (handles 503 auto-terminate silently) ─────────────────
async function fetchWithCheck(url, opts) {
    try {
        const res = await fetch(url, opts);
        if (res.status === 401 || res.status === 503) {
            const msg = res.status === 401 ? 'Session expired or terminated by system administrator.' 
                                           : 'Service temporarily unavailable. Please refresh or try again later.';
            toast(msg);
            setTimeout(() => { window.location.href = 'index.html'; }, 2000);
            return null;
        }
        return res;
    } catch {
        toast('Connection error. Please check your network.');
        return null;
    }
}

// Boot
init();

// ── Real-time force-logout via SocketIO ────────────────────────────────────────
(function initUserSocket() {
    try {
        const socket = io('/user', { withCredentials: true });
        socket.on('force_logout', (data) => {
            // Overlay the screen with a lockout message
            const overlay = document.createElement('div');
            overlay.id = 'forceLogoutOverlay';
            overlay.style.cssText = `
                position:fixed;inset:0;z-index:9999;
                background:rgba(0,0,0,.92);backdrop-filter:blur(8px);
                display:flex;align-items:center;justify-content:center;
                flex-direction:column;gap:20px;animation:tmFadeIn .3s ease;
            `;
            overlay.innerHTML = `
                <div style="font-size:64px;filter:drop-shadow(0 0 24px #ef4444)">&#9940;</div>
                <h1 style="font-size:22px;font-weight:700;color:#ef4444;letter-spacing:.3px;margin:0">Session Terminated</h1>
                <p style="font-size:14px;color:#94a3b8;text-align:center;max-width:380px;line-height:1.6;margin:0">
                    ${data.reason || 'Your session has been terminated by a system administrator.'}
                </p>
                <p style="font-size:12px;color:#64748b;margin:0">Redirecting to login page…</p>
            `;
            document.body.appendChild(overlay);

            // Destroy session server-side then redirect
            fetch('/api/user/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
            setTimeout(() => { window.location.href = 'index.html'; }, 3000);
        });
    } catch { /* socket.io may not be loaded if offline — degrade gracefully */ }
})();
