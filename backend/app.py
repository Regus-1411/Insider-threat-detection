import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from database import init_db
from routes.auth import auth_bp
from routes.dashboard import dashboard_bp

app = Flask(__name__, static_folder=None)
app.secret_key = 'insider-threat-secret-key-2024'

CORS(app, supports_credentials=True)

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)

# ── Serve admin static files ──────────────────────────────────────────────────
ADMIN_DIR = os.path.join(os.path.dirname(__file__), '..', 'admin')
ADMIN_DIR = os.path.abspath(ADMIN_DIR)


@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_admin(path):
    full_path = os.path.join(ADMIN_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(ADMIN_DIR, path)
    return send_from_directory(ADMIN_DIR, 'index.html')


if __name__ == '__main__':
    init_db()
    print("[Flask] Admin portal running at http://localhost:5000")
    app.run(debug=True, port=5000)
