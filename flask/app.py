# ===== Imports e configurazione =====
from flask import Flask, request, jsonify, make_response, session
from psycopg2 import sql
from datetime import datetime, timedelta
import os
# Config DB
from db import get_db_connection, release_connection, init_db, close_all_connections
# Funzioni per la gestione delle date/sessioni
from utils.sessions import get_session_for_date
# Auth stupida e SAML
from auth import auth_bp
from saml_auth import saml_bp, require_auth
# Backend OH-ISSA
from admin import admin_bp
# API fetch
from fetch import fetch_bp

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
    # Raccogli i dati dal form
    data = request.form
    docente = data.get('docente')
    
    # Gestione di insegnamenti multipli
    insegnamenti = request.form.getlist('insegnamento')
    if not insegnamenti:
      return jsonify({'status': 'error', 'message': 'Nessun insegnamento selezionato'}), 400
    
    aula = data.get('aula')
    data_appello = data.get('dataora')
    ora_appello = data.get('ora')
    durata_appello = data.get('durata')
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    tipo_esame = data.get('tipoEsame')
    verbalizzazione = data.get('verbalizzazione', 'STD')  # Default: Standard
    note_appello = data.get('note')
    posti = data.get('posti')
    anno_accademico = data.get('anno_accademico')  # Nuovo campo
    # Converti ora_appello in intero per il confronto
    ora_int = int(ora_appello.split(':')[0])
    periodo = 1 if ora_int > 13 else 0

    # Campi obbligatori
    if not all([docente, aula, data_appello, ora_appello]):
      return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400

    # Validazione ora appello
    try:
      ora_parts = ora_appello.split(':')
      ora_int = int(ora_parts[0])
      if ora_int < 8 or ora_int > 23:
        return jsonify({'status': 'error', 'message': 'L\'ora dell\'appello deve essere compresa tra le 08:00 e le 23:00'}), 400
    except (ValueError, IndexError):
      return jsonify({'status': 'error', 'message': 'Formato ora non valido'}), 400

    # Converti ora_appello in intero per il confronto
    periodo = 1 if ora_int > 13 else 0

    # Valori standard per i campi mancanti
    tipo_appello = 'PF'
    definizione_appello = 'STD'
    gestione_prenotazione = 'STD'
    riservato = False  # 0 in SQL
    tipo_iscrizione = 'STD'
    
    # Gestione tipo_esame - Se è vuoto impostiamo NULL
    if not tipo_esame or tipo_esame.strip() == '':
      tipo_esame = None
    
    # Converti posti in intero se presente
    if posti:
      try:
        posti = int(posti)
      except ValueError:
        posti = None
    else:
      posti = None

    # Verifica che l'anno sia valido
    data_esame = datetime.fromisoformat(data_appello)

    conn = get_db_connection()
    cursor = conn.cursor()

    # Liste per tenere traccia degli esami validi e non validi
    esami_validi = []
    esami_invalidi = []

    # Verifica aule/giorni/periodo - facciamo questa verifica una sola volta per tutti gli esami
    cursor.execute("""
      SELECT COUNT(*) FROM esami 
      WHERE data_appello = %s AND aula = %s AND periodo = %s
    """, (data_appello, aula, periodo))
    if cursor.fetchone()[0] > 0:
      # C'è un conflitto con altre prenotazioni
      return jsonify({
        'status': 'error', 
        'message': 'Aula già occupata in questo periodo'
      }), 400

    # Ciclo su tutti gli insegnamenti selezionati per verificarli
    for insegnamento in insegnamenti:
      try:
        # Ottieni il titolo dell'insegnamento per mostrarlo nei messaggi di errore
        cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
        titolo_insegnamento = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
        
        # Ottieni le informazioni del CDS dall'insegnamento per l'anno corrente
        # Query modificata per risolvere il problema
        cursor.execute("""
          SELECT ic.cds, ic.anno_accademico 
          FROM insegnamenti_cds ic
          WHERE ic.insegnamento = %s 
            AND ic.anno_accademico = %s
        """, (insegnamento, anno_accademico))
        
        cds_info = cursor.fetchone()
          
        if not cds_info:
          esami_invalidi.append({
            'codice': insegnamento,
            'titolo': titolo_insegnamento,
            'errore': "Insegnamento non trovato"
          })
          continue
        
        cds_code, anno_acc = cds_info

        # Verifica limite esami per sessione
        sessione_info = get_session_for_date(data_esame, cds_code, anno_acc)
        if not sessione_info:
          esami_invalidi.append({
            'codice': insegnamento,
            'titolo': titolo_insegnamento,
            'errore': "La data selezionata non rientra in nessuna sessione d'esame valida"
          })
          continue

        sessione, limite_max, data_inizio_sessione = sessione_info

        # Imposta valori predefiniti per i campi obbligatori
        data_inizio_iscrizione = inizio_iscrizione if inizio_iscrizione else (data_inizio_sessione - timedelta(days=20)).strftime("%Y-%m-%d")
        data_fine_iscrizione = fine_iscrizione if fine_iscrizione else (data_esame - timedelta(days=1)).strftime("%Y-%m-%d")

        # Conta esami nella stessa sessione
        cursor.execute("""
          SELECT COUNT(*) 
          FROM esami e
          JOIN periodi_esame pe ON pe.cds = %s 
                              AND pe.anno_accademico = %s
                              AND pe.tipo_periodo = %s
          WHERE e.docente = %s 
            AND e.insegnamento = %s
            AND e.data_appello BETWEEN pe.inizio AND pe.fine
        """, (cds_code, anno_acc, sessione, docente, insegnamento))

        if cursor.fetchone()[0] >= limite_max:
          esami_invalidi.append({
            'codice': insegnamento,
            'titolo': titolo_insegnamento,
            'errore': f"Limite di {limite_max} esami nella sessione {sessione} raggiunto"
          })
          continue

        # Verifica vincolo dei 14 giorni
        data_min = data_esame - timedelta(days=14)
        data_max = data_esame + timedelta(days=14)
        
        cursor.execute("""
          SELECT data_appello FROM esami 
          WHERE insegnamento = %s AND data_appello BETWEEN %s AND %s
        """, (insegnamento, data_min, data_max))
        
        esami_vicini = cursor.fetchall()
        if esami_vicini:
          date_esami = [e[0].strftime('%d/%m/%Y') for e in esami_vicini]
          esami_invalidi.append({
            'codice': insegnamento,
            'titolo': titolo_insegnamento,
            'errore': f"Non puoi inserire esami a meno di 14 giorni di distanza. Hai già esami nelle date: {', '.join(date_esami)}"
          })
          continue

        # Ottieni il titolo dell'insegnamento per mostrarlo nell'interfaccia utente
        cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
        titolo = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
        
        # L'esame è valido, aggiungi alla lista
        esami_validi.append({
          'codice': insegnamento,
          'titolo': titolo,
          'data_inizio_iscrizione': data_inizio_iscrizione,
          'data_fine_iscrizione': data_fine_iscrizione
        })

      except Exception as e:
        # Se avviene un errore in questa fase, cerca comunque di ottenere il titolo dell'insegnamento
        try:
          cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
          titolo_insegnamento = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
        except:
          titolo_insegnamento = insegnamento
          
        esami_invalidi.append({
          'codice': insegnamento,
          'titolo': titolo_insegnamento,
          'errore': f"Errore nella verifica dell'esame: {str(e)}"
        })

    # Costruisci i dati comuni della richiesta
    dati_comuni = {
      'docente': docente,
      'aula': aula,
      'data_appello': data_appello,
      'ora_appello': ora_appello,
      'periodo': periodo,
      'durata_appello': durata_appello,
      'verbalizzazione': verbalizzazione,
      'tipo_esame': tipo_esame,
      'posti': posti,
      'note_appello': note_appello,
      'tipo_appello': tipo_appello,
      'definizione_appello': definizione_appello,
      'gestione_prenotazione': gestione_prenotazione,
      'riservato': riservato,
      'tipo_iscrizione': tipo_iscrizione
    }
    
    # Se non ci sono esami invalidi, inserisci direttamente gli esami validi
    if not esami_invalidi and esami_validi:
      # Copiato il codice di confermaEsami
      conn = get_db_connection()
      cursor = conn.cursor()
      
      esami_inseriti = []
      errori = []
      
      # Inserimento diretto degli esami validi
      for esame in esami_validi:
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
                riservato, tipo_iscrizione, periodo, durata_appello)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (dati_comuni['docente'], insegnamento, dati_comuni['aula'], 
             dati_comuni['data_appello'], dati_comuni['ora_appello'], 
             inizio_iscrizione, fine_iscrizione, 
             dati_comuni['tipo_esame'], dati_comuni['verbalizzazione'], 
             dati_comuni['note_appello'], dati_comuni['posti'],
             dati_comuni['tipo_appello'], dati_comuni['definizione_appello'], 
             dati_comuni['gestione_prenotazione'], dati_comuni['riservato'], 
             dati_comuni['tipo_iscrizione'], dati_comuni['periodo'], 
             dati_comuni['durata_appello'])
          )
          esami_inseriti.append(esame['titolo'])
        except Exception as e:
          errori.append({
            'codice': insegnamento,
            'titolo': esame['titolo'],
            'errore': f"Errore nell'inserimento dell'esame: {str(e)}"
          })
      
      # Commit delle modifiche
      if esami_inseriti:
        conn.commit()
      
      # Gestisci i risultati
      if errori:
        return jsonify({
          'status': 'partial', 
          'message': 'Alcuni esami sono stati inseriti con successo', 
          'inserted': esami_inseriti, 
          'errors': errori
        }), 207
      
      return jsonify({
        'status': 'direct_insert',
        'message': 'Tutti gli esami sono stati inseriti con successo',
        'inserted': esami_inseriti
      }), 200
    
    # Costruisci risposta per la validazione se ci sono esami invalidi
    risposta = {
      'status': 'validation',
      'message': 'Verifica completata',
      'dati_comuni': dati_comuni,
      'esami_validi': esami_validi,
      'esami_invalidi': esami_invalidi
    }
    
    return jsonify(risposta), 200

  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

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
              riservato, tipo_iscrizione, periodo, durata_appello)
             VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          (dati_comuni['docente'], insegnamento, dati_comuni['aula'], 
           dati_comuni['data_appello'], dati_comuni['ora_appello'], 
           inizio_iscrizione, fine_iscrizione, 
           dati_comuni['tipo_esame'], dati_comuni['verbalizzazione'], 
           dati_comuni['note_appello'], dati_comuni['posti'],
           dati_comuni['tipo_appello'], dati_comuni['definizione_appello'], 
           dati_comuni['gestione_prenotazione'], dati_comuni['riservato'], 
           dati_comuni['tipo_iscrizione'], dati_comuni['periodo'], 
           dati_comuni['durata_appello'])
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
    if errori:
      return jsonify({
        'status': 'partial', 
        'message': 'Alcuni esami sono stati inseriti con successo', 
        'inserted': esami_inseriti, 
        'errors': errori
      }), 207
    
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
