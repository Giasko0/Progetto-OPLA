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
    raccogliDatiForm, verificaConflittiAula, verificaInsegnamenti,
    inserisciEsami, costruisciRispostaParziale
)

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

# Metodo popo rozzo pe non usa saml
app.config['SAML_ENABLED'] = False

# ===== API Gestione Esami =====
@app.route('/api/inserisciEsame', methods=['POST'])
# API per verificare e inserire nuovi esami
def inserisciEsame():
    try:
        # 1. Raccolta e validazione dei dati base
        dati_comuni = raccogliDatiForm()
        if "status" in dati_comuni and dati_comuni["status"] == "error":
            return jsonify(dati_comuni), 400
            
        # 2. Verifica conflitti di aula
        conflitto_aula = verificaConflittiAula(dati_comuni)
        if conflitto_aula:
            return jsonify(conflitto_aula), 400
            
        # 3. Verifica ogni insegnamento (validazione)
        validi, invalidi = verificaInsegnamenti(dati_comuni)
        
        # 4. Decide se inserire direttamente o mostrare popup di conferma
        if not invalidi and validi:
            # Inserimento diretto di tutti gli esami validi
            esami_inseriti, errori = inserisciEsami(dati_comuni, validi)
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
            'dati_comuni': dati_comuni,
            'esami_validi': validi,
            'esami_invalidi': invalidi
        }), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/confermaEsami', methods=['POST'])
def confermaEsami():
  """API per inserire gli esami selezionati dall'utente"""
  conn = None
  try:
    # Parse JSON della richiesta
    data = request.json
    if not data:
      return jsonify({'status': 'error', 'message': 'Dati mancanti'}), 400
    
    dati_comuni = data.get('dati_comuni', {})
    esami_da_inserire = data.get('esami_da_inserire', [])
    
    if not esami_da_inserire:
      return jsonify({'status': 'error', 'message': 'Nessun esame selezionato per l\'inserimento'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()

    # Lista per tenere traccia degli esami inseriti
    esami_inseriti = []
    errori = []
    
    # Inserisci gli esami selezionati
    for esame in esami_da_inserire:
      try:
        insegnamento = esame['codice']
        inizio_iscrizione = esame.get('data_inizio_iscrizione')
        fine_iscrizione = esame.get('data_fine_iscrizione')
        
        # Inserimento nel database
        cursor.execute(
          """INSERT INTO esami 
             (docente, insegnamento, aula, data_appello, ora_appello, 
              data_inizio_iscrizione, data_fine_iscrizione, 
              tipo_esame, verbalizzazione, note_appello, posti,
              tipo_appello, definizione_appello, gestione_prenotazione, 
              riservato, tipo_iscrizione, periodo, durata_appello, descrizione)
             VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          (dati_comuni['docente'], insegnamento, dati_comuni['aula'], 
           dati_comuni['data_appello'], dati_comuni['ora_appello'], 
           inizio_iscrizione, fine_iscrizione, 
           dati_comuni['tipo_esame'], dati_comuni['verbalizzazione'], 
           dati_comuni['note_appello'], dati_comuni['posti'],
           dati_comuni['tipo_appello'], dati_comuni['definizione_appello'], 
           dati_comuni['gestione_prenotazione'], dati_comuni['riservato'], 
           dati_comuni['tipo_iscrizione'], dati_comuni['periodo'], 
           dati_comuni['durata_appello'], dati_comuni['descrizione'])
        )
        esami_inseriti.append(insegnamento)
      except Exception as e:
        errori.append({
          'codice': insegnamento,
          'errore': f"Errore nell'inserimento dell'esame: {str(e)}"
        })

    # Commit delle modifiche se è stato inserito almeno un esame
    if esami_inseriti:
      conn.commit()
    
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
    if conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if conn:
      release_connection(conn)

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
                    'esami_inseriti': count
                })
        
        return jsonify({
            'status': 'success',
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
