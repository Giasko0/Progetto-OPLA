from flask import Blueprint, render_template, request, jsonify, redirect, make_response, session, url_for, current_app
from db import get_db_connection, release_connection
from functools import wraps
import os
import re
from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.settings import OneLogin_Saml2_Settings
from onelogin.saml2.utils import OneLogin_Saml2_Utils

auth_bp = Blueprint('auth', __name__)

# Configurazione SAML
auth_bp.config = {
    'SECRET_KEY': os.urandom(24),
    'SESSION_TYPE': 'filesystem',
    'SAML_PATH': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'saml')
}

# Funzioni Utility Sessione
def set_user_session(username, matricola, nome, cognome, permessi_admin):
    session['username'] = username
    session['matricola'] = matricola
    session['nome'] = nome
    session['cognome'] = cognome
    session['permessi_admin'] = bool(permessi_admin)
    session['authenticated'] = True

def clear_user_session():
    session_keys = ['username', 'matricola', 'nome', 'cognome', 'permessi_admin', 'authenticated']
    for k in session_keys:
        session.pop(k, None)
    session.clear()

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
    try:
        auth = OneLogin_Saml2_Auth(req, custom_base_path=auth_bp.config['SAML_PATH'])
        return auth
    except Exception as e:
        current_app.logger.error(f"SAML initialization error: {str(e)}")
        raise RuntimeError(f"Impossibile inizializzare l'autenticazione SAML: {str(e)}")

def prepare_flask_request(request):
    return {
        'https': 'on',
        'http_host': request.host,
        'server_port': request.environ.get('SERVER_PORT', ''),
        'script_name': request.path,
        'get_data': request.args.copy(),
        'post_data': request.form.copy(),
        'query_string': request.query_string.decode('utf-8')
    }

def get_user_attributes_from_saml(auth):
    attributes = auth.get_attributes()
    return {
        'username': attributes.get('uid', [None])[0],
        'nome': attributes.get('givenName', [None])[0] or '',
        'cognome': attributes.get('sn', [None])[0] or '',
        'matricola': attributes.get('matricolaDocente', [None])[0] or ''
    }

def sync_user_with_db(user_attrs):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        username = user_attrs['username']
        nome = user_attrs['nome']
        cognome = user_attrs['cognome']
        matricola = user_attrs['matricola']
        cursor.execute("SELECT username FROM utenti WHERE username = %s", (username,))
        result = cursor.fetchone()
        if result:
            cursor.execute(
                "UPDATE utenti SET nome = %s, cognome = %s, matricola = %s WHERE username = %s",
                (nome, cognome, matricola, username)
            )
        else:
            cursor.execute(
                "INSERT INTO utenti (username, matricola, nome, cognome, permessi_admin) VALUES (%s, %s, %s, %s, %s)",
                (username, matricola, nome, cognome, False)
            )
        conn.commit()
        set_user_session(username, matricola, nome, cognome, False)
        return True
    except Exception as e:
        current_app.logger.error(f"Errore nella sincronizzazione dell'utente: {str(e)}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            cursor.close()
            release_connection(conn)

# API di Autenticazione e sessione
@auth_bp.route('/api/login', methods=['POST'])
def login_standard():
    data = request.form
    username = data.get('username')
    password = data.get('password')
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT username, matricola, nome, cognome, password, permessi_admin 
            FROM utenti 
            WHERE username = %s AND password = %s
        """, (username, password))
        user = cursor.fetchone()
        if user:
            set_user_session(user[0], user[1], user[2], user[3], user[5])
            return jsonify({
                'status': 'success',
                'message': 'Login effettuato con successo',
                'admin': bool(user[5]),
            })
        return jsonify({'status': 'error', 'message': 'Credenziali non valide'}), 401
    finally:
        cursor.close()
        release_connection(conn)

@auth_bp.route('/api/logout')
def logout():
    clear_user_session()
    return redirect('/')

@auth_bp.route('/api/get_user_data')
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
    req = prepare_flask_request(request)
    try:
        auth = init_saml_auth(req)
        auth.process_response()
        errors = auth.get_errors()
        if not errors:
            user_attrs = get_user_attributes_from_saml(auth)
            if not user_attrs['username']:
                return "Errore: attributi SAML mancanti", 400
            if not user_attrs['matricola']:
                return "Accesso negato: solo i docenti possono accedere", 403
            if not sync_user_with_db(user_attrs):
                return "Errore durante la registrazione dell'utente", 500
            self_url = OneLogin_Saml2_Utils.get_self_url(req)
            if 'RelayState' in request.form and self_url != request.form['RelayState']:
                return redirect(auth.redirect_to(request.form['RelayState']))
            return redirect('/')
        else:
            error_reason = auth.get_last_error_reason()
            current_app.logger.error(f"SAML authentication error: {', '.join(errors)} - {error_reason}")
            return f"Errore autenticazione SAML: {error_reason}", 400
    except Exception as e:
        current_app.logger.error(f"SAML ACS error: {str(e)}")
        return "Errore durante l'autenticazione SAML", 500

@auth_bp.route('/saml/sls')
def saml_sls():
    req = prepare_flask_request(request)
    auth = init_saml_auth(req)
    
    url = auth.process_slo(delete_session_cb=lambda: clear_user_session())
    errors = auth.get_errors()
    
    if len(errors) == 0:
        if url is not None:
            return redirect(url)
        return redirect('/')
    else:
        error_reason = auth.get_last_error_reason()
        current_app.logger.error(f"SAML SLS error: {', '.join(errors)} - {error_reason}")
        return f"Errore SAML SLS: {error_reason}", 400