from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from psycopg2.extras import DictCursor
from auth import require_auth

gestione_utenti_bp = Blueprint('gestione_utenti', __name__, url_prefix='/api/oh-issa')

# API per ottenere la lista degli utenti
@gestione_utenti_bp.route('/getUsers')
def get_users():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    # Recupera tutti gli utenti
    cursor.execute("""
      SELECT username, matricola, nome, cognome, permessi_admin
      FROM utenti
      ORDER BY username
    """)
    
    users = []
    for row in cursor.fetchall():
      users.append({
        'username': row['username'],
        'matricola': row['matricola'],
        'nome': row['nome'],
        'cognome': row['cognome'],
        'permessi_admin': row['permessi_admin']
      })
      
    return jsonify(users)
    
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per aggiornare i permessi di amministratore di un utente
@gestione_utenti_bp.route('/updateUserAdmin', methods=['POST'])
def update_user_admin():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    data = request.get_json()
    username = data.get('username')
    permessi_admin = data.get('permessi_admin')
    
    if username is None or permessi_admin is None:
      return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
      
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifica se l'utente esiste
    cursor.execute("SELECT 1 FROM utenti WHERE username = %s", (username,))
    if not cursor.fetchone():
      return jsonify({'status': 'error', 'message': f'Utente {username} non trovato'}), 404
      
    # Aggiorna i permessi admin dell'utente
    cursor.execute("""
      UPDATE utenti 
      SET permessi_admin = %s
      WHERE username = %s
    """, (permessi_admin, username))
    
    conn.commit()
    
    return jsonify({
      'status': 'success',
      'message': f'Permessi amministratore aggiornati per {username}'
    })
    
  except Exception as e:
    if 'conn' in locals() and conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per eliminare un utente
@gestione_utenti_bp.route('/deleteUser', methods=['POST'])
def delete_user():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    data = request.get_json()
    username = data.get('username')
    
    if not username:
      return jsonify({'status': 'error', 'message': 'Username mancante'}), 400
      
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifica se l'utente esiste
    cursor.execute("SELECT 1 FROM utenti WHERE username = %s", (username,))
    if not cursor.fetchone():
      return jsonify({'status': 'error', 'message': f'Utente {username} non trovato'}), 404
      
    # Elimina l'utente
    cursor.execute("DELETE FROM utenti WHERE username = %s", (username,))
    conn.commit()
    
    return jsonify({
      'status': 'success',
      'message': f'Utente {username} eliminato con successo'
    })
    
  except Exception as e:
    if 'conn' in locals() and conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per aggiungere un nuovo utente
@gestione_utenti_bp.route('/addUser', methods=['POST'])
def add_user():
    if not session.get('permessi_admin'):
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
        
    try:
        data = request.get_json()
        username = data.get('username')
        matricola = data.get('matricola')
        nome = data.get('nome', '')
        cognome = data.get('cognome', '')
        permessi_admin = data.get('permessi_admin', False)
        
        if not username or not matricola:
            return jsonify({
                'status': 'error', 
                'message': 'Username e matricola sono obbligatori'
            }), 400
            
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verifica se l'utente esiste già
        cursor.execute("SELECT 1 FROM utenti WHERE username = %s OR matricola = %s", (username, matricola))
        if cursor.fetchone():
            return jsonify({
                'status': 'error', 
                'message': 'Utente con questo username o matricola già esistente'
            }), 400
            
        # Inserisci il nuovo utente
        cursor.execute("""
            INSERT INTO utenti (username, matricola, nome, cognome, permessi_admin, password)
            VALUES (%s, %s, %s, %s, %s, 'password')
        """, (username, matricola, nome, cognome, permessi_admin))
        
        conn.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'Utente {username} aggiunto con successo'
        })
        
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.rollback()
        return jsonify({
            'status': 'error', 
            'message': 'Si è verificato un errore durante l\'aggiunta dell\'utente'
        }), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)