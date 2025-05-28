from flask import request, jsonify
from datetime import datetime, timedelta
from db import get_db_connection, release_connection
from utils.sessions import getSessionePerData

def generaDatiEsame():
  """
  Raccoglie i dati dal form, li valida e genera un dizionario con tutti i dati 
  necessari per l'inserimento di un esame secondo la struttura della tabella esami.
  Gestisce multiple date/appelli dal form modulare.
  """
  try:
    # Raccolta dati dal form
    data = request.form
    docente = data.get('docente')
    
    # Gestione insegnamenti multipli
    insegnamenti = request.form.getlist('insegnamento')
    if not insegnamenti and 'insegnamento' in request.form:
      # Se non ci sono insegnamenti multipli ma c'è un singolo insegnamento
      insegnamenti = [request.form['insegnamento']]
      
    if not insegnamenti:
      return {'status': 'error', 'message': 'Nessun insegnamento selezionato'}
    
    # Campi base dell'esame
    descrizione = data.get('descrizione', '')
    prova_parziale = data.get('provaParziale') == 'on'
    mostra_nel_calendario = data.get('mostra_nel_calendario') == 'on'
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    tipo_esame = data.get('tipoEsame')
    verbalizzazione = data.get('verbalizzazione')
    note_appello = data.get('note')
    posti = data.get('posti')
    anno_accademico = data.get('anno_accademico')
    
    # Raccolta delle multiple date/appelli dal form modulare
    date_appelli = []
    
    # Cerca tutti i campi che seguono il pattern dataora_X
    date_keys = [key for key in data.keys() if key.startswith('dataora_')]
    
    for date_key in date_keys:
      # Estrai l'indice dalla chiave (dataora_1 -> 1)
      index = date_key.split('_')[1]
      
      # Raccogli tutti i dati per questa data
      data_appello = data.get(f'dataora_{index}')
      ora_h = data.get(f'ora_h_{index}')
      ora_m = data.get(f'ora_m_{index}')
      aula_appello = data.get(f'aula_{index}')
      durata_appello = data.get(f'durata_{index}', '120')  # Default 120 minuti
      
      # Validazione campi obbligatori per questa data
      if not all([data_appello, ora_h, ora_m, aula_appello]):
        continue  # Salta questa data se non è completa
      
      # Costruisci l'ora completa
      ora_appello = f"{ora_h}:{ora_m}"
      
      # Validazione ora appello
      try:
        ora_int = int(ora_h)
        if ora_int < 8 or ora_int > 18:
          return {'status': 'error', 'message': f'Ora non valida per l\'appello {index}: {ora_appello}. Deve essere tra le 08:00 e le 18:00'}
      except (ValueError, TypeError):
        return {'status': 'error', 'message': f'Formato ora non valido per l\'appello {index}: {ora_appello}'}
      
      # Periodo (mattina/pomeriggio) - 0 per mattina, 1 per pomeriggio
      periodo = 1 if ora_int >= 14 else 0
      
      # Durata appello (default 120 minuti)
      try:
        durata_appello = int(durata_appello)
        if durata_appello < 30 or durata_appello > 480:
          return {'status': 'error', 'message': f'La durata deve essere compresa tra 30 e 480 minuti per l\'appello {index}'}
      except (ValueError, TypeError):
        durata_appello = 120
      
      date_appelli.append({
        'data_appello': data_appello,
        'ora_appello': ora_appello,
        'aula': aula_appello,
        'durata_appello': durata_appello,
        'periodo': periodo
      })
    
    # Se non ci sono date valide, fallback ai campi legacy o al campo combinato
    if not date_appelli:
      # Prova prima con i campi legacy separati
      aula = data.get('aula')
      data_appello = data.get('dataora')
      
      # Prova a recuperare l'ora dai campi separati ora_h e ora_m
      ora_h = data.get('ora_h')
      ora_m = data.get('ora_m')
      ora_appello = None
      
      if ora_h and ora_m:
        ora_appello = f"{ora_h}:{ora_m}"
      else:
        # Fallback al campo ora combinato
        ora_appello = data.get('ora')
      
      # Prova a recuperare la durata dai campi separati durata_h e durata_m
      durata_h = data.get('durata_h', '0')
      durata_m = data.get('durata_m', '0')
      durata_appello = None
      
      try:
        durata_ore = int(durata_h) if durata_h else 0
        durata_minuti = int(durata_m) if durata_m else 0
        durata_appello = (durata_ore * 60) + durata_minuti
      except (ValueError, TypeError):
        # Fallback al campo durata combinato
        durata_appello = data.get('durata')
      
      if not all([aula, data_appello, ora_appello]):
        return {'status': 'error', 'message': 'Dati incompleti: mancano data, ora o aula'}
        
      # Validazione ora appello legacy
      try:
        ora_parts = ora_appello.split(':')
        ora_int = int(ora_parts[0])
        if ora_int < 8 or ora_int > 18:
          return {'status': 'error', 'message': 'L\'ora dell\'appello deve essere compresa tra le 08:00 e le 18:00'}
      except (ValueError, IndexError):
        return {'status': 'error', 'message': 'Formato ora non valido'}
      
      periodo = 1 if ora_int >= 14 else 0
      
      if not durata_appello:
        durata_appello = 120
      else:
        try:
          durata_appello = int(durata_appello)
          if durata_appello < 30 or durata_appello > 480:
            return {'status': 'error', 'message': 'La durata deve essere compresa tra 30 e 480 minuti'}
        except ValueError:
          durata_appello = 120
      
      date_appelli.append({
        'data_appello': data_appello,
        'ora_appello': ora_appello,
        'aula': aula,
        'durata_appello': durata_appello,
        'periodo': periodo
      })
    
    if not date_appelli:
      return {'status': 'error', 'message': 'Nessuna data/appello valida inserita'}
    
    # Validazione campi obbligatori comuni
    if not all([docente, insegnamenti]):
      return {'status': 'error', 'message': 'Dati incompleti: mancano docente o insegnamenti'}
    
    # Tipo appello
    tipo_appello = 'PP' if prova_parziale else 'PF'

    # Tipo iscrizione
    tipo_iscrizione = 'SOC' if tipo_esame == 'SO' else tipo_esame

    # Valori standard per campi opzionali
    definizione_appello = 'STD'
    gestione_prenotazione = 'STD'
    riservato = False
    
    # Gestione tipo_esame
    if not tipo_esame or tipo_esame.strip() == '':
      tipo_esame = None
    
    # Gestione posti
    if posti:
      try:
        posti = int(posti)
      except ValueError:
        posti = None
    else:
      posti = None
    
    # Gestione delle date di iscrizione
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    
    # Restituisci dizionario con tutti i dati raccolti e validati
    return {
      'insegnamenti': insegnamenti,
      'docente': docente,
      'date_appelli': date_appelli,  # Lista di tutte le date/appelli
      'inizio_iscrizione': inizio_iscrizione,
      'fine_iscrizione': fine_iscrizione,
      'tipo_esame': tipo_esame,
      'verbalizzazione': verbalizzazione,
      'descrizione': descrizione,
      'note_appello': note_appello,
      'posti': posti,
      'anno_accademico': anno_accademico,
      'tipo_appello': tipo_appello,
      'definizione_appello': definizione_appello,
      'gestione_prenotazione': gestione_prenotazione,
      'riservato': riservato,
      'tipo_iscrizione': tipo_iscrizione,
      'mostra_nel_calendario': mostra_nel_calendario
    }
  except Exception as e:
    return {'status': 'error', 'message': f'Errore nella raccolta dati: {str(e)}'}

def controllaVincoli(dati_esame):
  """
  Controlla tutti i vincoli per gli esami specificati.
  Riceve il dizionario generato da generaDatiEsame().
  Restituisce una tupla contenente:
  - dizionario con dati comuni aggiornati
  - lista di esami validi
  - lista di esami invalidi
  - messaggio di errore (None se non ci sono errori bloccanti)
  """
  conn = None
  cursor = None
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifico se ci sono errori bloccanti
    if "status" in dati_esame and dati_esame["status"] == "error":
      return dati_esame, [], [], dati_esame["message"]
    
    # Liste per raccogliere risultati
    esami_validi = []
    esami_invalidi = []
    
    # Verifica se è una prova da mostrare nel calendario
    mostra_nel_calendario = dati_esame.get('mostra_nel_calendario', True)
    
    # Verifica se anno_accademico è presente e valido
    anno_accademico = dati_esame.get('anno_accademico')
    if not anno_accademico:
      # Se manca, utilizziamo l'anno accademico corrente
      current_date = datetime.now()
      anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1
      dati_esame['anno_accademico'] = anno_accademico
    
    # Converti anno_accademico in intero se è una stringa
    if isinstance(anno_accademico, str) and anno_accademico.strip():
      try:
        anno_accademico = int(anno_accademico)
        dati_esame['anno_accademico'] = anno_accademico
      except ValueError:
        return dati_esame, [], [], 'Anno accademico non valido'
    
    # Ottieni dati comuni
    insegnamenti = dati_esame['insegnamenti']
    docente = dati_esame['docente']
    inizio_iscrizione = dati_esame['inizio_iscrizione']
    fine_iscrizione = dati_esame['fine_iscrizione']
    date_appelli = dati_esame['date_appelli']
    
    # Per ogni combinazione data-insegnamento, verifica i vincoli
    for data_appello_info in date_appelli:
      data_appello = data_appello_info['data_appello']
      aula = data_appello_info['aula']
      periodo = data_appello_info['periodo']
      
      # Converti in oggetto data
      data_esame = datetime.fromisoformat(data_appello)
      
      # Verifica se il giorno è sabato o domenica
      giorno_settimana = data_esame.weekday()
      if giorno_settimana >= 5:  # 5 = sabato, 6 = domenica
        return dati_esame, [], [], f'Non è possibile inserire esami di sabato o domenica ({data_appello})'
      
      # 1. Verifica conflitti di aula per questa data
      if aula != "Studio docente DMI":
        cursor.execute("""
          SELECT COUNT(*) FROM esami 
          WHERE data_appello = %s AND aula = %s AND periodo = %s
        """, (data_appello, aula, periodo))
        
        if cursor.fetchone()[0] > 0:
          return dati_esame, [], [], f'Aula {aula} già occupata in questo periodo per la data {data_appello}'
      
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
            esami_invalidi.append({
              'codice': insegnamento,
              'titolo': titolo_insegnamento,
              'data_appello': data_appello,
              'errore': "Insegnamento non trovato per l'anno accademico specificato"
            })
            continue
          
          cds_code, anno_acc = cds_info
          
          # Verifica che la data rientri in una sessione d'esame valida
          sessione_info = getSessionePerData(data_esame.strftime('%Y-%m-%d'), cds_code, anno_acc)
          if not sessione_info or not sessione_info[0]:
            esami_invalidi.append({
              'codice': insegnamento,
              'titolo': titolo_insegnamento,
              'data_appello': data_appello,
              'errore': f"La data {data_appello} non rientra in nessuna sessione d'esame valida"
            })
            continue
          
          sessione, data_inizio_sessione = sessione_info
          
          # Converti data_inizio_sessione da stringa a datetime se necessario
          if isinstance(data_inizio_sessione, str):
            data_inizio_sessione = datetime.fromisoformat(data_inizio_sessione)
          
          # Calcola le date di iscrizione se non specificate
          data_inizio_iscrizione = inizio_iscrizione
          data_fine_iscrizione = fine_iscrizione
          
          if not data_inizio_iscrizione:
            data_inizio_iscrizione = (data_inizio_sessione - timedelta(days=20)).strftime("%Y-%m-%d")
          
          if not data_fine_iscrizione:
            data_fine_iscrizione = (data_esame - timedelta(days=1)).strftime("%Y-%m-%d")
          
          # Verifica vincolo dei 14 giorni tra esami dello stesso insegnamento
          data_min = data_esame - timedelta(days=13)
          data_max = data_esame + timedelta(days=13)
          
          # Modifica la query per escludere l'esame corrente se stiamo modificando
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
            esami_invalidi.append({
              'codice': insegnamento,
              'titolo': titolo_insegnamento,
              'data_appello': data_appello,
              'errore': f"Non puoi inserire esami a meno di 14 giorni di distanza. Hai già esami nelle date: {', '.join(date_esami)}"
            })
            continue
          
          # Verifica sovrapposizione con altri esami dello stesso CDS, curriculum, anno e semestre
          cursor.execute("""
            WITH stesso_contesto AS (
              SELECT DISTINCT i2.id, i2.codice, i2.titolo
              FROM insegnamenti_cds ic1
              JOIN insegnamenti i1 ON ic1.insegnamento = i1.id
              JOIN insegnamenti_cds ic2 ON ic1.cds = ic2.cds 
                AND (
                  ic1.curriculum = ic2.curriculum 
                  OR ic1.curriculum = 'CORSO GENERICO'
                  OR ic2.curriculum = 'CORSO GENERICO'
                )
                AND ic1.anno_corso = ic2.anno_corso 
                AND ic1.semestre = ic2.semestre
                AND ic1.anno_accademico = ic2.anno_accademico
              JOIN insegnamenti i2 ON ic2.insegnamento = i2.id
              WHERE i1.codice = %s
                AND ic1.anno_accademico = %s
            )
            SELECT e.data_appello, e.ora_appello, e.durata_appello, 
                   i.codice, i.titolo
            FROM esami e
            JOIN insegnamenti i ON e.insegnamento = i.id
            WHERE i.id IN (SELECT id FROM stesso_contesto)
              AND e.data_appello = %s
              AND e.id != COALESCE(%s, -1)
          """, (insegnamento, anno_acc, data_appello, dati_esame.get('exam_id')))
          
          esami_sovrapposti = cursor.fetchall()
          
          if esami_sovrapposti:
            # Converti l'ora dell'appello corrente in datetime per i calcoli
            ora_parts = data_appello_info['ora_appello'].split(':')
            ora_base = datetime.now().replace(hour=int(ora_parts[0]), 
                                           minute=int(ora_parts[1]), 
                                           second=0, microsecond=0)
            durata = int(data_appello_info['durata_appello'])
            fine_appello = ora_base + timedelta(minutes=durata)
            
            for esame in esami_sovrapposti:
              # Converti l'ora dell'altro esame in datetime per i calcoli
              altro_ora = esame[1]  # ora_appello è già un oggetto time
              altra_ora_base = datetime.now().replace(hour=altro_ora.hour,
                                                   minute=altro_ora.minute,
                                                   second=0, microsecond=0)
              altra_durata = int(esame[2])
              altra_fine = altra_ora_base + timedelta(minutes=altra_durata)
              
              # Verifica sovrapposizione
              if (ora_base <= altra_fine and fine_appello >= altra_ora_base):
                esami_invalidi.append({
                  'codice': insegnamento,
                  'titolo': titolo_insegnamento,
                  'data_appello': data_appello,
                  'errore': f"Sovrapposizione con l'esame di {esame[4]} ({esame[3]}) dello stesso CDS/curriculum/anno/semestre"
                })
                break  # Usciamo dal ciclo alla prima sovrapposizione trovata

          # Se non ci sono state sovrapposizioni per questa combinazione, aggiungi alla lista dei validi
          combinazione_key = f"{insegnamento}_{data_appello}"
          if not any(x.get('combinazione_key') == combinazione_key for x in esami_invalidi):
            esami_validi.append({
              'codice': insegnamento,
              'titolo': titolo_insegnamento,
              'data_appello': data_appello,
              'aula': aula,
              'ora_appello': data_appello_info['ora_appello'],
              'durata_appello': data_appello_info['durata_appello'],
              'periodo': data_appello_info['periodo'],
              'data_inizio_iscrizione': data_inizio_iscrizione,
              'data_fine_iscrizione': data_fine_iscrizione,
              'combinazione_key': combinazione_key
            })
          
        except Exception as e:
          # Gestione errori durante la verifica
          try:
            cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
            titolo_insegnamento = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
          except:
            titolo_insegnamento = insegnamento
            
          esami_invalidi.append({
            'codice': insegnamento,
            'titolo': titolo_insegnamento,
            'data_appello': data_appello,
            'errore': f"Errore nella verifica dell'esame: {str(e)}"
          })
    
    # Aggiorna il dizionario con le date di iscrizione calcolate
    if esami_validi and not dati_esame.get('inizio_iscrizione'):
      dati_esame['inizio_iscrizione'] = esami_validi[0]['data_inizio_iscrizione']
    if esami_validi and not dati_esame.get('fine_iscrizione'):
      dati_esame['fine_iscrizione'] = esami_validi[0]['data_fine_iscrizione']
    
    return dati_esame, esami_validi, esami_invalidi, None
    
  except Exception as e:
    return dati_esame, [], [], f"Errore nella verifica vincoli: {str(e)}"
  finally:
    if cursor:
      cursor.close()
    if conn:
      release_connection(conn)

def inserisciEsami(dati_comuni, esami_da_inserire):
  """
  Inserisce gli esami nel database.
  Riceve:
  - dati_comuni: dizionario con i dati comuni per tutti gli esami
  - esami_da_inserire: lista di dizionari con i dati specifici per ogni esame
  Restituisce una tupla con:
  - lista di esami inseriti (titoli)
  - lista di errori
  """
  conn = None
  cursor = None
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    esami_inseriti = []
    errori = []

    # Assicurati che anno_accademico sia presente e valido
    anno_accademico = dati_comuni.get('anno_accademico')
    if not anno_accademico:
      # Se manca, utilizziamo l'anno accademico corrente
      current_date = datetime.now()
      anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1
      dati_comuni['anno_accademico'] = anno_accademico
    
    # Converti anno_accademico in intero se è una stringa
    if isinstance(dati_comuni['anno_accademico'], str) and dati_comuni['anno_accademico'].strip():
      try:
        dati_comuni['anno_accademico'] = int(dati_comuni['anno_accademico'])
      except ValueError:
        # Se non è convertibile, usa l'anno corrente
        current_date = datetime.now()
        dati_comuni['anno_accademico'] = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    for esame in esami_da_inserire:
      try:
        # Estrai informazioni per l'inserimento
        insegnamento_codice = esame['codice']
        data_appello = esame['data_appello']
        aula = esame['aula']
        ora_appello = esame['ora_appello']
        durata_appello = esame['durata_appello']
        periodo = esame['periodo']
        inizio_iscrizione = esame.get('data_inizio_iscrizione')
        fine_iscrizione = esame.get('data_fine_iscrizione')
        anno_accademico = dati_comuni['anno_accademico']
        
        # Prima ottieni l'ID dell'insegnamento dal codice
        cursor.execute("SELECT id FROM insegnamenti WHERE codice = %s", (insegnamento_codice,))
        result = cursor.fetchone()
        if not result:
          raise Exception(f"Insegnamento con codice {insegnamento_codice} non trovato")
          
        insegnamento_id = result[0]
        
        # Recupera cds e curriculum per questo insegnamento e anno accademico
        cursor.execute("""
          SELECT cds, curriculum 
          FROM insegnamenti_cds 
          WHERE insegnamento = %s AND anno_accademico = %s
          LIMIT 1
        """, (insegnamento_id, anno_accademico))
        
        cds_info = cursor.fetchone()
        if not cds_info:
          raise Exception(f"Non sono state trovate informazioni sul CDS per l'insegnamento {insegnamento_codice} nell'anno accademico {anno_accademico}")
        
        cds, curriculum = cds_info
        
        # Inserisci nel database
        cursor.execute(
          """INSERT INTO esami 
             (docente, insegnamento, aula, data_appello, ora_appello, 
            data_inizio_iscrizione, data_fine_iscrizione, 
            tipo_esame, verbalizzazione, descrizione, note_appello, posti,
            tipo_appello, definizione_appello, gestione_prenotazione, 
            riservato, tipo_iscrizione, periodo, durata_appello,
            cds, anno_accademico, curriculum, mostra_nel_calendario)
             VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          (dati_comuni['docente'], insegnamento_id, aula, 
           data_appello, ora_appello, 
           inizio_iscrizione, fine_iscrizione, 
           dati_comuni['tipo_esame'], dati_comuni['verbalizzazione'],
           dati_comuni['descrizione'], dati_comuni['note_appello'],
           dati_comuni['posti'], dati_comuni['tipo_appello'],
           dati_comuni['definizione_appello'], dati_comuni['gestione_prenotazione'],
           dati_comuni['riservato'], dati_comuni['tipo_iscrizione'],
           periodo, durata_appello,
           cds, anno_accademico, curriculum, dati_comuni['mostra_nel_calendario'])
        )
        esami_inseriti.append(f"{esame.get('titolo', insegnamento_codice)} - {data_appello}")
      except Exception as e:
        # Gestisci il caso in cui 'titolo' non è disponibile
        titolo = esame.get('titolo', esame.get('codice', 'Sconosciuto'))
        data_appello = esame.get('data_appello', 'Data sconosciuta')
        errori.append({
          'codice': esame.get('codice', 'Sconosciuto'),
          'titolo': titolo,
          'data_appello': data_appello,
          'errore': f"Errore nell'inserimento dell'esame: {str(e)}"
        })
    
    # Commit delle modifiche se almeno un esame è stato inserito
    if esami_inseriti:
      conn.commit()
  
    return esami_inseriti, errori
    
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
