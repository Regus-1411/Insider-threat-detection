"""
interceptor.py — Global silent behavioural security middleware.

ARCHITECTURE NOTE
─────────────────
This interceptor handles BEHAVIOURAL anomalies only:
  • Velocity flooding  — too many requests in a sliding time window
  • Admin probing      — authenticated user hitting admin-only API paths
  • Download hammering — rapid bulk export/download requests

It deliberately does NOT re-score /api/user/action or any path in
ROUTE_MANAGED. Those routes are fully scored by user_auth.py. Double-scoring
would cause every flagged action to bump risk twice, making the system
hyper-sensitive and unreliable.

Keyword matching applies ONLY to the request PATH, never to POST bodies.
"""

import time
from collections import defaultdict
from datetime import datetime
from flask import request, session, jsonify

# ── Velocity config ─────────────────────────────────────────────────────────────
VELOCITY_WINDOW = 60   # sliding window in seconds
VELOCITY_LIMIT  = 60   # requests per window before flagging
VELOCITY_DELTA  = 12   # risk score increment for a flood event

# ── Download hammering config ───────────────────────────────────────────────────
DOWNLOAD_WINDOW = 30   # tighter window for export/download paths
DOWNLOAD_LIMIT  = 8    # max downloads inside DOWNLOAD_WINDOW
DOWNLOAD_DELTA  = 15

# ── Auto-termination threshold ──────────────────────────────────────────────────
HARD_RISK_LIMIT = 90   # risk score at which session is force-terminated

# ── Paths fully scored by their own route handler (no double-counting) ──────────
ROUTE_MANAGED = {
    '/api/user/action',
    '/api/user/login',
    '/api/user/logout',
    '/api/user/me',
}

# ── Path fragments that employees have no legitimate reason to access ───────────
ADMIN_PROBE_FRAGMENTS = [
    '/api/admin/',
    '/api/forensic/',
    '/api/summary',
    '/api/flags/',
]

# ── High-value exfiltration paths tracked with a tighter rate limit ─────────────
DOWNLOAD_PATH_FRAGMENTS = [
    '/api/user/download',
    '/api/user/export',
    '/api/user/bulk',
]

# ── In-memory sliding-window stores {user_id: [monotonic_timestamp, ...]} ───────
_velocity: dict[int, list[float]]  = defaultdict(list)
_downloads: dict[int, list[float]] = defaultdict(list)


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _now() -> float:
    return time.monotonic()

def _prune(timestamps: list[float], window: float) -> list[float]:
    """Return only timestamps inside the current sliding window."""
    cutoff = _now() - window
    return [t for t in timestamps if t > cutoff]

def _path_matches(path: str, fragments: list[str]) -> bool:
    low = path.lower()
    return any(f in low for f in fragments)

def _risk_level(score: int) -> str:
    if score < 40:  return 'Low'
    if score < 70:  return 'Medium'
    return 'High'

def _bump_risk(conn, user_id: int, delta: int) -> int:
    """Add delta to user's risk score (capped at 100). Returns new score."""
    row = conn.execute(
        "SELECT score FROM risk_scores WHERE user_id=?", (user_id,)
    ).fetchone()
    if not row:
        return 0
    new_score = min(100, row['score'] + delta)
    conn.execute(
        "UPDATE risk_scores SET score=?, level=?, last_calculated=datetime('now') WHERE user_id=?",
        (new_score, _risk_level(new_score), user_id)
    )
    return new_score

def _insert_flag(conn, user_id: int, flag_type: str, severity: str, notes: str) -> None:
    conn.execute(
        "INSERT INTO flags (user_id, flag_type, severity, resolved, notes) VALUES (?,?,?,0,?)",
        (user_id, flag_type, severity, notes)
    )

def _emit(socketio, user_id: int, user_name: str,
          flag: str, severity: str, notes: str, score: int) -> None:
    try:
        socketio.emit('security_alert', {
            'user_id':   user_id,
            'user_name': user_name,
            'flag':      flag,
            'severity':  severity,
            'notes':     notes,
            'score':     score,
            'timestamp': datetime.utcnow().isoformat(),
        }, namespace='/admin')
    except Exception:
        pass   # never let a failed emit break the request pipeline


# ── Main registration ────────────────────────────────────────────────────────────

def register_interceptor(app, socketio):
    """
    Attach the behavioural security interceptor to the Flask app.
    Must be called after all blueprints are registered.
    """
    from database import get_connection

    @app.before_request
    def intercept():

        # Gate 1 — Skip admin-session requests entirely.
        # The admin dashboard polls every 5s; without this, its own API calls
        # would trip admin_endpoint_probe on every poll cycle.
        if session.get('admin_id'):
            return

        # Gate 2 — Skip unauthenticated (anonymous) requests.
        user_id = session.get('user_id')
        if not user_id:
            return

        # Gate 3 — Only intercept /api/ paths; ignore static files and HTML.
        path = request.path
        if not path.startswith('/api/'):
            return

        # Gate 4 — Skip paths managed by user_auth.py.
        # Still count velocity so request-rate anomalies are tracked even
        # on managed routes, but don't apply content-based scoring here.
        _velocity[user_id] = _prune(_velocity[user_id], VELOCITY_WINDOW)
        _velocity[user_id].append(_now())
        if path in ROUTE_MANAGED:
            return

        # ── Collect flags for this request ─────────────────────────────────────
        flags = []
        req_count = len(_velocity[user_id])

        # Check 1 — Velocity flood (> VELOCITY_LIMIT requests / VELOCITY_WINDOW s)
        if req_count > VELOCITY_LIMIT:
            flags.append({
                'type':     'velocity_flooding',
                'severity': 'High',
                'notes':    f'{req_count} requests in {VELOCITY_WINDOW}s — possible automated scraping.',
                'delta':    VELOCITY_DELTA,
            })

        # Check 2 — Admin/system endpoint probing by an authenticated employee
        if _path_matches(path, ADMIN_PROBE_FRAGMENTS):
            flags.append({
                'type':     'admin_endpoint_probe',
                'severity': 'High',
                'notes':    f'Employee accessed restricted admin endpoint: {path}',
                'delta':    20,
            })

        # Check 3 — Download hammering (separate tighter window)
        if _path_matches(path, DOWNLOAD_PATH_FRAGMENTS):
            _downloads[user_id] = _prune(_downloads[user_id], DOWNLOAD_WINDOW)
            _downloads[user_id].append(_now())
            dl_count = len(_downloads[user_id])
            if dl_count > DOWNLOAD_LIMIT:
                flags.append({
                    'type':     'bulk_download_attempt',
                    'severity': 'High',
                    'notes':    f'{dl_count} download/export requests in {DOWNLOAD_WINDOW}s.',
                    'delta':    DOWNLOAD_DELTA,
                })

        # ── No flags → clean request, exit without DB touch ────────────────────
        if not flags:
            return

        # ── Apply all flags to the DB ───────────────────────────────────────────
        user_name = session.get('user_name', 'Unknown')
        conn = get_connection()
        try:
            for f in flags:
                _insert_flag(conn, user_id, f['type'], f['severity'], f['notes'])
                new_score = _bump_risk(conn, user_id, f['delta'])
                _emit(socketio, user_id, user_name,
                      f['type'], f['severity'], f['notes'], new_score)

                # Auto-terminate if risk hits the hard ceiling
                if new_score >= HARD_RISK_LIMIT:
                    conn.execute("UPDATE users SET is_active=0 WHERE id=?", (user_id,))
                    _insert_flag(conn, user_id, 'auto_terminated', 'Critical',
                                 'Session auto-terminated by middleware — risk threshold exceeded.')
                    conn.commit()
                    session.clear()
                    return jsonify({
                        'error': 'Service temporarily unavailable. Please try again later.'
                    }), 503

            conn.commit()
        finally:
            conn.close()
