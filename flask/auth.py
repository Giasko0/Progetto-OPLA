from flask import Blueprint, render_template, request, jsonify, redirect, make_response, session
from db import get_db_connection
from functools import wraps

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/logout')
def logout():
    # Verifica se l'utente è autenticato tramite SAML
    if session.get('saml_authenticated'):
        session.clear()
        return redirect('/saml/logout')
    
    # Logout locale
    session.clear()
    response = make_response(redirect('/'))
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
      response = redirect('/')
      response.set_cookie('username', username)
      return response
    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
  finally:
    cursor.close()
    conn.close()

# Decorator per richiedere autenticazione
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        response = get_user_data().get_json()
        if not response.get('authenticated'):
            return redirect('/login.html')
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/api/check-auth')
def get_user_data():
    username = None
    
    # Determina l'username basato sul metodo di autenticazione
    if 'username' in request.cookies:
        username = request.cookies.get('username')
    elif session.get('saml_authenticated'):
        username = session.get('saml_nameid')
    
    if not username:
        return jsonify({
            'authenticated': False,
            'user_data': None
        })
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT username, matricola, email, nome, cognome, 
                   permessi_visitatore, permessi_docente, permessi_admin 
            FROM utenti 
            WHERE username = %s
        """, (username,))
        user_record = cursor.fetchone()
        
        if user_record:
            # Creo manualmente il dizionario con i nomi delle colonne
            user_data = {
                'username': user_record[0],
                'matricola': user_record[1],
                'email': user_record[2],
                'nome': user_record[3],
                'cognome': user_record[4],
                'permessi_visitatore': user_record[5],
                'permessi_docente': user_record[6],
                'permessi_admin': user_record[7]
            }
        else:
            user_data = None
        
        return jsonify({
            'authenticated': user_data is not None,
            'user_data': user_data
        })
    except Exception as e:
        print(f"Errore nell'ottenere i dati utente: {e}")
        return jsonify({
            'authenticated': False,
            'user_data': None,
            'error': str(e)
        }), 500
    finally:
        cursor.close()
        conn.close()
