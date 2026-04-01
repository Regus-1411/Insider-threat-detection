const API = '';   // same origin — Flask serves this file

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

    if (!email || !password) {
        errorEl.textContent = 'Email and password are required.';
        return;
    }

    submitEl.disabled = true;
    submitEl.textContent = 'Signing in…';

    try {
        const res = await fetch(`${API}/api/admin/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (res.ok) {
            window.location.href = 'dashboard.html';
        } else {
            errorEl.textContent = data.error || 'Login failed.';
        }
    } catch (err) {
        errorEl.textContent = 'Cannot reach server. Is Flask running?';
    } finally {
        submitEl.disabled = false;
        submitEl.textContent = 'Sign In';
    }
});
