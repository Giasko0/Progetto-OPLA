from flask import Blueprint, render_template, request, jsonify, redirect, make_response, session
from db import get_db_connection, release_connection
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
    response.delete_cookie('admin')
    return response

@auth_bp.route('/api/login', methods=['POST'])
def api_login():
  data = request.form
  username = data.get('username')
  password = data.get('password')

  conn = get_db_connection()
  cursor = conn.cursor()
  try:
    # Verifica le credenziali nel database
    cursor.execute("""
        SELECT username, permessi_admin, permessi_docente 
        FROM utenti 
        WHERE username = %s AND password = %s
    """, (username, password))
    
    user = cursor.fetchone()
    
    if user:
      # Ottieni i permessi dell'utente
      username, is_admin, is_docente = user
      
      # Crea la risposta JSON con i dati dell'utente
      response = jsonify({
          'status': 'success',
          'message': 'Login effettuato con successo',
          'admin': bool(is_admin),
          'docente': bool(is_docente), 
      })
      
      # Imposta i cookie appropriati
      response.set_cookie('username', username)
      
      # Se l'utente è un admin, imposta anche il cookie admin
      if is_admin:
          response.set_cookie('admin', 'true')
      
      return response
      
    return jsonify({'status': 'error', 'message': 'Credenziali non valide'}), 401
  finally:
    cursor.close()
    release_connection(conn)

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
            SELECT username, matricola, nome, cognome, 
                   permessi_docente, permessi_admin 
            FROM utenti 
            WHERE username = %s
        """, (username,))
        user_record = cursor.fetchone()
        
        if user_record:
            # Creo manualmente il dizionario con i nomi delle colonne
            user_data = {
                'username': user_record[0],
                'matricola': user_record[1],
                'nome': user_record[2],
                'cognome': user_record[3],
                'permessi_docente': user_record[4],
                'permessi_admin': user_record[5]
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
        release_connection(conn)
