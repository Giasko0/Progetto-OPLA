from flask import Blueprint, render_template, request, jsonify, redirect, make_response
from db import get_db_connection

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/flask/login')
def login():
  return render_template("login.html")

@auth_bp.route('/flask/logout')
def logout():
  response = redirect('/flask')
  response.delete_cookie('username')
  return response

@auth_bp.route('/flask/api/login', methods=['POST'])
def api_login():
  data = request.form
  username = data.get('username')
  password = data.get('password')

  conn = get_db_connection()
  cursor = conn.cursor()
  try:
    cursor.execute("SELECT 1 FROM docenti WHERE username = %s AND nome = %s", 
      (username, password))
    if cursor.fetchone():
      response = redirect('/flask')
      response.set_cookie('username', username)
      return response
    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
  finally:
    cursor.close()
    conn.close()
