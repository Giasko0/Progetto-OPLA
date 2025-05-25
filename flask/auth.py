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

# ===== Sistema di autenticazione unificato =====

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        is_authenticated = session.get('username') or session.get('saml_authenticated')
        
        if not is_authenticated:
            # Salviamo l'URL corrente per tornare dopo il login
            next_url = request.url
            return redirect(f'/login.html?next={next_url}')
        return f(*args, **kwargs)
    return decorated

@auth_bp.route('/api/get_user_data')
def get_user_data():
    username = session.get('username') or session.get('saml_nameid')
    
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
                'permessi_docente': bool(user_record[4]),
                'permessi_admin': bool(user_record[5])
            }
            
            return jsonify({
                'authenticated': True,
                'user_data': user_data
            })
        
        return jsonify({
            'authenticated': False,
            'user_data': None
        })
    finally:
        cursor.close()
        release_connection(conn)

# ===== Sistema di login standard =====

@auth_bp.route('/api/login', methods=['POST'])
def login_standard():
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
            
            # Memorizza i dati nella sessione
            session['username'] = username
            if is_admin:
                session['admin'] = True
            session['authenticated'] = True
            
            # Crea la risposta JSON
            return jsonify({
                'status': 'success',
                'message': 'Login effettuato con successo',
                'admin': bool(is_admin),
                'docente': bool(is_docente), 
            })
            
        return jsonify({'status': 'error', 'message': 'Credenziali non valide'}), 401
    finally:
        cursor.close()
        release_connection(conn)

@auth_bp.route('/api/logout')
def logout():
    # Verifica se l'utente è autenticato tramite SAML
    if session.get('saml_authenticated'):
        # Salva i dati necessari prima di pulire la sessione
        name_id = session.get('saml_nameid')
        session_index = session.get('saml_session_index')
        session.clear()
        
        # Se abbiamo i dati necessari, reindirizza al logout SAML
        if name_id and session_index:
            return redirect(url_for('auth.logout_saml'))
    
    # Logout locale
    session.clear()
    return redirect('/')

# ===== Funzioni SAML =====

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

def _sync_user_with_db(auth):
    """Helper per sincronizzare i dati utente con il database"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        username = auth.get_nameid()
        attributes = auth.get_attributes()
        
        # Estrai informazioni dagli attributi SAML in modo più robusto
        nome = attributes.get('firstName', [None])[0] if attributes.get('firstName') else ''
        cognome = attributes.get('lastName', [None])[0] if attributes.get('lastName') else ''
        email = attributes.get('email', [username])[0] if attributes.get('email') else username
        
        # Verifica se l'utente esiste e aggiorna le informazioni
        cursor.execute("SELECT id FROM utenti WHERE username = %s", (username,))
        result = cursor.fetchone()
        
        if result:
            # Aggiorna l'utente esistente con i nuovi dati dall'IdP
            cursor.execute(
                """UPDATE utenti SET nome = %s, cognome = %s, email = %s, ultimo_login = NOW()
                   WHERE username = %s""", 
                (nome, cognome, email, username)
            )
        else:
            # Crea un nuovo utente con permessi docente
            cursor.execute(
                """INSERT INTO utenti 
                   (username, nome, cognome, email, permessi_docente, permessi_admin, data_creazione, ultimo_login) 
                   VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())""", 
                (username, nome, cognome, email, True, False)
            )
        
        conn.commit()
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
            return ', '.join(errors), 500
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
        
        if len(errors) == 0:
            # Autenticazione riuscita
            session['saml_authenticated'] = True
            session['saml_nameid'] = auth.get_nameid()
            session['saml_session_index'] = auth.get_session_index()
            session['saml_attributes'] = auth.get_attributes()
            
            # Sincronizzazione con il database
            sync_result = _sync_user_with_db(auth)
            if not sync_result:
                return render_template('error.html', errors=["Errore durante la registrazione dell'utente"])
            
            # Gestione del redirect
            self_url = OneLogin_Saml2_Utils.get_self_url(req)
            if 'RelayState' in request.form and self_url != request.form['RelayState']:
                return redirect(auth.redirect_to(request.form['RelayState']))
            return redirect('/')
        else:
            error_reason = auth.get_last_error_reason()
            current_app.logger.error(f"SAML authentication error: {', '.join(errors)} - {error_reason}")
            return render_template('error.html', errors=errors, reason=error_reason)
    except Exception as e:
        current_app.logger.error(f"SAML ACS error: {str(e)}")
        return render_template('error.html', errors=["Si è verificato un errore durante l'autenticazione"])

@auth_bp.route('/saml/logout')
def logout_saml():
    req = prepare_flask_request(request)
    try:
        auth = init_saml_auth(req)
        name_id = session.get('saml_nameid')
        session_index = session.get('saml_session_index')
        
        # Esegui il logout locale prima di reindirizzare all'IdP
        session.clear()
        
        # Se non abbiamo dati di sessione SAML, facciamo solo logout locale
        if not name_id or not session_index:
            return redirect('/')
            
        return redirect(auth.logout(name_id=name_id, session_index=session_index))
    except Exception as e:
        current_app.logger.error(f"SAML logout error: {str(e)}")
        session.clear()  # Assicuriamoci che la sessione locale sia pulita
        return redirect('/')

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
        return render_template('error.html', errors=errors)

# ===== Endpoint di Debug SAML =====

@auth_bp.route('/saml/debug/attributes')
@require_auth
def debug_saml_attributes():
    """Endpoint di debug per visualizzare gli attributi SAML ricevuti dall'IdP"""
    attributes = session.get('saml_attributes', {})
    nameid = session.get('saml_nameid', 'Non disponibile')
    session_index = session.get('saml_session_index', 'Non disponibile')
    
    html = "<h1>Debug attributi SAML</h1>"
    html += f"<p><strong>NameID:</strong> {nameid}</p>"
    html += f"<p><strong>Session Index:</strong> {session_index}</p>"
    html += "<h2>Attributi:</h2>"
    
    if attributes:
        html += "<table border='1'><tr><th>Nome attributo</th><th>Valore</th></tr>"
        for key, values in attributes.items():
            html += f"<tr><td>{key}</td><td>{values}</td></tr>"
        html += "</table>"
    else:
        html += "<p>Nessun attributo trovato nella sessione</p>"
        
    html += "<p><a href='/'>Torna alla home</a></p>"
    
    return html

@auth_bp.route('/saml/debug/session')
@require_auth
def debug_saml_session():
    """Endpoint di debug per visualizzare tutti i dati SAML nella sessione"""
    saml_keys = [k for k in session.keys() if k.startswith('saml_')]
    
    html = "<h1>Debug Sessione SAML</h1>"
    
    if saml_keys:
        html += "<table border='1'><tr><th>Chiave</th><th>Valore</th></tr>"
        for key in saml_keys:
            html += f"<tr><td>{key}</td><td>{session.get(key)}</td></tr>"
        html += "</table>"
    else:
        html += "<p>Nessun dato SAML trovato nella sessione</p>"
        
    html += "<p><a href='/'>Torna alla home</a></p>"
    
    return html
