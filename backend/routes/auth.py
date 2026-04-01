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
