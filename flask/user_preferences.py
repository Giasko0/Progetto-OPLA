from flask import Blueprint, request, jsonify
from db import get_db_connection, release_connection
import json
import psycopg2.extras

preferences_bp = Blueprint('preferences', __name__)

@preferences_bp.route('/api/preferenze', methods=['POST'])
def crea_preferenza():
    """Crea o aggiorna una preferenza"""
    conn = None
    cursor = None
    try:
        data = request.json
        username = data.get('username')
        name = data.get('name')
        preferences = data.get('preferences')
        
        if not all([username, name, preferences]):
            return jsonify({'error': 'Dati incompleti'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Upsert: inserisci o aggiorna se esiste
        cursor.execute("""
            INSERT INTO preferenze_utenti (username, form_type, name, preferences, updated_at) 
            VALUES (%s, 'esame', %s, %s, NOW())
            ON CONFLICT (username, form_type, name) 
            DO UPDATE SET preferences = %s, updated_at = NOW()
        """, (username, name, json.dumps(preferences), json.dumps(preferences)))
        
        conn.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

@preferences_bp.route('/api/preferenze', methods=['GET'])
def ottieni_preferenze():
    """Ottiene tutte le preferenze di un utente"""
    conn = None
    cursor = None
    try:
        username = request.args.get('username')
        if not username:
            return jsonify({'error': 'Username mancante'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute("""
            SELECT id, name, preferences
            FROM preferenze_utenti 
            WHERE username = %s AND form_type = 'esame'
            ORDER BY updated_at DESC
        """, (username,))
        
        result = []
        for row in cursor.fetchall():
            result.append({
                'id': row['id'],
                'name': row['name'],
                'preferences': json.loads(row['preferences'])
            })
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

@preferences_bp.route('/api/preferenze/<int:preference_id>', methods=['POST'])
def elimina_preferenza(preference_id):
    """Elimina una preferenza"""
    conn = None
    cursor = None
    try:
        username = request.args.get('username')
        if not username:
            return jsonify({'error': 'Username mancante'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM preferenze_utenti 
            WHERE id = %s AND username = %s
        """, (preference_id, username))
        
        conn.commit()
        
        if cursor.rowcount > 0:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Preferenza non trovata'}), 404
        
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)
