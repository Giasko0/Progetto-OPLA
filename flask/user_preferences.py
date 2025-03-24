from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
import json
from datetime import datetime
import psycopg2.extras

preferences_bp = Blueprint('preferences', __name__)

@preferences_bp.route('/api/salvaPreferienzaForm', methods=['POST'])
def salva_preferienza_form():
    """Salva le preferenze del form per un utente"""
    conn = None
    cursor = None
    try:
        # Ottieni i dati dalla richiesta
        data = request.json
        username = data.get('username')
        form_type = data.get('form_type', 'esame')  # Default 'esame', per future estensioni
        preferences = data.get('preferences', {})
        name = data.get('name', 'Default')
        
        if not username or not preferences:
            return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400
        
        # Converti le preferenze in JSON
        preferences_json = json.dumps(preferences)
        
        # Ottieni timestamp corrente
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Connessione al database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verifica se esiste già una preferenza con questo nome
        cursor.execute("""
            SELECT id FROM preferenze_utenti 
            WHERE username = %s AND form_type = %s AND name = %s
        """, (username, form_type, name))
        
        existing = cursor.fetchone()
        
        if existing:
            # Aggiorna preferenza esistente
            cursor.execute("""
                UPDATE preferenze_utenti 
                SET preferences = %s, updated_at = %s
                WHERE username = %s AND form_type = %s AND name = %s
            """, (preferences_json, now, username, form_type, name))
            message = f"Preferenza '{name}' aggiornata"
        else:
            # Inserisci nuova preferenza
            cursor.execute("""
                INSERT INTO preferenze_utenti 
                (username, form_type, name, preferences, updated_at) 
                VALUES (%s, %s, %s, %s, %s)
            """, (username, form_type, name, preferences_json, now))
            message = f"Preferenza '{name}' salvata"
        
        conn.commit()
        return jsonify({'status': 'success', 'message': message})
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Errore nel salvataggio della preferenza: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

@preferences_bp.route('/api/getPreferenzeForm', methods=['GET'])
def ottieni_preferenze_form():
    """Ottiene tutte le preferenze del form per un utente"""
    conn = None
    cursor = None
    try:
        username = request.args.get('username')
        form_type = request.args.get('form_type', 'esame')
        
        if not username:
            return jsonify({'status': 'error', 'message': 'Username mancante'}), 400
        
        # Log per debug
        print(f"Richiesta preferenze per username: {username}, form_type: {form_type}")
        
        # Connessione al database
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # Recupera tutte le preferenze dell'utente
        cursor.execute("""
            SELECT id, name, preferences, updated_at 
            FROM preferenze_utenti 
            WHERE username = %s AND form_type = %s
            ORDER BY updated_at DESC
        """, (username, form_type))
        
        preferences = cursor.fetchall()
        
        # Log per debug
        print(f"Preferenze trovate: {len(preferences)}")
        
        # Converti le stringhe JSON in oggetti Python e converti i risultati in liste di dizionari
        result_prefs = []
        for pref in preferences:
            # Converti RealDictRow in dizionario
            pref_dict = dict(pref)
            pref_dict['preferences'] = json.loads(pref_dict['preferences'])
            # Converti datetime a stringa per la serializzazione JSON
            if 'updated_at' in pref_dict and pref_dict['updated_at']:
                pref_dict['updated_at'] = pref_dict['updated_at'].isoformat()
            result_prefs.append(pref_dict)
        
        return jsonify({
            'status': 'success',
            'preferences': result_prefs
        })
        
    except Exception as e:
        print(f"Errore nel recupero delle preferenze: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

@preferences_bp.route('/api/eliminaPreferenzaForm', methods=['DELETE'])
def elimina_preferenza_form():
    """Elimina una preferenza di un utente"""
    conn = None
    cursor = None
    try:
        data = request.json
        username = data.get('username')
        preference_id = data.get('id')
        
        if not username or not preference_id:
            return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400
        
        # Connessione al database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verifica che la preferenza appartenga all'utente
        cursor.execute("""
            DELETE FROM preferenze_utenti 
            WHERE id = %s AND username = %s
        """, (preference_id, username))
        
        conn.commit()
        
        if cursor.rowcount > 0:
            return jsonify({'status': 'success', 'message': 'Preferenza eliminata'})
        else:
            return jsonify({'status': 'error', 'message': 'Preferenza non trovata o non autorizzata'}), 404
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Errore nell'eliminazione della preferenza: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            # Utilizziamo release_connection invece di conn.close()
            release_connection(conn)
