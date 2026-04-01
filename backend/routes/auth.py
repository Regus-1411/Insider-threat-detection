from flask import Blueprint, request, jsonify, session
from database import get_connection
from werkzeug.security import check_password_hash

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json(force=True)
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    conn = get_connection()
    admin = conn.execute(
        "SELECT * FROM admins WHERE email = ?", (email,)
    ).fetchone()
    conn.close()

    if not admin or not check_password_hash(admin['password_hash'], password):
        return jsonify({'error': 'Invalid credentials'}), 401

    session['admin_id'] = admin['id']
    session['admin_email'] = admin['email']
    return jsonify({'message': 'Login successful', 'email': admin['email']}), 200


@auth_bp.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    session.clear()
    return jsonify({'message': 'Logged out'}), 200


@auth_bp.route('/api/admin/me', methods=['GET'])
def admin_me():
    if 'admin_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify({'email': session['admin_email']}), 200


# ── Terminate a user session (force-logout) ───────────────────────────────────
@auth_bp.route('/api/admin/terminate/<int:user_id>', methods=['POST'])
def terminate_session(user_id):
    if 'admin_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    conn = get_connection()

    # Mark user as inactive
    conn.execute("UPDATE users SET is_active=0 WHERE id=?", (user_id,))

    # Log the forced termination
    conn.execute("""
        INSERT INTO user_logs (user_id, action, ip_address, device_os, browser, location, sessions_today)
        VALUES (?, 'session_terminated_by_admin', 'Admin', 'Admin Console', 'Admin Console', 'Admin', 0)
    """, (user_id,))

    # Resolve any off-hours flags for this user
    conn.execute("""
        UPDATE flags SET resolved=1
        WHERE user_id=? AND flag_type='After-Hours Login' AND resolved=0
    """, (user_id,))

    conn.commit()
    conn.close()

    return jsonify({'message': f'Session terminated for user {user_id}'}), 200


# ── Get active sessions with off-hours flags ──────────────────────────────────
@auth_bp.route('/api/admin/active-sessions', methods=['GET'])
def active_sessions():
    if 'admin_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.email, u.department, u.is_active,
               f.flag_type, f.severity, f.timestamp as flag_time, f.id as flag_id
        FROM users u
        LEFT JOIN flags f ON f.user_id = u.id
            AND f.flag_type = 'After-Hours Login'
            AND f.resolved = 0
        WHERE u.is_active = 1
        ORDER BY f.timestamp DESC
    """).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows]), 200
