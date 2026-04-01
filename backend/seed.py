"""
Seed the database with 3 demo users + 1 admin.
Run once: python seed.py
"""
from database import get_connection, init_db
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta
import random


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


# ── 3 demo users ────────────────────────────────────────────────────────────
USERS = [
    ('Alice Martin', 'alice@company.com', 'Finance', 'Financial Analyst',      'user123'),
    ('Bob Singh',    'bob@company.com',   'IT',      'Systems Administrator',  'user123'),
    ('Carol White',  'carol@company.com', 'HR',      'HR Manager',             'user123'),
]

ACTIONS  = ['login', 'file_download', 'email_sent', 'vpn_connect', 'logout']
DEVICES  = ['Windows 11', 'Ubuntu 22.04', 'macOS Ventura']
BROWSERS = ['Chrome 122', 'Firefox 115', 'Edge 120']
LOCATIONS = ['New York', 'London', 'Bangalore']
IPS       = ['192.168.1.10', '10.0.0.45', '172.16.8.22']
FP_HOURS  = ['09:00–17:00', '08:00–16:00', '10:00–18:00']


def seed():
    init_db()
    conn = get_connection()
    c = conn.cursor()

    # ── Admin ─────────────────────────────────────────────────────────────
    c.execute("DELETE FROM admins")
    c.execute(
        "INSERT INTO admins (email, password_hash) VALUES (?, ?)",
        ('admin@company.com', generate_password_hash('admin123'))
    )

    # ── Users ─────────────────────────────────────────────────────────────
    c.execute("DELETE FROM flags")
    c.execute("DELETE FROM risk_scores")
    c.execute("DELETE FROM fingerprints")
    c.execute("DELETE FROM user_logs")
    c.execute("DELETE FROM users")

    user_ids = []
    for name, email, dept, role, password in USERS:
        c.execute(
            "INSERT INTO users (name, email, password_hash, department, role, is_active) VALUES (?,?,?,?,?,?)",
            (name, email, generate_password_hash(password), dept, role, 0)
        )
        user_ids.append(c.lastrowid)

    # ── Logs (5–10 per user) ──────────────────────────────────────────────
    for uid in user_ids:
        for _ in range(random.randint(5, 10)):
            c.execute("""
                INSERT INTO user_logs
                    (user_id, timestamp, action, ip_address, device_os, browser, location, sessions_today)
                VALUES (?,?,?,?,?,?,?,?)
            """, (uid, rand_dt(), random.choice(ACTIONS),
                  random.choice(IPS), random.choice(DEVICES),
                  random.choice(BROWSERS), random.choice(LOCATIONS),
                  random.randint(1, 4)))

    # ── Fingerprints ──────────────────────────────────────────────────────
    for uid in user_ids:
        c.execute("""
            INSERT INTO fingerprints
                (user_id, usual_login_hours, common_ip, common_os, common_browser, anomaly_score)
            VALUES (?,?,?,?,?,?)
        """, (uid, random.choice(FP_HOURS),
              random.choice(IPS), random.choice(DEVICES),
              random.choice(BROWSERS), round(random.uniform(0.0, 0.3), 2)))

    # ── Risk Scores (start low) ───────────────────────────────────────────
    for uid in user_ids:
        score = random.randint(0, 20)
        c.execute("""
            INSERT INTO risk_scores (user_id, score, level, last_calculated)
            VALUES (?,?,?,datetime('now'))
        """, (uid, score, risk_level(score)))

    # No pre-seeded flags — flags come from user actions during simulation

    conn.commit()
    conn.close()
    print("[Seed] Database seeded with 3 users (password: user123) + admin (admin123)")


if __name__ == '__main__':
    seed()
