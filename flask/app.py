# ===== Imports e configurazione =====
from flask import Flask, request, jsonify, make_response, session
from psycopg2 import sql
from datetime import datetime, timedelta
import os
# Config DB
from db import get_db_connection, release_connection, init_db, close_all_connections
# Auth stupida e SAML
from auth import auth_bp
from saml_auth import saml_bp, require_auth
# Backend OH-ISSA
from admin import admin_bp
# API fetch
from fetch import fetch_bp
# Import per gestione esami
from utils.examUtils import (
  generaDatiEsame, controllaVincoli, inserisciEsami, costruisciRispostaParziale
)
# Importa il nuovo blueprint delle preferenze
from user_preferences import preferences_bp
import sys

app = Flask(__name__)
# Chiave super segreta per SAML
app.config['SECRET_KEY'] = os.urandom(24)

# Inizializza il pool di connessioni prima di registrare i blueprint
init_db()

# Registrazione dei blueprint
app.register_blueprint(auth_bp)
app.register_blueprint(saml_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(fetch_bp)
# Registra il blueprint delle preferenze
app.register_blueprint(preferences_bp)

# Metodo popo rozzo pe non usa saml
app.config['SAML_ENABLED'] = False

# ===== API Gestione Esami =====
@app.route('/api/inserisciEsame', methods=['POST'])
def inserisciEsame():
  # API per inserire un esame nel database
  conn = None
  cursor = None
  
  try:
    # Verifica se l'utente è un admin e se ha richiesto il bypass dei controlli
    is_admin = False
    bypass_checks = request.form.get('bypass_checks', 'false').lower() == 'true'
    
    # username = session.get('username')
    username = request.cookies.get('username')
    if username:
      conn = get_db_connection()
      cursor = conn.cursor()
      cursor.execute("SELECT permessi_admin FROM utenti WHERE username = %s", (username,))
      result = cursor.fetchone()
      if result and result[0]:
        is_admin = True
      
      if cursor:
        cursor.close()
        cursor = None
    
    # 1. Raccolta dati dal form
    dati_esame = generaDatiEsame()
    if "status" in dati_esame and dati_esame["status"] == "error":
      return jsonify(dati_esame), 400
    
    # 2. Se admin ha richiesto bypass, salta i controlli
    if is_admin and bypass_checks:
      # Preparo la lista di dizionari che inserisciEsami si aspetta
      insegnamenti_dict = []
      conn = get_db_connection()
      cursor = conn.cursor()
      
      for codice in dati_esame['insegnamenti']:
        # Cerca il titolo dell'insegnamento
        cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (codice,))
        result = cursor.fetchone()
        titolo = result[0] if result else codice
        
        # Aggiungi alla lista
        insegnamenti_dict.append({
          'codice': codice,
          'titolo': titolo,
          'data_inizio_iscrizione': dati_esame['inizio_iscrizione'],
          'data_fine_iscrizione': dati_esame['fine_iscrizione']
        })
      
      # Inserisci direttamente senza controlli
      esami_inseriti, errori = inserisciEsami(dati_esame, insegnamenti_dict)
      
      if errori:
        return jsonify(costruisciRispostaParziale(esami_inseriti, errori)), 207
      
      return jsonify({
        'status': 'success',
        'message': 'Esami inseriti con successo (controlli bypassati)',
        'inserted': esami_inseriti
      }), 200
    
    # 3. Esegui controlli dei vincoli
    dati_esame, validi, invalidi, errore_bloccante = controllaVincoli(dati_esame)
    
    # Se c'è un errore bloccante, interrompi subito
    if errore_bloccante:
      return jsonify({'status': 'error', 'message': errore_bloccante}), 400
    
    # 4. Decide se inserire direttamente o mostrare popup di conferma
    if not invalidi and validi:
      # Inserimento diretto di tutti gli esami validi
      esami_inseriti, errori = inserisciEsami(dati_esame, validi)
      if errori:
        return jsonify(costruisciRispostaParziale(esami_inseriti, errori)), 207
      return jsonify({
        'status': 'direct_insert',
        'message': 'Tutti gli esami sono stati inseriti con successo',
        'inserted': esami_inseriti
      }), 200
    
    # 5. Costruisci risposta per conferma utente
    return jsonify({
      'status': 'validation',
      'message': 'Verifica completata',
      'dati_comuni': dati_esame,
      'esami_validi': validi,
      'esami_invalidi': invalidi
    }), 200

  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if cursor:
      cursor.close()
    if conn:
      release_connection(conn)

@app.route('/api/confermaEsami', methods=['POST'])
def confermaEsami():
  # API per inserire gli esami selezionati dall'utente
  try:
    # Parse JSON della richiesta
    data = request.json
    if not data:
      return jsonify({'status': 'error', 'message': 'Dati mancanti'}), 400
    
    dati_comuni = data.get('dati_comuni', {})
    esami_da_inserire = data.get('esami_da_inserire', [])
    
    if not esami_da_inserire:
      return jsonify({'status': 'error', 'message': 'Nessun esame selezionato per l\'inserimento'}), 400
    
    # Inserisci gli esami selezionati usando la nuova funzione
    esami_inseriti, errori = inserisciEsami(dati_comuni, esami_da_inserire)
    
    # Se ci sono stati errori ma almeno un esame è stato inserito, restituisci avviso
    if errori and esami_inseriti:
      return jsonify({
        'status': 'partial', 
        'message': 'Alcuni esami sono stati inseriti con successo', 
        'inserted': esami_inseriti, 
        'errors': errori
      }), 207
    elif errori and not esami_inseriti:
      return jsonify({
        'status': 'error',
        'message': 'Nessun esame è stato inserito a causa di errori',
        'errors': errori
      }), 400
    
    return jsonify({
      'status': 'success', 
      'message': 'Tutti gli esami sono stati inseriti con successo',
      'inserted': esami_inseriti
    }), 200

  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500

# API per verificare se sono stati inseriti almeno 8 esami per insegnamento del docente
@app.route('/api/checkEsamiMinimi', methods=['GET'])
@require_auth
def esamiMinimi():
  try:
    if app.config['SAML_ENABLED']:
      username = session.get('saml_nameid')
    else:
      username = request.cookies.get('username')
    
    if not username:
      return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    current_year = datetime.now().year
    anno_accademico = current_year if datetime.now().month >= 9 else current_year - 1
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Ottiene tutti gli insegnamenti del docente per l'anno accademico
    cursor.execute("""
      SELECT id.insegnamento, ins.titolo
      FROM insegnamento_docente id
      JOIN insegnamenti ins ON id.insegnamento = ins.codice
      WHERE id.docente = %s AND id.annoaccademico = %s
    """, (username, anno_accademico))
    
    insegnamenti = cursor.fetchall()
    risultati = []
    
    # Per ogni insegnamento, conta il numero di esami inseriti
    for codice, titolo in insegnamenti:
      cursor.execute("""
        SELECT COUNT(*) 
        FROM esami 
        WHERE docente = %s AND insegnamento = %s
      """, (username, codice))
      
      count = cursor.fetchone()[0]
      if count < 8:  # Minimo 8 esami richiesti
        risultati.append({
          'codice': codice,
          'titolo': titolo,
          'esami_inseriti': count,
          'esami_mancanti': 8 - count
        })
    
    # Creiamo un messaggio descrittivo per la risposta
    message = "Tutti gli insegnamenti hanno il numero minimo di esami."
    if risultati:
      if len(risultati) == 1:
        ins = risultati[0]
        message = f"L'insegnamento {ins['titolo']} ({ins['codice']}) ha solo {ins['esami_inseriti']} esami inseriti su 8 richiesti."
      else:
        message = f"Ci sono {len(risultati)} insegnamenti che non hanno il numero minimo di 8 esami."
    
    return jsonify({
      'status': 'success',
      'message': message,
      'insegnamenti_sotto_minimo': risultati
    }), 200

  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'conn' in locals() and conn:
      cursor.close()
      release_connection(conn)

# ===== Main =====
if __name__ == '__main__':
  app.config['DEBUG'] = True 
  app.run(host='0.0.0.0')
