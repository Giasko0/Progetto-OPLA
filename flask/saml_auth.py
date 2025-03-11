from flask import Blueprint, request, session, redirect, url_for, render_template, current_app
from functools import wraps
from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.settings import OneLogin_Saml2_Settings
from onelogin.saml2.utils import OneLogin_Saml2_Utils
from db import get_db_connection
import os

saml_bp = Blueprint('saml', __name__)

# Configurazione SAML
saml_bp.config = {
  'SECRET_KEY': os.urandom(24),
  'SESSION_TYPE': 'filesystem',
  'SAML_PATH': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'saml')
}

def require_auth(f):
  @wraps(f)
  def decorated(*args, **kwargs):
    # Rimuovere l'if una volta configurato il SAML
    if not current_app.config.get('SAML_ENABLED'):
      if request.cookies.get('username') is None:
        return redirect('/flask/login')
    else:
      if not session.get('saml_authenticated'):
        return redirect(url_for('saml.login'))
    return f(*args, **kwargs)
  return decorated

def init_saml_auth(req):
  try:
    auth = OneLogin_Saml2_Auth(req, custom_base_path=saml_bp.config['SAML_PATH'])
    return auth
  except Exception as e:
    print(f"SAML initialization error: {str(e)}")
    raise

def prepare_flask_request(request):
  return {
    'https': 'on' if request.scheme == 'https' else 'off',
    'http_host': request.host,
    'server_port': request.environ.get('SERVER_PORT', ''),
    'script_name': request.path,
    'get_data': request.args.copy(),
    'post_data': request.form.copy(),
    'query_string': request.query_string.decode('utf-8')
  }

@saml_bp.route('/flask/saml/metadata/')
def metadata():
  try:
    req = prepare_flask_request(request)
    auth = init_saml_auth(req)
    settings = auth.get_settings()
    metadata = settings.get_sp_metadata()
    errors = settings.validate_metadata(metadata)

    if len(errors) == 0:
      return metadata, 200, {'Content-Type': 'text/xml'}
    else:
      return ', '.join(errors), 500
  except Exception as e:
    return str(e), 500

@saml_bp.route('/flask/saml/login')
def login():
  req = prepare_flask_request(request)
  auth = init_saml_auth(req)
  return redirect(auth.login())

@saml_bp.route('/flask/saml/acs/', methods=['POST'])
def acs():
  req = prepare_flask_request(request)
  auth = init_saml_auth(req)
  
  auth.process_response()
  errors = auth.get_errors()
  
  if len(errors) == 0:
    session['saml_authenticated'] = True
    session['saml_nameid'] = auth.get_nameid()
    session['saml_nameid_format'] = auth.get_nameid_format()
    session['saml_nameid_nq'] = auth.get_nameid_nq()
    session['saml_nameid_spnq'] = auth.get_nameid_spnq()
    session['saml_session_index'] = auth.get_session_index()
    session['saml_attributes'] = auth.get_attributes()
    
    # Verifica se l'utente esiste nel database, altrimenti crea un nuovo record
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
      username = auth.get_nameid()
      attributes = auth.get_attributes()
      
      # Estrai informazioni dall'attributo, adatta secondo l'implementazione SAML
      email = attributes.get('email', [''])[0] if attributes.get('email') else ''
      nome = attributes.get('firstName', [''])[0] if attributes.get('firstName') else ''
      cognome = attributes.get('lastName', [''])[0] if attributes.get('lastName') else ''
      
      # Verifica se l'utente esiste
      cursor.execute("SELECT 1 FROM utenti WHERE username = %s", (username,))
      if not cursor.fetchone():
        # Crea un nuovo utente con permessi visitatore di default
        cursor.execute(
          """INSERT INTO utenti 
             (username, email, nome, cognome, permessi_visitatore, permessi_docente, permessi_admin) 
             VALUES (%s, %s, %s, %s, %s, %s, %s)""", 
          (username, email, nome, cognome, True, False, False)
        )
        conn.commit()
    
    finally:
      cursor.close()
      conn.close()
    
    self_url = OneLogin_Saml2_Utils.get_self_url(req)
    if 'RelayState' in request.form and self_url != request.form['RelayState']:
      return redirect(auth.redirect_to(request.form['RelayState']))
    return redirect(url_for('home'))
  else:
    return render_template('error.html', errors=errors)

@saml_bp.route('/flask/saml/logout')
def logout():
  req = prepare_flask_request(request)
  auth = init_saml_auth(req)
  name_id = session.get('saml_nameid')
  session_index = session.get('saml_session_index')
  return redirect(auth.logout(name_id=name_id, session_index=session_index))

@saml_bp.route('/flask/saml/sls/')
def sls():
  req = prepare_flask_request(request)
  auth = init_saml_auth(req)
  
  url = auth.process_slo(delete_session_cb=lambda: session.clear())
  errors = auth.get_errors()
  
  if len(errors) == 0:
    if url is not None:
      return redirect(url)
    return redirect(url_for('home'))
  return render_template('error.html', errors=errors)
