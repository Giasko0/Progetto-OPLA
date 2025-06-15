from flask import Blueprint, request, jsonify, redirect, session, current_app
from db import get_db_connection, release_connection
from functools import wraps
import os
import re
from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.utils import OneLogin_Saml2_Utils

auth_bp = Blueprint('auth', __name__)

# Funzioni Utility Sessione
def set_user_session(username, matricola, nome, cognome, permessi_admin):
  session['username'] = username
  session['matricola'] = matricola
  session['nome'] = nome
  session['cognome'] = cognome
  session['permessi_admin'] = bool(permessi_admin)
  session['authenticated'] = True

def require_auth(f):
  @wraps(f)
  def decorated(*args, **kwargs):
    if not session.get('authenticated'):
      next_url = request.url
      return redirect(f'/login.html?next={next_url}')
    return f(*args, **kwargs)
  return decorated

# Funzioni SAML
def init_saml_auth(req):
  saml_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'saml')
  return OneLogin_Saml2_Auth(req, custom_base_path=saml_path)

def prepare_flask_request(request):
    return {
        'https': 'on' if request.is_secure else 'off',
        'http_host': request.host,
        'script_name': request.path,
        'get_data': request.args.copy(),
        'post_data': request.form.copy(),
        'server_port': request.environ.get('SERVER_PORT', '80')
    }

def get_user_attributes_from_saml(auth):
  attributes = auth.get_attributes()
  if not attributes:
    raise ValueError("Nessun attributo SAML ricevuto")
  
  def safe_get_attr(attr_name, default=''):
    attr_list = attributes.get(attr_name, [])
    return (attr_list[0].strip() if attr_list and attr_list[0] else default)
  
  user_attrs = {
    'username': safe_get_attr('uid'),
    'nome': safe_get_attr('givenName'),
    'cognome': safe_get_attr('sn'),
    'matricola': safe_get_attr('matricolaDocente'),
    'matricolaStudente': safe_get_attr('matricolaStudente')
  }
  
  if not user_attrs['username']:
    raise ValueError("Username SAML mancante o vuoto")
    
  return user_attrs

def create_user_if_not_exists(user_attrs):
  conn = get_db_connection()
  cursor = conn.cursor()
  
  username = user_attrs['username']
  
  # Verifica se l'utente esiste già
  cursor.execute("SELECT username, permessi_admin FROM utenti WHERE username = %s", (username,))
  result = cursor.fetchone()
  
  if not result:
    # Crea nuovo utente
    cursor.execute(
      "INSERT INTO utenti (username, matricola, nome, cognome, permessi_admin) VALUES (%s, %s, %s, %s, %s)",
      (username, user_attrs['matricola'], user_attrs['nome'], user_attrs['cognome'], False)
    )
    conn.commit()
    permessi_admin = False
  else:
    # Utente esistente, recupera i permessi
    permessi_admin = result[1]
  
  cursor.close()
  release_connection(conn)
  
  # Imposta la sessione utente
  set_user_session(username, user_attrs['matricola'], user_attrs['nome'], user_attrs['cognome'], permessi_admin)

# API di Autenticazione e sessione
@auth_bp.route('/api/login', methods=['POST'])
def login_standard():
  data = request.form
  username = data.get('username')
  password = data.get('password')
  
  conn = get_db_connection()
  cursor = conn.cursor()
  cursor.execute("""
    SELECT username, matricola, nome, cognome, password, permessi_admin 
    FROM utenti 
    WHERE username = %s AND password = %s
  """, (username, password))
  user = cursor.fetchone()
  cursor.close()
  release_connection(conn)
  
  if user:
    set_user_session(user[0], user[1], user[2], user[3], user[5])
    return jsonify({
      'status': 'success',
      'message': 'Login effettuato con successo',
      'admin': bool(user[5]),
    })
  return jsonify({'status': 'error', 'message': 'Credenziali non valide'}), 401

@auth_bp.route('/api/logout')
def logout():
  session.clear()
  return redirect('/')

@auth_bp.route('/api/get-user-data')
def get_user_data():
  if not session.get('authenticated'):
    return jsonify({'authenticated': False, 'user_data': None})
  user_data = {
    'username': session.get('username'),
    'matricola': session.get('matricola'),
    'nome': session.get('nome'),
    'cognome': session.get('cognome'),
    'permessi_admin': bool(session.get('permessi_admin', False))
  }
  return jsonify({'authenticated': True, 'user_data': user_data})

# API SAML
@auth_bp.route('/saml/metadata')
def metadata_saml():
  try:
    req = prepare_flask_request(request)
    auth = init_saml_auth(req)
    settings = auth.get_settings()
    metadata = settings.get_sp_metadata()
    # Rimuovo il tag validUntil dai metadata
    metadata = re.sub(b'validUntil="[^"]*"', b'', metadata)
    errors = settings.validate_metadata(metadata)

    if len(errors) == 0:
      return metadata, 200, {'Content-Type': 'text/xml'}
    else:
      return f"Errore validazione metadata: {', '.join(errors)}", 400
  except Exception as e:
    return str(e), 500

@auth_bp.route('/saml/login')
def login_saml():
  req = prepare_flask_request(request)
  auth = init_saml_auth(req)
  return redirect(auth.login())

@auth_bp.route('/saml/acs', methods=['POST'])
def saml_acs():
  current_app.logger.info("Inizio autenticazione")
  req = prepare_flask_request(request)
  auth = init_saml_auth(req)
  current_app.logger.info("Auth inizializzato")
  
  auth.process_response()
  errors = auth.get_errors()
  current_app.logger.info(f"Response processata, errori trovati: {len(errors)}")
  
  if not errors:
    try:
      current_app.logger.info("Nessun errore, recupero attributi utente")
      user_attrs = get_user_attributes_from_saml(auth)
      current_app.logger.info(f"Attributi recuperati per utente: {user_attrs.get('username', 'N/A')}")
      
      if not user_attrs['matricola']:
        current_app.logger.warning(f"Matricola docente vuota per utente {user_attrs.get('username', 'N/A')}")
        # Eccezione per la mia matricola (342804)
        matricola_studente = user_attrs.get('matricolaStudente', '')
        current_app.logger.info("Controllo matricola studente")
        if matricola_studente == '342804':
          user_attrs['matricola'] = matricola_studente
          current_app.logger.info("Ciao Amedeo")
        else:
          current_app.logger.warning("Solo i docenti possono accedere")
          return "Accesso negato: solo i docenti possono accedere", 403
      else:
        current_app.logger.info(f"Matricola docente trovata: {user_attrs['matricola']}")
      
      current_app.logger.info("Controllo utente nel database")
      create_user_if_not_exists(user_attrs)
      current_app.logger.info(f"Utente {user_attrs['username']} autenticato con successo")
      
      self_url = OneLogin_Saml2_Utils.get_self_url(req)
      if 'RelayState' in request.form and self_url != request.form['RelayState']:
        relay_state = request.form['RelayState']
        current_app.logger.info(f"Redirect a RelayState: {relay_state}")
        return redirect(auth.redirect_to(relay_state))
        
      current_app.logger.info("Redirect alla index")
      return redirect('/')
    except ValueError as e:
      current_app.logger.error(f"Errore: {str(e)}")
      return f"Errore: {str(e)}", 400
    except Exception as e:
      current_app.logger.error(f"Errore exception: {str(e)}")
      return f"Errore interno: {str(e)}", 500
  else:
    error_reason = auth.get_last_error_reason() if hasattr(auth, 'get_last_error_reason') else ""
    current_app.logger.error(f"SAML authentication error: {', '.join(errors)} - {error_reason}")
    return f"Errore autenticazione SAML: {', '.join(errors)}", 400

@auth_bp.route('/saml/sls')
def saml_sls():
  req = prepare_flask_request(request)
  auth = init_saml_auth(req)
  
  url = auth.process_slo(delete_session_cb=lambda: session.clear())
  errors = auth.get_errors()
  
  if len(errors) == 0:
    return redirect(url) if url else redirect('/')
  else:
    error_reason = auth.get_last_error_reason()
    current_app.logger.error(f"SAML SLS error: {', '.join(errors)} - {error_reason}")
    return f"Errore SAML SLS: {error_reason}", 400