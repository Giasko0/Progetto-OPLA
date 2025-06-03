from flask import request, jsonify
from datetime import datetime, timedelta
from db import get_db_connection, release_connection
from utils.sessions import getSessionePerData

def generaDatiEsame():
  """
  Raccoglie i dati dal form modulare, li valida e genera un dizionario con tutti i dati 
  necessari per l'inserimento di esami. Ora ogni appello ha tutti i suoi campi specifici.
  """
  try:
    # Raccolta dati dal form
    data = request.form
    docente = data.get('docente')
    
    # Gestione insegnamenti multipli (rimane globale)
    insegnamenti = request.form.getlist('insegnamento')
    if not insegnamenti and 'insegnamento' in request.form:
      insegnamenti = [request.form['insegnamento']]
      
    if not insegnamenti:
      return {'status': 'error', 'message': 'Nessun insegnamento selezionato'}
    
    # Raccolta delle sezioni di appelli dal form modulare
    sezioni_appelli = []
    
    # Cerca tutte le sezioni numerando da 1
    section_index = 1
    while True:
      # Controlla se esiste una sezione con questo indice
      descrizione_key = f'descrizione_{section_index}'
      if descrizione_key not in data:
        break
      
      # Raccogli tutti i dati per questa sezione
      sezione = {
        'descrizione': data.get(f'descrizione_{section_index}', ''),
        'data_appello': data.get(f'dataora_{section_index}'),
        'ora_h': data.get(f'ora_h_{section_index}'),
        'ora_m': data.get(f'ora_m_{section_index}'),
        'durata': data.get(f'durata_{section_index}', '120'),
        'aula': data.get(f'aula_{section_index}'),
        'inizio_iscrizione': data.get(f'inizioIscrizione_{section_index}'),
        'fine_iscrizione': data.get(f'fineIscrizione_{section_index}'),
        'verbalizzazione': data.get(f'verbalizzazione_{section_index}', 'FSS'),
        'tipo_esame': data.get(f'tipoEsame_{section_index}'),
        'note_appello': data.get(f'note_{section_index}', ''),
        'tipo_appello': data.get(f'tipo_appello_{section_index}', 'PF'),
        'mostra_nel_calendario': data.get(f'mostra_nel_calendario_{section_index}', 'false').lower() == 'true'
      }
      
      # Validazione campi obbligatori per questa sezione
      if not all([sezione['data_appello'], sezione['ora_h'], sezione['ora_m'], sezione['aula']]):
        section_index += 1
        continue
      
      # Costruisci l'ora completa
      sezione['ora_appello'] = f"{sezione['ora_h']}:{sezione['ora_m']}"
      
      # Validazione ora appello
      try:
        ora_int = int(sezione['ora_h'])
        if ora_int < 8 or ora_int > 18:
          return {'status': 'error', 'message': f'Ora non valida per l\'appello {section_index}: {sezione["ora_appello"]}. Deve essere tra le 08:00 e le 18:00'}
      except (ValueError, TypeError):
        return {'status': 'error', 'message': f'Formato ora non valido per l\'appello {section_index}: {sezione["ora_appello"]}'}
      
      # Periodo (mattina/pomeriggio)
      sezione['periodo'] = 1 if ora_int >= 14 else 0
      
      # Durata appello
      try:
        durata_appello = int(sezione['durata'])
        if durata_appello < 30 or durata_appello > 480:
          return {'status': 'error', 'message': f'La durata deve essere compresa tra 30 e 480 minuti per l\'appello {section_index}'}
        sezione['durata_appello'] = durata_appello
      except (ValueError, TypeError):
        sezione['durata_appello'] = 120
      
      # Gestione tipo iscrizione
      tipo_iscrizione = 'SOC' if sezione['tipo_esame'] == 'SO' else sezione['tipo_esame']
      sezione['tipo_iscrizione'] = tipo_iscrizione
      
      # Campi con valori di default
      sezione['definizione_appello'] = 'STD'
      sezione['gestione_prenotazione'] = 'STD'
      sezione['riservato'] = False
      sezione['posti'] = None
      
      sezioni_appelli.append(sezione)
      section_index += 1
    
    if not sezioni_appelli:
      return {'status': 'error', 'message': 'Nessuna sezione appello valida inserita'}
    
    # Validazione campi globali obbligatori
    if not all([docente, insegnamenti]):
      return {'status': 'error', 'message': 'Dati incompleti: mancano docente o insegnamenti'}
    
    # Anno accademico
    current_date = datetime.now()
    anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    # Restituisci dizionario con tutti i dati raccolti e validati
    return {
      'insegnamenti': insegnamenti,
      'docente': docente,
      'sezioni_appelli': sezioni_appelli,
      'anno_accademico': anno_accademico
    }
  except Exception as e:
    return {'status': 'error', 'message': f'Errore nella raccolta dati: {str(e)}'}

def controllaVincoli(dati_esame):
  """
  Controlla tutti i vincoli per gli esami specificati usando la nuova struttura modulare.
  Restituisce True se tutti gli esami sono validi, False e il primo errore altrimenti.
  """
  conn = None
  cursor = None
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifico se ci sono errori bloccanti
    if "status" in dati_esame and dati_esame["status"] == "error":
      return False, dati_esame["message"]
    
    # Ottieni dati comuni
    insegnamenti = dati_esame['insegnamenti']
    docente = dati_esame['docente']
    sezioni_appelli = dati_esame['sezioni_appelli']
    anno_accademico = dati_esame['anno_accademico']
    
    # Per ogni combinazione sezione-insegnamento, verifica i vincoli
    for sezione in sezioni_appelli:
      data_appello = sezione['data_appello']
      aula = sezione['aula']
      periodo = sezione['periodo']
      mostra_nel_calendario = sezione['mostra_nel_calendario']
      
      # Converti in oggetto data
      data_esame = datetime.fromisoformat(data_appello)
      
      # Verifica se il giorno è sabato o domenica
      giorno_settimana = data_esame.weekday()
      if giorno_settimana >= 5:
        return False, f'Non è possibile inserire esami di sabato o domenica ({data_appello})'
      
      # Verifica conflitti di aula per questa data
      if aula != "Studio docente DMI":
        cursor.execute("""
          SELECT COUNT(*) FROM esami 
          WHERE data_appello = %s AND aula = %s AND periodo = %s
        """, (data_appello, aula, periodo))
        
        if cursor.fetchone()[0] > 0:
          return False, f'Aula {aula} già occupata in questo periodo per la data {data_appello}'
      
      # Per ogni insegnamento verifica i vincoli specifici
      for insegnamento in insegnamenti:
        try:
          # Ottieni titolo per messaggi di errore
          cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
          titolo_insegnamento = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
          
          # Verifica che l'insegnamento esista per l'anno corrente
          cursor.execute("""
            SELECT ic.cds, ic.anno_accademico 
            FROM insegnamenti_cds ic
            JOIN insegnamenti i ON ic.insegnamento = i.id
            WHERE i.codice = %s 
              AND ic.anno_accademico = %s
          """, (insegnamento, anno_accademico))
          
          cds_info = cursor.fetchone()
          if not cds_info:
            return False, f"Insegnamento {titolo_insegnamento} non trovato per l'anno accademico specificato"
          
          # Verifica vincolo dei 14 giorni solo se mostra_nel_calendario è True
          if mostra_nel_calendario:
            data_min = data_esame - timedelta(days=13)
            data_max = data_esame + timedelta(days=13)
            
            exam_id_to_exclude = dati_esame.get('exam_id')
            if exam_id_to_exclude:
              cursor.execute("""
                SELECT data_appello FROM esami e
                JOIN insegnamenti i ON e.insegnamento = i.id
                WHERE i.codice = %s AND data_appello BETWEEN %s AND %s
                AND e.id != %s
                AND e.mostra_nel_calendario = TRUE
              """, (insegnamento, data_min, data_max, exam_id_to_exclude))
            else:
              cursor.execute("""
                SELECT data_appello FROM esami e
                JOIN insegnamenti i ON e.insegnamento = i.id
                WHERE i.codice = %s AND data_appello BETWEEN %s AND %s
                AND e.mostra_nel_calendario = TRUE
              """, (insegnamento, data_min, data_max))
            
            esami_vicini = cursor.fetchall()
            if esami_vicini:
              date_esami = [e[0].strftime('%d/%m/%Y') for e in esami_vicini]
              return False, f"Non puoi inserire l'esame di {titolo_insegnamento} il {data_appello}: hai già esami nelle date: {', '.join(date_esami)} (vincolo 14 giorni)"
          
        except Exception as e:
          # Gestione errori durante la verifica
          try:
            cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
            titolo_insegnamento = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
          except:
            titolo_insegnamento = insegnamento
            
          return False, f"Errore nella verifica dell'esame {titolo_insegnamento}: {str(e)}"
    
    # Se arriviamo qui, tutti i controlli sono passati
    return True, None
    
  except Exception as e:
    return False, f"Errore nella verifica vincoli: {str(e)}"
  finally:
    if cursor:
      cursor.close()
    if conn:
      release_connection(conn)

def inserisciEsami(dati_esame):
  """
  Inserisce tutti gli esami nel database usando la nuova struttura modulare.
  """
  conn = None
  cursor = None
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    esami_inseriti = []
    
    # Ottieni dati comuni
    insegnamenti = dati_esame['insegnamenti']
    docente = dati_esame['docente']
    sezioni_appelli = dati_esame['sezioni_appelli']
    anno_accademico = dati_esame['anno_accademico']
    
    # Per ogni combinazione sezione-insegnamento, inserisci l'esame
    for sezione in sezioni_appelli:
      for insegnamento_codice in insegnamenti:
        try:
          # Prima ottieni l'ID dell'insegnamento dal codice
          cursor.execute("SELECT id, titolo FROM insegnamenti WHERE codice = %s", (insegnamento_codice,))
          result = cursor.fetchone()
          if not result:
            raise Exception(f"Insegnamento con codice {insegnamento_codice} non trovato")
            
          insegnamento_id, titolo_insegnamento = result
          
          # Recupera cds e curriculum
          cursor.execute("""
            SELECT cds, curriculum 
            FROM insegnamenti_cds 
            WHERE insegnamento = %s AND anno_accademico = %s
            LIMIT 1
          """, (insegnamento_id, anno_accademico))
          
          cds_info = cursor.fetchone()
          if not cds_info:
            raise Exception(f"Non sono state trovate informazioni sul CDS per l'insegnamento {insegnamento_codice}")
          
          cds, curriculum = cds_info
          
          # Inserisci nel database usando tutti i dati della sezione
          cursor.execute(
            """INSERT INTO esami 
               (docente, insegnamento, aula, data_appello, ora_appello, 
              data_inizio_iscrizione, data_fine_iscrizione, 
              tipo_esame, verbalizzazione, descrizione, note_appello,
              tipo_appello, definizione_appello, gestione_prenotazione, 
              riservato, tipo_iscrizione, periodo, durata_appello,
              cds, anno_accademico, curriculum, mostra_nel_calendario)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (docente, insegnamento_id, sezione['aula'], 
             sezione['data_appello'], sezione['ora_appello'], 
             sezione['inizio_iscrizione'], sezione['fine_iscrizione'], 
             sezione['tipo_esame'], sezione['verbalizzazione'],
             sezione['descrizione'], sezione['note_appello'],
             sezione['tipo_appello'], sezione['definizione_appello'], 
             sezione['gestione_prenotazione'], sezione['riservato'], 
             sezione['tipo_iscrizione'], sezione['periodo'], 
             sezione['durata_appello'], cds, anno_accademico, curriculum, 
             sezione['mostra_nel_calendario'])
          )
          
          esami_inseriti.append(f"{titolo_insegnamento} - {sezione['data_appello']}")
          
        except Exception as e:
          # Se c'è un errore durante l'inserimento, fai rollback e propaga l'errore
          conn.rollback()
          raise Exception(f"Errore nell'inserimento dell'esame {insegnamento_codice} - {sezione['data_appello']}: {str(e)}")
    
    # Commit di tutte le modifiche solo se tutto è andato bene
    conn.commit()
    return esami_inseriti
    
  except Exception as e:
    if conn:
      conn.rollback()
    raise e
  finally:
    if cursor:
      cursor.close()
    if conn:
      release_connection(conn)

def costruisciRispostaParziale(esami_inseriti, errori):
  # Questa funzione rimane invariata
  return {
    'status': 'partial', 
    'message': 'Alcuni esami sono stati inseriti con successo', 
    'inserted': esami_inseriti, 
    'errors': errori
  }
