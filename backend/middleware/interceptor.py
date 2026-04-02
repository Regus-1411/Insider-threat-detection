"""
interceptor.py — Global silent security middleware.

DESIGN PRINCIPLES (to avoid false positives):
─────────────────────────────────────────────
  ● The interceptor ONLY handles BEHAVIOURAL anomalies:
        - Velocity flooding (too many requests in a short window)
        - Probing admin/system endpoints while authenticated as a user
        - Repeated rapid access to the file/report download APIs

  ● The interceptor does NOT re-inspect the content of /api/user/action.
    That route already handles content-based risk scoring in user_auth.py.
    Double-inspecting would cause every flagged action to bump risk twice.

  ● Sensitive keyword matching applies ONLY to the request PATH, never to
    the POST body (which contains flag labels the route already processed).

  ● Velocity counter resets naturally; a single burst does NOT accumulate
    across multiple windows.
"""

import time
from collections import defaultdict
from datetime import datetime
from flask import request, session, jsonify

# ── In-memory velocity tracker: {user_id: [monotonic_timestamp, ...]} ─────────
_velocity: dict[int, list[float]] = defaultdict(list)

VELOCITY_WINDOW   = 60    # seconds
VELOCITY_LIMIT    = 60    # requests per window — raised to prevent false positives
HARD_RISK_LIMIT   = 90    # auto-terminate threshold — raised so single action doesn't kill session
VELOCITY_DELTA    = 12    # risk bump for confirmed velocity flood

# Paths that the route handler already manages — interceptor must NOT re-score
ROUTE_MANAGED = {
    '/api/user/action',
    '/api/user/login',
    '/api/user/logout',
    '/api/user/me',
}

# Path fragments that indicate a user is probing admin/system endpoints
# (These are unexpected for an authenticated employee navigating the portal)
ADMIN_PROBE_FRAGMENTS = [
    '/api/admin/',
    '/api/forensic/',
    '/api/summary',
    '/api/flags/',
]

# Specific user-facing paths that should trigger a sensitive-access flag
# if a user accesses them VERY frequently (download hammering)
DOWNLOAD_PATH_FRAGMENTS = [
    '/api/user/download',
    '/api/user/export',
    '/api/user/bulk',
]

# ── Per-user download rate tracking (separate window) ─────────────────────────
_download_velocity: dict[int, list[float]] = defaultdict(list)
DOWNLOAD_WINDOW = 30   # seconds
DOWNLOAD_LIMIT  = 8    # max downloads in 30 seconds before flagging


def _now_ts() -> float:
    return time.monotonic()


def _clean_window(timestamps: list[float], window: float) -> list[float]:
    cutoff = _now_ts() - window
    return [t for t in timestamps if t > cutoff]


def _is_admin_probe(path: str) -> bool:
    """True if an authenticated user is hitting admin-only endpoints."""
    low = path.lower()
    return any(frag in low for frag in ADMIN_PROBE_FRAGMENTS)


def _is_download_hammer(path: str) -> bool:
    low = path.lower()
    return any(frag in low for frag in DOWNLOAD_PATH_FRAGMENTS)


def _bump_risk(conn, user_id: int, delta: int) -> int:
    """Increase risk score, cap at 100, update level. Returns new score."""
    row = conn.execute(
        "SELECT score FROM risk_scores WHERE user_id=?", (user_id,)
    ).fetchone()
    if not row:
        return 0
    new_score = min(100, row['score'] + delta)
    level = ('Low' if new_score < 40 else 'Medium' if new_score < 70 else 'High')
    conn.execute("""
        UPDATE risk_scores
        SET score=?, level=?, last_calculated=datetime('now')
        WHERE user_id=?
    """, (new_score, level, user_id))
    return new_score


def _auto_terminate(conn, user_id: int) -> None:
    conn.execute("UPDATE users SET is_active=0 WHERE id=?", (user_id,))
    conn.execute("""
        INSERT INTO flags (user_id, flag_type, severity, resolved, notes)
        VALUES (?, 'auto_terminated', 'Critical', 0,
                'Session auto-terminated by middleware — risk threshold exceeded.')
    """, (user_id,))
    conn.commit()
    session.clear()


def _emit_alert(socketio, payload: dict) -> None:
    try:
        socketio.emit('security_alert', payload, namespace='/admin')
    except Exception:
        pass


def register_interceptor(app, socketio):
    """
    Attach the security interceptor to the Flask app.
    Must be called after all blueprints are registered.
    """
    from database import get_connection

    @app.before_request
    def intercept():
        # ── Gate 1: Only act on authenticated USER sessions ────────────────────
        # Skip if session belongs to an active Admin (to prevent admin panel 
        # polling from triggering false "admin probing" flags due to shared cookies).
        if session.get('admin_id'):
            return

        user_id = session.get('user_id')
        if not user_id:
            return          # anonymous — skip entirely

        # Skip static assets (e.g. /users/style.css), only intercept /api/ requests
        path   = request.path
        if not path.startswith('/api/'):
            return

        flags_to_raise = []

        # ── Gate 2: Skip paths the route already scores ────────────────────────
        # user_auth.py handles /api/user/action fully; no double-counting.
        if path in ROUTE_MANAGED:
            # Still count velocity but do not flag on content
            _velocity[user_id] = _clean_window(_velocity[user_id], VELOCITY_WINDOW)
            _velocity[user_id].append(_now_ts())
            return

        # ── Check 1: Velocity flooding ─────────────────────────────────────────
        _velocity[user_id] = _clean_window(_velocity[user_id], VELOCITY_WINDOW)
        _velocity[user_id].append(_now_ts())
        req_count = len(_velocity[user_id])

        if req_count > VELOCITY_LIMIT:
            flags_to_raise.append({
                'flag_type': 'velocity_flooding',
                'severity':  'High',
                'notes':     f'User made {req_count} requests in {VELOCITY_WINDOW}s — possible scraping.',
                'delta':     VELOCITY_DELTA,
            })

        # ── Check 2: Admin/system endpoint probing ─────────────────────────────
        if _is_admin_probe(path):
            flags_to_raise.append({
                'flag_type': 'admin_endpoint_probe',
                'severity':  'High',
                'notes':     f'Authenticated user attempted to access admin endpoint: {path}',
                'delta':     20,
            })

        # ── Check 3: Download hammering (separate rate-limit window) ───────────
        if _is_download_hammer(path):
            _download_velocity[user_id] = _clean_window(
                _download_velocity[user_id], DOWNLOAD_WINDOW
            )
            _download_velocity[user_id].append(_now_ts())
            dl_count = len(_download_velocity[user_id])

            if dl_count > DOWNLOAD_LIMIT:
                flags_to_raise.append({
                    'flag_type': 'bulk_download_attempt',
                    'severity':  'High',
                    'notes':     f'{dl_count} download requests in {DOWNLOAD_WINDOW}s.',
                    'delta':     15,
                })

        # ── Apply flags ────────────────────────────────────────────────────────
        if not flags_to_raise:
            return     # clean request — no DB write

        conn = get_connection()
        try:
            for flag in flags_to_raise:
                conn.execute("""
                    INSERT INTO flags (user_id, flag_type, severity, resolved, notes)
                    VALUES (?, ?, ?, 0, ?)
                """, (user_id, flag['flag_type'], flag['severity'], flag['notes']))

                new_score = _bump_risk(conn, user_id, flag['delta'])

                _emit_alert(socketio, {
                    'user_id':   user_id,
                    'user_name': session.get('user_name', 'Unknown'),
                    'flag':      flag['flag_type'],
                    'severity':  flag['severity'],
                    'notes':     flag['notes'],
                    'score':     new_score,
                    'timestamp': datetime.utcnow().isoformat(),
                })

                # ── Auto-terminate if above hard limit ──────────────────────
                if new_score >= HARD_RISK_LIMIT:
                    _auto_terminate(conn, user_id)
                    conn.close()
                    return jsonify({
                        'error': 'Service temporarily unavailable. Please try again later.'
                    }), 503

            conn.commit()
        finally:
            conn.close()
