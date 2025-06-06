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
def get_saml_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'saml')

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
    try:
        saml_path = get_saml_path()
        auth = OneLogin_Saml2_Auth(req, custom_base_path=saml_path)
        return auth
    except Exception as e:
        current_app.logger.error(f"SAML initialization error: {str(e)}")
        raise RuntimeError(f"Impossibile inizializzare l'autenticazione SAML: {str(e)}")

def prepare_flask_request(request):
    return {
        'https': 'on' if request.is_secure else 'off',
        'http_host': request.host,
        'server_port': request.environ.get('SERVER_PORT', ''),
        'script_name': request.path,
        'get_data': request.args.copy(),
        'post_data': request.form.copy(),
        'query_string': request.query_string.decode('utf-8')
    }

def get_user_attributes_from_saml(auth):
    attributes = auth.get_attributes()
    if not attributes:
        raise ValueError("Nessun attributo SAML ricevuto")
    
    current_app.logger.debug(f"Attributi SAML ricevuti: {list(attributes.keys())}")
    
    def safe_get_attr(attr_name, default=''):
        attr_list = attributes.get(attr_name, [])
        value = attr_list[0] if attr_list and attr_list[0] else default
        current_app.logger.debug(f"Attributo {attr_name}: {value}")
        return value
    
    return {
        'username': safe_get_attr('uid'),
        'nome': safe_get_attr('givenName'),
        'cognome': safe_get_attr('sn'),
        'matricola': safe_get_attr('matricolaDocente'),
        'matricolaStudente': safe_get_attr('matricolaStudente')  # Eccezione se mi autentico io (Amedeo)
    }

def sync_user_with_db(user_attrs):
    conn = None
    try:
        current_app.logger.info("Sync DB: Tentativo connessione database")
        conn = get_db_connection()
        
        current_app.logger.info("Sync DB: Connessione ottenuta, creazione cursor")
        cursor = conn.cursor()
        
        username = user_attrs['username']
        nome = user_attrs['nome']
        cognome = user_attrs['cognome']
        matricola = user_attrs['matricola']
        
        current_app.logger.info(f"Sync DB: Verifica esistenza utente {username}")
        cursor.execute("SELECT username FROM utenti WHERE username = %s", (username,))
        result = cursor.fetchone()
        
        if result:
            current_app.logger.info(f"Sync DB: Aggiornamento utente esistente {username}")
            cursor.execute(
                "UPDATE utenti SET nome = %s, cognome = %s, matricola = %s WHERE username = %s",
                (nome, cognome, matricola, username)
            )
        else:
            current_app.logger.info(f"Sync DB: Inserimento nuovo utente {username}")
            cursor.execute(
                "INSERT INTO utenti (username, matricola, nome, cognome, permessi_admin) VALUES (%s, %s, %s, %s, %s)",
                (username, matricola, nome, cognome, False)
            )
        
        current_app.logger.info("Sync DB: Commit delle modifiche")
        conn.commit()
        
        current_app.logger.info("Sync DB: Impostazione sessione utente")
        set_user_session(username, matricola, nome, cognome, False)
        
        current_app.logger.info("Sync DB: Sincronizzazione completata con successo")
        return True
        
    except Exception as e:
        current_app.logger.error(f"Errore nella sincronizzazione dell'utente: {str(e)}", exc_info=True)
        if conn:
            current_app.logger.info("Sync DB: Rollback della transazione")
            conn.rollback()
        return False
    finally:
        if conn:
            current_app.logger.info("Sync DB: Chiusura connessione")
            cursor.close()
            release_connection(conn)

# API di Autenticazione e sessione
@auth_bp.route('/api/login', methods=['POST'])
def login_standard():
    data = request.form
    username = data.get('username')
    password = data.get('password')
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
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
    except Exception as e:
        current_app.logger.error(f"Errore durante il login: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Errore interno del server'}), 500
    finally:
        if conn:
            cursor.close()
            release_connection(conn)

@auth_bp.route('/api/logout')
def logout():
    session.clear()
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
    current_app.logger.info("SAML ACS: Inizio elaborazione")
    req = prepare_flask_request(request)
    
    try:
        current_app.logger.info("SAML ACS: Inizializzazione auth SAML")
        auth = init_saml_auth(req)
        
        current_app.logger.info("SAML ACS: Elaborazione response")
        auth.process_response()
        
        current_app.logger.info("SAML ACS: Controllo errori")
        errors = auth.get_errors()
        
        if not errors:
            current_app.logger.info("SAML ACS: Estrazione attributi utente")
            user_attrs = get_user_attributes_from_saml(auth)
            current_app.logger.info(f"SAML ACS: Attributi estratti: {user_attrs}")
            
            if not user_attrs['username']:
                current_app.logger.error("SAML ACS: Username mancante")
                return "Errore: attributi SAML mancanti", 400
            
            if not user_attrs['matricola']:
                # Eccezione per la matricola studente 342804
                matricola_studente = user_attrs.get('matricolaStudente', '')
                if matricola_studente == '342804':
                    current_app.logger.info(f"SAML ACS: Eccezione concessa per matricola studente {matricola_studente}")
                    user_attrs['matricola'] = matricola_studente  # Usa la matricola studente come matricola
                else:
                    current_app.logger.error("SAML ACS: Matricola docente mancante e nessuna eccezione applicabile")
                    return "Accesso negato: solo i docenti possono accedere", 403
            
            current_app.logger.info("SAML ACS: Sincronizzazione con database")
            if not sync_user_with_db(user_attrs):
                current_app.logger.error("SAML ACS: Errore sincronizzazione DB")
                return "Errore durante la registrazione dell'utente", 500
                
            current_app.logger.info("SAML ACS: Preparazione redirect")
            self_url = OneLogin_Saml2_Utils.get_self_url(req)
            
            if 'RelayState' in request.form and self_url != request.form['RelayState']:
                redirect_url = auth.redirect_to(request.form['RelayState'])
                current_app.logger.info(f"SAML ACS: Redirect a RelayState: {redirect_url}")
                return redirect(redirect_url)
                
            current_app.logger.info("SAML ACS: Redirect a homepage")
            return redirect('/')
        else:
            error_reason = ""
            if hasattr(auth, 'get_last_error_reason'):
                error_reason = auth.get_last_error_reason()
            current_app.logger.error(f"SAML authentication error: {', '.join(errors)} - {error_reason}")
            return f"Errore autenticazione SAML: {', '.join(errors)}", 400
            
    except Exception as e:
        current_app.logger.error(f"SAML ACS error: {str(e)}", exc_info=True)
        return "Errore durante l'autenticazione SAML", 500

@auth_bp.route('/saml/sls')
def saml_sls():
    req = prepare_flask_request(request)
    auth = init_saml_auth(req)
    
    url = auth.process_slo(delete_session_cb=lambda: session.clear())
    errors = auth.get_errors()
    
    if len(errors) == 0:
        if url is not None:
            return redirect(url)
        return redirect('/')
    else:
        error_reason = auth.get_last_error_reason()
        current_app.logger.error(f"SAML SLS error: {', '.join(errors)} - {error_reason}")
        return f"Errore SAML SLS: {error_reason}", 400