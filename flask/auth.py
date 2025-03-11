from flask import Blueprint, render_template, request, jsonify, redirect, make_response, session
from db import get_db_connection
from functools import wraps

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/flask/login')
def login():
  # Verifica se l'utente è già autenticato
  if 'username' in request.cookies or session.get('saml_authenticated'):
    return redirect('/flask')
  return render_template("login.html")

@auth_bp.route('/flask/logout')
def logout():
  # Verifica se l'utente è autenticato tramite SAML
  if session.get('saml_authenticated'):
    return redirect('/flask/saml/logout')
  
  # Logout locale
  response = redirect('/flask')
  response.delete_cookie('username')
  return response

@auth_bp.route('/api/login', methods=['POST'])
def api_login():
  data = request.form
  username = data.get('username')
  password = data.get('password')

  conn = get_db_connection()
  cursor = conn.cursor()
  try:
    cursor.execute("SELECT 1 FROM utenti WHERE username = %s AND nome = %s", 
      (username, password))
    if cursor.fetchone():
      response = redirect('/flask')
      response.set_cookie('username', username)
      return response
    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
  finally:
    cursor.close()
    conn.close()

# Funzione di supporto per verificare l'autenticazione
def is_authenticated():
  return 'username' in request.cookies or session.get('saml_authenticated')
  
# Funzione per ottenere l'username corrente
def get_current_user():
  if 'username' in request.cookies:
    return request.cookies.get('username')
  elif session.get('saml_authenticated'):
    return session.get('saml_nameid')
  return None

# Funzione decoratore che richiede il login
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in request.cookies and not session.get('saml_authenticated'):
            return redirect('/flask/login')
        return f(*args, **kwargs)
    return decorated_function

# Funzione per ottenere il nome utente indipendentemente dal metodo di autenticazione
def get_current_username():
    """Ottieni il nome utente indipendentemente dal metodo di autenticazione"""
    if 'username' in request.cookies:
        return request.cookies.get('username')
    elif session.get('saml_authenticated'):
        return session.get('saml_nameid')
    return None
