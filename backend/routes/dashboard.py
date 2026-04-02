from flask import Blueprint, jsonify, session, request
from database import get_connection
from services.search_service import search, aggregations

dashboard_bp = Blueprint('dashboard', __name__)


def require_auth():
    return 'admin_id' not in session


# ─── Summary ──────────────────────────────────────────────────────────────────

@dashboard_bp.route('/api/summary', methods=['GET'])
def summary():
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_connection()

    total_users  = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    active_users = conn.execute("SELECT COUNT(*) FROM users WHERE is_active=1").fetchone()[0]

    flags_today  = conn.execute("""
        SELECT COUNT(*) FROM flags
        WHERE date(timestamp) = date('now') AND resolved = 0
    """).fetchone()[0]

    high_risk = conn.execute("""
        SELECT COUNT(*) FROM risk_scores WHERE level = 'High'
    """).fetchone()[0]

    conn.close()
    return jsonify({
        'total_users':  total_users,
        'active_users': active_users,
        'flags_today':  flags_today,
        'high_risk':    high_risk,
    })


# ─── Users list (basic) ───────────────────────────────────────────────────────

@dashboard_bp.route('/api/users', methods=['GET'])
def users():
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_connection()
    rows = conn.execute("""
        SELECT
            u.id,
            u.name,
            u.email,
            u.department,
            u.is_active,
            MAX(l.timestamp)               AS last_active,
            COALESCE(MAX(l.sessions_today), 0) AS sessions_today,
            COALESCE(r.score, 0)           AS risk_score,
            COALESCE(r.level, 'Low')       AS risk_level
        FROM users u
        LEFT JOIN user_logs l  ON l.user_id = u.id
        LEFT JOIN risk_scores r ON r.user_id = u.id
        GROUP BY u.id
        ORDER BY r.score DESC
    """).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


# ─── Single user detail (fingerprint + risk + flags) ─────────────────────────

@dashboard_bp.route('/api/users/<int:user_id>', methods=['GET'])
def user_detail(user_id):
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_connection()

    user = conn.execute("""
        SELECT u.id, u.name, u.email, u.department, u.is_active,
               MAX(l.timestamp)               AS last_active,
               COALESCE(MAX(l.sessions_today),0) AS sessions_today,
               COALESCE(r.score, 0)           AS risk_score,
               COALESCE(r.level, 'Low')        AS risk_level,
               r.last_calculated
        FROM users u
        LEFT JOIN user_logs   l ON l.user_id = u.id
        LEFT JOIN risk_scores r ON r.user_id = u.id
        WHERE u.id = ?
        GROUP BY u.id
    """, (user_id,)).fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    fp = conn.execute("""
        SELECT usual_login_hours, common_ip, common_os, common_browser,
               anomaly_score, last_updated
        FROM fingerprints WHERE user_id = ?
    """, (user_id,)).fetchone()

    flags = conn.execute("""
        SELECT id, timestamp, flag_type, severity, resolved, notes
        FROM flags WHERE user_id = ?
        ORDER BY timestamp DESC
    """, (user_id,)).fetchall()

    conn.close()

    return jsonify({
        'user':        dict(user),
        'fingerprint': dict(fp) if fp else None,
        'flags':       [dict(f) for f in flags],
    })


# ─── Terminate user session ───────────────────────────────────────────────────

@dashboard_bp.route('/api/users/<int:user_id>/terminate', methods=['POST'])
def terminate_session(user_id):
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_connection()
    conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Session terminated'})


# ─── Terminate via /api/admin/terminate/<id> (used by dashboard.js) ──────────

@dashboard_bp.route('/api/admin/terminate/<int:user_id>', methods=['POST'])
def admin_terminate(user_id):
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_connection()
    conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Session terminated'})


# ─── Active sessions with off-hours flags ─────────────────────────────────────

@dashboard_bp.route('/api/admin/active-sessions', methods=['GET'])
def active_sessions():
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_connection()
    rows = conn.execute("""
        SELECT
            u.id, u.name, u.email, u.department,
            f.flag_type, f.severity, f.timestamp AS flag_time
        FROM users u
        JOIN flags f ON f.user_id = u.id
        WHERE u.is_active = 1
          AND f.resolved  = 0
        ORDER BY f.timestamp DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── Resolve a flag ───────────────────────────────────────────────────────────

@dashboard_bp.route('/api/flags/<int:flag_id>/resolve', methods=['POST'])
def resolve_flag(flag_id):
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_connection()
    conn.execute("UPDATE flags SET resolved = 1 WHERE id = ?", (flag_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Flag resolved'})


# ─── Risk scores (used by portal.js risk bar) ────────────────────────────────

@dashboard_bp.route('/api/risk', methods=['GET'])
def risk_scores():
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.name, r.score, r.level
        FROM risk_scores r
        JOIN users u ON u.id = r.user_id
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── Forensic search (Elastic-Mock) ──────────────────────────────────────────

@dashboard_bp.route('/api/forensic/search', methods=['GET'])
def forensic_search():
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    query    = request.args.get('q', '')
    uid      = request.args.get('user_id', type=int)
    severity = request.args.get('severity', '')
    limit    = request.args.get('limit', 100, type=int)

    results = search(query=query, user_id=uid,
                     severity=severity or None, limit=limit)
    return jsonify(results)


@dashboard_bp.route('/api/forensic/aggregations', methods=['GET'])
def forensic_aggregations():
    if require_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    return jsonify(aggregations())
