/* login.js — 3 demo personas + manual login */

const PERSONAS = [
    { name: 'Alice Martin',  email: 'alice@company.com', dept: 'Finance',     role: 'Financial Analyst',     color: '#6366f1' },
    { name: 'Bob Singh',     email: 'bob@company.com',   dept: 'IT',          role: 'Systems Administrator', color: '#06b6d4' },
    { name: 'Carol White',   email: 'carol@company.com', dept: 'HR',          role: 'HR Manager',            color: '#ec4899' },
];

const PASSWORD = 'user123';

// Render persona cards
const listEl = document.getElementById('personaList');
listEl.innerHTML = PERSONAS.map(p => {
    const initials = p.name.split(' ').map(w => w[0]).join('');
    return `
        <div class="persona-card" onclick="quickLogin('${p.email}')">
            <div class="persona-avatar" style="background:${p.color}">${initials}</div>
            <div class="persona-info">
                <div class="persona-name">${p.name}</div>
                <div class="persona-meta">${p.dept} · ${p.role}</div>
            </div>
            <span class="persona-dept">${p.dept}</span>
        </div>`;
}).join('');

// Quick login via card click
async function quickLogin(email) {
    await doLogin(email, PASSWORD);
}

// Form submit
const form     = document.getElementById('loginForm');
const emailEl  = document.getElementById('email');
const passEl   = document.getElementById('password');
const errorEl  = document.getElementById('errorMsg');
const submitEl = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const email    = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) { errorEl.textContent = 'Email and password are required.'; return; }
    await doLogin(email, password);
});

async function doLogin(email, password) {
    submitEl.disabled    = true;
    submitEl.textContent = 'Signing in…';
    errorEl.textContent  = '';
    try {
        const res = await fetch('/api/user/login', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
            window.location.href = 'portal.html';
        } else {
            errorEl.textContent = data.error || 'Login failed.';
        }
    } catch {
        errorEl.textContent = 'Cannot reach server. Is Flask running?';
    } finally {
        submitEl.disabled    = false;
        submitEl.textContent = 'Sign In';
    }
}
