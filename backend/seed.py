"""
Seed the database with sample admin and user data.
Run once: python seed.py
"""
from database import get_connection, init_db
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta
import random

# ── helpers ──────────────────────────────────────────────────────────────────

def rand_dt(days_back=7):
    base = datetime.now() - timedelta(days=random.randint(0, days_back),
                                       hours=random.randint(0, 23),
                                       minutes=random.randint(0, 59))
    return base.strftime('%Y-%m-%d %H:%M:%S')


def risk_level(score):
    if score < 40:
        return 'Low'
    elif score < 70:
        return 'Medium'
    return 'High'


# ── seed data ────────────────────────────────────────────────────────────────

USERS = [
    ('Alice Martin',   'alice@company.com',   'Finance'),
    ('Bob Singh',      'bob@company.com',     'IT'),
    ('Carol White',    'carol@company.com',   'HR'),
    ('David Lee',      'david@company.com',   'Engineering'),
    ('Eva Turner',     'eva@company.com',     'Legal'),
    ('Frank Adams',    'frank@company.com',   'IT'),
    ('Grace Patel',    'grace@company.com',   'Finance'),
    ('Henry Brooks',   'henry@company.com',   'Engineering'),
]

ACTIONS = ['login', 'file_download', 'privilege_access', 'email_sent',
           'vpn_connect', 'usb_insert', 'config_change', 'logout']

DEVICES = ['Windows 11', 'Ubuntu 22.04', 'macOS Ventura', 'Windows 10']
BROWSERS = ['Chrome 122', 'Firefox 115', 'Edge 120', 'Safari 17']
LOCATIONS = ['New York', 'London', 'Bangalore', 'Berlin', 'Chicago']
IPS = ['192.168.1.10', '10.0.0.45', '172.16.8.22', '203.0.113.5', '198.51.100.9']

FINGERPRINT_HOURS = ['09:00–17:00', '08:00–16:00', '10:00–18:00', '07:00–15:00']

FLAG_TYPES = [
    ('After-Hours Login',      'Medium'),
    ('Unusual File Download',  'High'),
    ('Privilege Escalation',   'High'),
    ('USB Device Inserted',    'Medium'),
    ('Multiple Failed Logins', 'Low'),
    ('VPN from New Location',  'Medium'),
    ('Large Data Exfiltration','High'),
]


def seed():
    init_db()
    conn = get_connection()
    c = conn.cursor()

    # ── Admin ────────────────────────────────────────────────────────────────
    c.execute("DELETE FROM admins")
    c.execute(
        "INSERT INTO admins (email, password_hash) VALUES (?, ?)",
        ('admin@company.com', generate_password_hash('admin123'))
    )

    # ── Users ────────────────────────────────────────────────────────────────
    c.execute("DELETE FROM flags")
    c.execute("DELETE FROM risk_scores")
    c.execute("DELETE FROM fingerprints")
    c.execute("DELETE FROM user_logs")
    c.execute("DELETE FROM users")

    user_ids = []
    for name, email, dept in USERS:
        is_active = random.choice([0, 1])
        c.execute(
            "INSERT INTO users (name, email, department, is_active) VALUES (?,?,?,?)",
            (name, email, dept, is_active)
        )
        user_ids.append(c.lastrowid)

    # ── Logs (8–15 per user) ─────────────────────────────────────────────────
    for uid in user_ids:
        for _ in range(random.randint(8, 15)):
            c.execute("""
                INSERT INTO user_logs
                    (user_id, timestamp, action, ip_address, device_os, browser, location, sessions_today)
                VALUES (?,?,?,?,?,?,?,?)
            """, (uid, rand_dt(), random.choice(ACTIONS),
                  random.choice(IPS), random.choice(DEVICES),
                  random.choice(BROWSERS), random.choice(LOCATIONS),
                  random.randint(1, 6)))

    # ── Fingerprints ─────────────────────────────────────────────────────────
    for uid in user_ids:
        c.execute("""
            INSERT INTO fingerprints
                (user_id, usual_login_hours, common_ip, common_os, common_browser, anomaly_score)
            VALUES (?,?,?,?,?,?)
        """, (uid, random.choice(FINGERPRINT_HOURS),
              random.choice(IPS), random.choice(DEVICES),
              random.choice(BROWSERS), round(random.uniform(0.0, 1.0), 2)))

    # ── Risk Scores ───────────────────────────────────────────────────────────
    for uid in user_ids:
        score = random.randint(0, 100)
        c.execute("""
            INSERT INTO risk_scores (user_id, score, level, last_calculated)
            VALUES (?,?,?,datetime('now'))
        """, (uid, score, risk_level(score)))

    # ── Flags ─────────────────────────────────────────────────────────────────
    for uid in user_ids:
        num_flags = random.randint(0, 3)
        for _ in range(num_flags):
            ft, sev = random.choice(FLAG_TYPES)
            c.execute("""
                INSERT INTO flags (user_id, timestamp, flag_type, severity, resolved, notes)
                VALUES (?,?,?,?,?,?)
            """, (uid, rand_dt(3), ft, sev,
                  random.choice([0, 0, 0, 1]),  # mostly unresolved
                  'Auto-generated alert'))

    conn.commit()
    conn.close()
    print("[Seed] Database seeded successfully.")


if __name__ == '__main__':
    seed()
