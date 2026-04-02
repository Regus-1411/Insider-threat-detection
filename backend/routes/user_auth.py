from flask import Blueprint, jsonify, request, session
from database import get_connection
from werkzeug.security import check_password_hash
from datetime import datetime

user_bp = Blueprint('user', __name__)


def _get_client_info():
    """Extract real client info from the request context."""
    ip = request.remote_addr or '127.0.0.1'
    ua = request.headers.get('User-Agent', 'Unknown')
    # Rough browser/OS parsing from UA string
    ua_low = ua.lower()
    if 'firefox' in ua_low:   browser = 'Firefox'
    elif 'edg' in ua_low:     browser = 'Edge'
    elif 'chrome' in ua_low:  browser = 'Chrome'
    elif 'safari' in ua_low:  browser = 'Safari'
    else:                     browser = 'Unknown'
    if 'windows' in ua_low:   os_name = 'Windows'
    elif 'mac' in ua_low:     os_name = 'macOS'
    elif 'linux' in ua_low:   os_name = 'Linux'
    elif 'android' in ua_low: os_name = 'Android'
    else:                     os_name = 'Unknown'
    return ip, os_name, browser


def require_user():
    user_id = session.get('user_id')
    if not user_id:
        return True
    
    # Check if admin forcibly terminated the session (is_active = 0)
    conn = get_connection()
    row = conn.execute("SELECT is_active FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    
    if not row or row['is_active'] == 0:
        # Session was killed. Pop session variables quietly
        session.pop('user_id', None)
        session.pop('user_name', None)
        session.pop('user_dept', None)
        session.pop('user_role', None)
        session.pop('user_email', None)
        return True
    
    return False


def _bump_risk(conn, user_id, delta):
    """Increase risk score by delta, cap at 100, update level."""
    row = conn.execute(
        "SELECT score FROM risk_scores WHERE user_id=?", (user_id,)
    ).fetchone()
    if not row:
        return
    new_score = min(100, row['score'] + delta)
    if new_score < 40:
        level = 'Low'
    elif new_score < 70:
        level = 'Medium'
    else:
        level = 'High'
    conn.execute(
        "UPDATE risk_scores SET score=?, level=?, last_calculated=datetime('now') WHERE user_id=?",
        (new_score, level, user_id)
    )
    return new_score


# ── User login ────────────────────────────────────────────────────────────────

@user_bp.route('/api/user/login', methods=['POST'])
def user_login():
    data     = request.get_json(force=True)
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    conn = get_connection()
    user = conn.execute(
        "SELECT * FROM users WHERE email=?", (email,)
    ).fetchone()

    if not user or not user['password_hash'] or \
       not check_password_hash(user['password_hash'], password):
        conn.close()
        return jsonify({'error': 'Invalid credentials'}), 401

    ip, os_name, browser = _get_client_info()

    # Mark user as active
    conn.execute("UPDATE users SET is_active=1 WHERE id=?", (user['id'],))

    # Log the login action
    conn.execute("""
        INSERT INTO user_logs (user_id, action, ip_address, device_os, browser, location, sessions_today)
        VALUES (?, 'login', ?, ?, ?, ?, 1)
    """, (user['id'], ip, os_name, browser, 'Network Login'))

    conn.commit()
    conn.close()

    session['user_id']   = user['id']
    session['user_name'] = user['name']
    session['user_dept'] = user['department']
    session['user_role'] = user['role']
    session['user_email']= user['email']

    return jsonify({
        'id':         user['id'],
        'name':       user['name'],
        'email':      user['email'],
        'department': user['department'],
        'role':       user['role'],
    }), 200


@user_bp.route('/api/user/logout', methods=['POST'])
def user_logout():
    uid = session.get('user_id')
    if uid:
        ip, os_name, browser = _get_client_info()
        conn = get_connection()
        conn.execute("UPDATE users SET is_active=0 WHERE id=?", (uid,))
        conn.execute("""
            INSERT INTO user_logs (user_id, action, ip_address, device_os, browser, location, sessions_today)
            VALUES (?, 'logout', ?, ?, ?, ?, 0)
        """, (uid, ip, os_name, browser, 'Network Logout'))
        conn.commit()
        conn.close()
    session.pop('user_id', None)
    session.pop('user_name', None)
    session.pop('user_dept', None)
    session.pop('user_role', None)
    session.pop('user_email', None)
    return jsonify({'message': 'Logged out'}), 200


@user_bp.route('/api/user/me', methods=['GET'])
def user_me():
    if require_user():
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify({
        'id':         session['user_id'],
        'name':       session['user_name'],
        'email':      session['user_email'],
        'department': session['user_dept'],
        'role':       session.get('user_role', 'Employee'),
    }), 200


# ── Action logger ─────────────────────────────────────────────────────────────

@user_bp.route('/api/user/action', methods=['POST'])
def log_action():
    if require_user():
        return jsonify({'error': 'Not authenticated'}), 401

    data      = request.get_json(force=True) or {}
    action    = data.get('action', 'unknown')
    risk_tier = data.get('risk_tier', 'normal')   # normal | suspicious | high
    flag_type = data.get('flag_type', '')
    notes     = data.get('notes', '')
    user_id   = session.get('user_id')  # safe get — interceptor may have cleared session

    # Guard: if interceptor already terminated this session, bail out silently
    if not user_id:
        return jsonify({'error': 'Service temporarily unavailable. Please try again later.'}), 503

    ip, os_name, browser = _get_client_info()

    conn = get_connection()

    # Count actions today (not sessions) for this user
    today = datetime.now().strftime('%Y-%m-%d')
    actions_today = conn.execute("""
        SELECT COUNT(*) FROM user_logs
        WHERE user_id=? AND date(timestamp)=?
    """, (user_id, today)).fetchone()[0] + 1

    # Write log entry with real client info
    conn.execute("""
        INSERT INTO user_logs
            (user_id, action, ip_address, device_os, browser, location, sessions_today)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (user_id, action, ip, os_name, browser, 'Employee Portal', actions_today))

    # Auto-generate flag for suspicious / high-risk actions
    if risk_tier in ('suspicious', 'high'):
        severity = 'High' if risk_tier == 'high' else 'Medium'
        conn.execute("""
            INSERT INTO flags (user_id, flag_type, severity, resolved, notes)
            VALUES (?, ?, ?, 0, ?)
        """, (user_id, flag_type or action, severity, notes or 'Triggered via user portal simulation'))

        # Bump risk score: suspicious +8, high +18
        delta = 18 if risk_tier == 'high' else 8
        new_score = _bump_risk(conn, user_id, delta)

        try:
            from app import socketio
            socketio.emit('security_alert', {
                'user_id':   user_id,
                'user_name': session.get('user_name', 'Unknown'),
                'flag':      flag_type or action,
                'severity':  severity,
                'notes':     notes or 'Triggered via user portal simulation',
                'score':     new_score,
                'timestamp': datetime.utcnow().isoformat(),
            }, namespace='/admin')
        except Exception:
            pass

    conn.commit()
    conn.close()

    # Return updated risk (for UI feedback)
    conn2 = get_connection()
    risk  = conn2.execute(
        "SELECT score, level FROM risk_scores WHERE user_id=?", (user_id,)
    ).fetchone()
    conn2.close()

    return jsonify({
        'logged': True,
        'risk_score': risk['score'] if risk else 0,
        'risk_level': risk['level'] if risk else 'Low',
    }), 200
