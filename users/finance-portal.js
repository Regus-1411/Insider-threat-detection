/* finance-portal.js */

let currentUser = null;

// ── Fake transaction data ─────────────────────────────────────────────────────
const TRANSACTIONS = [
    { date: '2025-03-28', id: 'TXN-9921', desc: 'Vendor Payment — OfficeMax',      amount: -4200,   type: 'Debit',  status: 'Completed', auth: 'Alice Martin' },
    { date: '2025-03-27', id: 'TXN-9920', desc: 'Client Invoice #1042',             amount: +38000,  type: 'Credit', status: 'Completed', auth: 'Grace Patel' },
    { date: '2025-03-26', id: 'TXN-9919', desc: 'AWS Cloud Infrastructure',         amount: -12400,  type: 'Debit',  status: 'Completed', auth: 'Bob Singh' },
    { date: '2025-03-25', id: 'TXN-9918', desc: 'Salary Disbursement — March',      amount: -284000, type: 'Debit',  status: 'Completed', auth: 'HR Payroll' },
    { date: '2025-03-23', id: 'TXN-9917', desc: 'Client Invoice #1041',             amount: +15500,  type: 'Credit', status: 'Pending',   auth: 'Grace Patel' },
    { date: '2025-03-22', id: 'TXN-9916', desc: 'Office Rental — Q1',               amount: -22000,  type: 'Debit',  status: 'Completed', auth: 'Alice Martin' },
    { date: '2025-03-20', id: 'TXN-9915', desc: 'Software License Renewal',         amount: -8900,   type: 'Debit',  status: 'Completed', auth: 'Alice Martin' },
    { date: '2025-03-18', id: 'TXN-9914', desc: 'Client Invoice #1040',             amount: +72000,  type: 'Credit', status: 'Completed', auth: 'Grace Patel' },
    { date: '2025-03-15', id: 'TXN-9913', desc: 'Travel Expenses Reimbursement',    amount: -3240,   type: 'Debit',  status: 'Completed', auth: 'Alice Martin' },
    { date: '2025-03-10', id: 'TXN-9912', desc: 'Marketing Campaign — Q1',          amount: -19800,  type: 'Debit',  status: 'Completed', auth: 'Alice Martin' },
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
    document.getElementById('userRoleLabel').textContent =
        `${currentUser.role || 'Finance'} — Financial operations and transaction management`;
    renderTransactions();
}

// ── Render transaction table ──────────────────────────────────────────────────
function renderTransactions() {
    document.getElementById('txTable').innerHTML = TRANSACTIONS.map(tx => {
        const isPos = tx.amount > 0;
        const amtStr = (isPos ? '+' : '') + '$' + Math.abs(tx.amount).toLocaleString();
        const statusClass = tx.status === 'Completed' ? 'badge-active' : 'badge-medium';
        return `
        <tr>
            <td style="color:var(--muted);font-size:12px">${tx.date}</td>
            <td style="font-size:12px;font-family:monospace;color:var(--muted)">${tx.id}</td>
            <td>${tx.desc}</td>
            <td style="font-weight:600;color:${isPos ? 'var(--low)' : 'var(--text)'}">${amtStr}</td>
            <td><span class="badge ${isPos ? 'badge-active' : 'badge-normal'}">${tx.type}</span></td>
            <td><span class="badge ${statusClass}">${tx.status}</span></td>
            <td style="color:var(--muted);font-size:12px">${tx.auth}</td>
        </tr>`;
    }).join('');
}

// ── Normal actions ────────────────────────────────────────────────────────────
function exportMonthly() {
    postAction('export_monthly_report', 'normal', '', '');
    showToast('✅ Monthly report exported successfully.', 'ok');
}

function approveExpense(name) {
    postAction('approve_expense_report', 'normal', '', '');
    showToast(`✅ Approved: ${name}`, 'ok');
}

// ── SUSPICIOUS actions ────────────────────────────────────────────────────────
function accessPayroll() {
    if (!confirm('⚠️ SENSITIVE\n\nAccessing payroll data will raise a Medium alert.\nProceed?')) return;
    postAction('after_hours_payroll_access', 'suspicious', 'After-Hours Payroll Access', 'Finance user accessed payroll data.');
    showToast('⚠️ Payroll accessed — Medium alert raised.', 'medium');
}

function linkExternal() {
    if (!confirm('⚠️ SENSITIVE\n\nLinking an unverified external bank account will raise a security alert.\nProceed?')) return;
    postAction('link_external_account', 'suspicious', 'Unusual External Account Link', 'User attempted to link an unverified bank account.');
    showToast('⚠️ External account link — Medium alert raised.', 'medium');
}

// ── HIGH actions ──────────────────────────────────────────────────────────────
async function bulkDownloadAll() {
    if (!confirm('🚨 RESTRICTED ACTION\n\n"Bulk Download All Financial Records"\n\nThis will export 3 years of financial data and trigger a HIGH-severity security flag.\n\nThis action will be immediately reported to administrators.\n\nProceed anyway?')) return;

    const btn = document.getElementById('bulkBtn');
    btn.disabled = true;
    btn.textContent = 'Downloading…';

    await postAction(
        'bulk_download_financials',
        'high',
        'Bulk Financial Data Download',
        'User triggered a mass export of 3 years of financial transaction records.'
    );

    // Show the anomaly alert banner prominently
    document.getElementById('anomalyAlert').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    showToast('🚨 HIGH THREAT FLAGGED — Admin has been notified!', 'high');

    btn.textContent = 'Download Blocked';
    btn.style.opacity = '0.5';
}

function initiateTransfer() {
    if (!confirm('🚨 RESTRICTED ACTION\n\n"Initiate $500k+ Wire Transfer"\n\nThis will trigger a HIGH-severity fraud flag.\n\nProceed anyway?')) return;
    postAction('initiate_large_transfer', 'high', 'Unauthorized Fund Transfer', 'User initiated a $500k+ transfer to an unverified overseas account.');
    showToast('🚨 Unauthorized transfer flagged — HIGH alert raised.', 'high');
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
    toastTimer = setTimeout(() => { el.className = ''; }, 5000);
}

init();
