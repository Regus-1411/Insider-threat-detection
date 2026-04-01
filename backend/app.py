import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from database import init_db
from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.user_auth import user_bp

app = Flask(__name__, static_folder=None)
app.secret_key = 'insider-threat-secret-key-2024'

CORS(app, supports_credentials=True)

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(user_bp)

# ── Absolute paths for static folders ─────────────────────────────────────────
BASE_DIR  = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ADMIN_DIR = os.path.join(BASE_DIR, 'admin')
USERS_DIR = os.path.join(BASE_DIR, 'users')


# ── Admin portal  →  /admin/ ──────────────────────────────────────────────────
@app.route('/admin/', defaults={'path': 'index.html'})
@app.route('/admin/<path:path>')
def serve_admin(path):
    full = os.path.join(ADMIN_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(ADMIN_DIR, path)
    return send_from_directory(ADMIN_DIR, 'index.html')


# ── User portal  →  /users/ ───────────────────────────────────────────────────
@app.route('/users/', defaults={'path': 'index.html'})
@app.route('/users/<path:path>')
def serve_users(path):
    full = os.path.join(USERS_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(USERS_DIR, path)
    return send_from_directory(USERS_DIR, 'index.html')


# ── Root → admin ───────────────────────────────────────────────────────────────
@app.route('/')
def root():
    return send_from_directory(ADMIN_DIR, 'index.html')


if __name__ == '__main__':
    init_db()
    print("\n[Flask] Server started:")
    print("  Admin portal  →  http://localhost:5000/admin/")
    print("  User portals  →  http://localhost:5000/users/\n")
    app.run(debug=True, port=5000)
