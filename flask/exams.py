from flask import Blueprint, request, jsonify, session
from datetime import datetime, timedelta, date, time
import psycopg2
import json
import os
from db import get_db_connection, release_connection
from utils.examUtils import generaDatiEsame, controllaVincoli, inserisciEsami, costruisciRispostaParziale
from functools import wraps

exam_bp = Blueprint('exam_bp', __name__)

# Decorator per verificare il login
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return jsonify({'status': 'error', 'message': 'Login richiesto'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Funzione helper per la serializzazione JSON di tipi Python
def serialize_for_json(obj):
    """
    Converte tipi Python non serializzabili in JSON (date, time, datetime) in stringhe.
    """
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif isinstance(obj, time):
        return obj.strftime('%H:%M:%S')
    elif isinstance(obj, timedelta):
        return str(obj)
    return obj

@exam_bp.route('/api/inserisciEsame', methods=['POST'])
def inserisciEsame():
  # API per inserire un esame nel database
  conn = None
  cursor = None
  
  try:
    # Verifica se l'utente è un admin e se ha richiesto il bypass dei controlli
    is_admin = False
    bypass_checks = request.form.get('bypass_checks', 'false').lower() == 'true'
    
    username = session.get('username')
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
      
      # Per ogni combinazione data-insegnamento
      for data_info in dati_esame['date_appelli']:
        for codice in dati_esame['insegnamenti']:
          # Cerca il titolo dell'insegnamento
          cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (codice,))
          result = cursor.fetchone()
          titolo = result[0] if result else codice
          
          # Aggiungi alla lista
          insegnamenti_dict.append({
            'codice': codice,
            'titolo': titolo,
            'data_appello': data_info['data_appello'],
            'aula': data_info['aula'],
            'ora_appello': data_info['ora_appello'],
            'durata_appello': data_info['durata_appello'],
            'periodo': data_info['periodo'],
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

# Metodo API per la conferma degli esami
@exam_bp.route('/api/confermaEsami', methods=['POST'])
@login_required
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
    
    # Convertiamo i dati nella struttura che inserisciEsami si aspetta
    esami_formattati = []
    for esame in esami_da_inserire:
      esame_formattato = {
        'codice': esame['codice'],
        'data_appello': esame['data_appello'],
        'aula': esame['aula'],
        'ora_appello': esame['ora_appello'],
        'durata_appello': esame['durata_appello'],
        'periodo': esame['periodo'],
        'data_inizio_iscrizione': esame['data_inizio_iscrizione'],
        'data_fine_iscrizione': esame['data_fine_iscrizione']
      }
      
      # Aggiungi il titolo se disponibile nei dati comuni
      conn = get_db_connection()
      cursor = conn.cursor()
      cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (esame['codice'],))
      result = cursor.fetchone()
      if result:
        esame_formattato['titolo'] = result[0]
      cursor.close()
      release_connection(conn)
      
      esami_formattati.append(esame_formattato)
    
    # Inserisci gli esami selezionati usando la funzione aggiornata
    esami_inseriti, errori = inserisciEsami(dati_comuni, esami_formattati)
    
    # Se ci sono stati errori ma almeno un esame è stato inserito, restituisci avviso
    if errori and esami_inseriti:
      return jsonify(costruisciRispostaParziale(esami_inseriti, errori)), 207
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

@exam_bp.route('/api/getEsameById', methods=['GET'])
def get_esame_by_id():
    """
    Recupera i dettagli di un esame specifico per ID.
    Verifica se l'utente è autorizzato a modificare l'esame.
    """
    conn = None
    try:
        exam_id = request.args.get('id')
        if not exam_id:
            return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Ottieni username e permessi admin dalla sessione
        is_admin = session.get('admin', False)
        username = session.get('username', '')
        
        # Query aggiornata per recuperare tutti i campi
        query = """
        SELECT e.id, e.mostra_nel_calendario, e.docente, e.insegnamento, i.titolo AS insegnamento_titolo, 
               i.codice AS insegnamento_codice, e.aula, e.data_appello, e.ora_appello,
               e.durata_appello, e.periodo, e.tipo_appello, e.descrizione,
               e.data_inizio_iscrizione, e.data_fine_iscrizione, e.tipo_esame,
               e.verbalizzazione, e.note_appello, e.posti, e.definizione_appello,
               e.gestione_prenotazione, e.riservato, e.tipo_iscrizione,
               c.codice AS cds_codice, c.nome_corso AS cds_nome,
               c.curriculum, e.anno_accademico
        FROM esami e
        JOIN insegnamenti i ON e.insegnamento = i.id
        JOIN cds c ON e.cds = c.codice 
            AND e.anno_accademico = c.anno_accademico 
            AND e.curriculum = c.curriculum
        WHERE e.id = %s
        """
        cursor.execute(query, (exam_id,))
        esame = cursor.fetchone()

        if not esame:
            return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

        # Converti la riga in un dizionario
        columns = [desc[0] for desc in cursor.description]
        esame_dict = dict(zip(columns, esame))

        # Assicuriamoci che il campo docente sia pulito
        docente_esame = esame_dict['docente'].strip() if esame_dict['docente'] else ''
        
        # Verifica i permessi: solo il docente che ha creato l'esame o gli admin possono modificarlo
        # Utilizziamo un confronto case-insensitive per essere più tolleranti
        if not is_admin and (username.lower() != docente_esame.lower()):
            error_msg = f"Non hai i permessi per modificare questo esame. Utente: '{username}', Docente: '{docente_esame}'"
            print(f"ERRORE PERMESSI: {error_msg}")
            return jsonify({'success': False, 'message': error_msg}), 403

        # Verifica se l'esame può essere modificato (almeno 7 giorni nel futuro)
        today = datetime.now().date()
        exam_date = esame_dict['data_appello']
        
        can_modify = (exam_date - today).days >= 7

        # Aggiunge l'informazione se l'esame può essere modificato
        esame_dict['can_modify'] = can_modify
        esame_dict['message'] = "" if can_modify else "L'esame non può essere modificato perché è a meno di 7 giorni dalla data attuale"

        # Aggiunge flag esplicito per modalità modifica
        esame_dict['is_edit_mode'] = True
        esame_dict['edit_id'] = exam_id

        cursor.close()
        
        # Serializza tutti i tipi di dati non serializzabili direttamente in JSON
        for key, value in esame_dict.items():
            esame_dict[key] = serialize_for_json(value)

        return jsonify({'success': True, 'esame': esame_dict})

    except Exception as e:
        print(f"Errore in get_esame_by_id: {str(e)}")
        return jsonify({'success': False, 'message': f'Errore durante il recupero dell\'esame: {str(e)}'}), 500
    finally:
        if conn:
            release_connection(conn)

@exam_bp.route('/api/updateEsame', methods=['POST'])
def update_esame():
    """
    Aggiorna un esame esistente.
    Verifica che l'utente sia autorizzato a modificarlo e che la nuova data non sia anticipata.
    """
    conn = None
    try:
        data = request.get_json()
        exam_id = data.get('id')

        if not exam_id:
            return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Ottieni username e permessi admin dalla sessione
        is_admin = session.get('admin', False)
        username = session.get('username', '')

        # Ottieni i dettagli dell'esame esistente
        cursor.execute("SELECT * FROM esami WHERE id = %s", (exam_id,))
        esame_esistente = cursor.fetchone()

        if not esame_esistente:
            return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

        # Converti la riga in un dizionario
        columns = [desc[0] for desc in cursor.description]
        esame_dict = dict(zip(columns, esame_esistente))

        # Assicuriamoci che il campo docente sia pulito
        docente_esame = esame_dict['docente'].strip() if esame_dict['docente'] else ''
        
        # Verifica i permessi: solo il docente che ha creato l'esame o gli admin possono modificarlo
        # Utilizziamo un confronto case-insensitive per essere più tolleranti
        if not is_admin and (username.lower() != docente_esame.lower()):
            error_msg = f"Non hai i permessi per modificare questo esame. Utente: '{username}', Docente: '{docente_esame}'"
            print(f"ERRORE PERMESSI UPDATE: {error_msg}")
            return jsonify({'success': False, 'message': error_msg}), 403

        # Verifica se l'esame può essere modificato (almeno 7 giorni nel futuro)
        today = datetime.now().date()
        exam_date = esame_dict['data_appello']
        
        if (exam_date - today).days < 7:
            return jsonify({'success': False, 'message': 'L\'esame non può essere modificato perché è a meno di 7 giorni dalla data attuale'}), 400

        # Verifica che la nuova data non sia anticipata rispetto alla data originale
        nuova_data_appello = datetime.strptime(data.get('data_appello'), '%Y-%m-%d').date()
        if nuova_data_appello < exam_date:
            return jsonify({'success': False, 'message': 'La nuova data non può essere anticipata rispetto alla data originale'}), 400

        # Aggiungi l'ID dell'esame ai dati per il controllo vincoli
        dati_esame = {
            'exam_id': exam_id,
            'docente': data.get('docente', username),
            'insegnamenti': [data.get('insegnamento')],
            'aula': data.get('aula'),
            'data_appello': data.get('data_appello'),
            'ora_appello': data.get('ora_appello'),
            'durata_appello': data.get('durata_appello'),
            'periodo': data.get('periodo'),
            'tipo_appello': data.get('tipo_appello'),
            'inizio_iscrizione': data.get('data_inizio_iscrizione'),
            'fine_iscrizione': data.get('data_fine_iscrizione'),
            'tipo_esame': data.get('tipo_esame'),
            'verbalizzazione': data.get('verbalizzazione'),
            'descrizione': data.get('descrizione'),
            'note_appello': data.get('note_appello'),
            'posti': data.get('posti'),
            'anno_accademico': esame_dict.get('anno_accademico')
        }

        # Esegui i controlli
        dati_comuni, esami_validi, esami_invalidi, errore = controllaVincoli(dati_esame)

        if errore:
            return jsonify({'success': False, 'message': errore}), 400

        if not esami_validi:
            return jsonify({'success': False, 'message': esami_invalidi[0]['errore']}), 400

        # Prepara l'aggiornamento
        update_query = """
        UPDATE esami SET
            descrizione = %s,
            tipo_appello = %s,
            aula = %s,
            data_appello = %s,
            data_inizio_iscrizione = %s,
            data_fine_iscrizione = %s,
            ora_appello = %s,
            durata_appello = %s,
            periodo = %s,
            verbalizzazione = %s,
            definizione_appello = %s,
            gestione_prenotazione = %s,
            riservato = %s,
            tipo_iscrizione = %s,
            tipo_esame = %s,
            condizione_sql = %s,
            partizionamento = %s,
            partizione = %s,
            note_appello = %s,
            posti = %s,
            codice_turno = %s,
            mostra_nel_calendario = %s
        WHERE id = %s
        RETURNING id
        """

        params = (
            data.get('descrizione'),
            data.get('tipo_appello'),
            data.get('aula'),
            data.get('data_appello'),
            data.get('data_inizio_iscrizione'),
            data.get('data_fine_iscrizione'),
            data.get('ora_appello'),
            data.get('durata_appello'),
            data.get('periodo'),
            data.get('verbalizzazione'),
            data.get('definizione_appello'),
            data.get('gestione_prenotazione'),
            data.get('riservato', False),
            data.get('tipo_iscrizione'),
            data.get('tipo_esame'),
            data.get('condizione_sql'),
            data.get('partizionamento'),
            data.get('partizione'),
            data.get('note_appello'),
            data.get('posti'),
            data.get('codice_turno'),
            data.get('mostra_nel_calendario', True),
            exam_id
        )

        cursor.execute(update_query, params)
        updated_id = cursor.fetchone()[0]
        
        conn.commit()
        cursor.close()

        return jsonify({
            'success': True,
            'message': 'Esame aggiornato con successo',
            'id': updated_id
        })

    except Exception as e:
        print(f"Errore in update_esame: {str(e)}")
        return jsonify({'success': False, 'message': f'Errore durante l\'aggiornamento dell\'esame: {str(e)}'}), 500
    finally:
        if conn:
            release_connection(conn)

@exam_bp.route('/api/deleteEsame', methods=['POST'])
def delete_esame():
    """
    Elimina un esame esistente.
    Verifica che l'utente sia autorizzato a eliminarlo.
    """
    conn = None
    try:
        data = request.get_json()
        exam_id = data.get('id')

        if not exam_id:
            return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Ottieni username e permessi admin dalla sessione
        is_admin = session.get('admin', False)
        username = session.get('username', '')

        # Ottieni i dettagli dell'esame esistente
        cursor.execute("SELECT * FROM esami WHERE id = %s", (exam_id,))
        esame_esistente = cursor.fetchone()

        if not esame_esistente:
            return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

        # Converti la riga in un dizionario
        columns = [desc[0] for desc in cursor.description]
        esame_dict = dict(zip(columns, esame_esistente))

        # Assicuriamoci che il campo docente sia pulito
        docente_esame = esame_dict['docente'].strip() if esame_dict['docente'] else ''

        # Verifica i permessi: solo il docente che ha creato l'esame o gli admin possono eliminarlo
        # Utilizziamo un confronto case-insensitive per essere più tolleranti
        if not is_admin and (username.lower() != docente_esame.lower()):
            error_msg = f"Non hai i permessi per eliminare questo esame. Utente: '{username}', Docente: '{docente_esame}'"
            print(f"ERRORE PERMESSI DELETE: {error_msg}")
            return jsonify({'success': False, 'message': error_msg}), 403

        # Verifica se l'esame può essere eliminato (almeno 7 giorni nel futuro)
        today = datetime.now().date()
        exam_date = esame_dict['data_appello']
        
        if (exam_date - today).days < 7:
            return jsonify({'success': False, 'message': 'L\'esame non può essere eliminato perché è a meno di 7 giorni dalla data attuale'}), 400

        # Elimina l'esame
        cursor.execute("DELETE FROM esami WHERE id = %s", (exam_id,))
        
        conn.commit()
        cursor.close()

        return jsonify({
            'success': True,
            'message': 'Esame eliminato con successo'
        })

    except Exception as e:
        print(f"Errore in delete_esame: {str(e)}")
        return jsonify({'success': False, 'message': f'Errore durante l\'eliminazione dell\'esame: {str(e)}'}), 500
    finally:
        if conn:
            release_connection(conn)