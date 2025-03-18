from flask import request, jsonify
from datetime import datetime, timedelta
from db import get_db_connection, release_connection

def raccogliDatiForm():
  # Raccolta e validazione dei dati form
  # Ritorna un dizionario con i dati raccolti o un dizionario con chiave 'error' in caso di errore  
  try:
    # Raccolta dati dal form
    data = request.form
    docente = data.get('docente')
    
    # Gestione insegnamenti multipli
    insegnamenti = request.form.getlist('insegnamento')
    if not insegnamenti:
      return {'status': 'error', 'message': 'Nessun insegnamento selezionato'}
    
    # Campi base dell'esame
    aula = data.get('aula')
    data_appello = data.get('dataora')
    ora_appello = data.get('ora')
    durata_appello = data.get('durata')
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    tipo_esame = data.get('tipoEsame')
    verbalizzazione = data.get('verbalizzazione', 'FIRMA DIGITALE')
    note_appello = data.get('note')
    posti = data.get('posti')
    anno_accademico = data.get('anno_accademico')
    
    # Validazione campi obbligatori
    if not all([docente, aula, data_appello, ora_appello]):
      return {'status': 'error', 'message': 'Dati incompleti'}
      
    # Validazione ora appello
    try:
      ora_parts = ora_appello.split(':')
      ora_int = int(ora_parts[0])
      if ora_int < 8 or ora_int > 23:
        return {'status': 'error', 'message': 'L\'ora dell\'appello deve essere compresa tra le 08:00 e le 23:00'}
    except (ValueError, IndexError):
      return {'status': 'error', 'message': 'Formato ora non valido'}
    
    # Periodo (mattina/pomeriggio)
    periodo = 1 if ora_int > 13 else 0
    
    # Valori standard per campi opzionali
    tipo_appello = 'PF'
    definizione_appello = 'STD'
    gestione_prenotazione = 'STD'
    riservato = False
    tipo_iscrizione = 'STD'
    
    # Gestione tipo_esame (se vuoto, impostiamo NULL)
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
    
    # Durata appello (default 120 minuti)
    if not durata_appello:
      durata_appello = 120
    else:
      try:
        durata_appello = int(durata_appello)
        if durata_appello < 30 or durata_appello > 480:
          return {'status': 'error', 'message': 'La durata dell\'esame deve essere tra 30 e 480 minuti'}
      except ValueError:
        durata_appello = 120
    
    # Restituisci dizionario con tutti i dati raccolti e validati
    return {
      'insegnamenti': insegnamenti,
      'docente': docente,
      'aula': aula,
      'data_appello': data_appello,
      'ora_appello': ora_appello,
      'durata_appello': durata_appello,
      'inizio_iscrizione': inizio_iscrizione,
      'fine_iscrizione': fine_iscrizione,
      'periodo': periodo,
      'tipo_esame': tipo_esame,
      'verbalizzazione': verbalizzazione,
      'note_appello': note_appello,
      'posti': posti,
      'anno_accademico': anno_accademico,
      'tipo_appello': tipo_appello,
      'definizione_appello': definizione_appello,
      'gestione_prenotazione': gestione_prenotazione,
      'riservato': riservato,
      'tipo_iscrizione': tipo_iscrizione
    }
  except Exception as e:
    return {'status': 'error', 'message': f'Errore nella raccolta dati: {str(e)}'}

def verificaConflittiAula(dati_comuni):
  # Verifica se ci sono conflitti per l'aula selezionata nella data e periodo specificati
  # Come parametro, riceve il dizionario con i dati comuni dell'esame
  # Ritorna un dizionario con chiave 'status' e 'message' in caso di conflitto, None altrimenti    
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Estrai dati necessari dal dizionario
    aula = dati_comuni['aula']
    data_appello = dati_comuni['data_appello']
    periodo = dati_comuni['periodo']
    
    # Verifica conflitti aula
    cursor.execute("""
      SELECT COUNT(*) FROM esami 
      WHERE data_appello = %s AND aula = %s AND periodo = %s
    """, (data_appello, aula, periodo))
    
    if cursor.fetchone()[0] > 0:
      # Conflitto trovato
      return {
        'status': 'error', 
        'message': 'Aula già occupata in questo periodo'
      }
    
    # Nessun conflitto
    return None
  except Exception as e:
    return {'status': 'error', 'message': f'Errore nella verifica conflitti aula: {str(e)}'}
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

def verificaInsegnamenti(dati_comuni):
  # Controlla se ogni insegnamento specificato è valido per l'inserimento
  # Ritorna due liste di dizionari: esami_validi e esami_invalidi
  # Ogni dizionario contiene il codice dell'insegnamento, il titolo e un eventuale errore
  conn = None
  cursor = None
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Liste per raccogliere risultati
    esami_validi = []
    esami_invalidi = []
    
    # Estrai dati necessari
    insegnamenti = dati_comuni['insegnamenti']
    docente = dati_comuni['docente']
    data_appello = dati_comuni['data_appello']
    anno_accademico = dati_comuni['anno_accademico']
    inizio_iscrizione = dati_comuni['inizio_iscrizione']
    fine_iscrizione = dati_comuni['fine_iscrizione']
    
    # Converti in oggetto data
    data_esame = datetime.fromisoformat(data_appello)
    
    # Verifica ogni insegnamento
    for insegnamento in insegnamenti:
      try:
        # Ottieni titolo per messaggi di errore
        cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
        titolo_insegnamento = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
        
        # 1. Verifica che l'insegnamento esista per l'anno corrente
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
            'errore': "Insegnamento non trovato per l'anno accademico specificato"
          })
          continue
        
        cds_code, anno_acc = cds_info
        
        # 2. Verifica che la data rientri in una sessione d'esame valida
        sessione_info = getSessionePerData(data_esame, cds_code, anno_acc, cursor)
        if not sessione_info:
          esami_invalidi.append({
            'codice': insegnamento,
            'titolo': titolo_insegnamento,
            'errore': "La data selezionata non rientra in nessuna sessione d'esame valida"
          })
          continue
        
        sessione, limite_max, data_inizio_sessione = sessione_info
        
        # 3. Imposta date iscrizione con valori predefiniti se non specificate
        data_inizio_iscrizione = inizio_iscrizione if inizio_iscrizione else (data_inizio_sessione - timedelta(days=20)).strftime("%Y-%m-%d")
        data_fine_iscrizione = fine_iscrizione if fine_iscrizione else (data_esame - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # 4. Verifica il limite di esami nella sessione
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
        
        # 5. Verifica vincolo dei 14 giorni tra esami dello stesso insegnamento
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
        
        # Insegnamento valido, aggiungilo alla lista
        esami_validi.append({
          'codice': insegnamento,
          'titolo': titolo_insegnamento,
          'data_inizio_iscrizione': data_inizio_iscrizione,
          'data_fine_iscrizione': data_fine_iscrizione
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
          'errore': f"Errore nella verifica dell'esame: {str(e)}"
        })
        
    return esami_validi, esami_invalidi
    
  except Exception as e:
    raise e
  finally:
    if cursor:
      cursor.close()
    if conn:
      release_connection(conn)

def inserisciEsami(dati_comuni, esami_validi):
  # Inserisce gli esami validati nel database
  # Ritorna una tupla con due liste: esami_inseriti e errori
  # Ogni lista contiene un dizionario per ogni esame con i
  # campi 'codice', 'titolo' e 'errore' in caso di fallimento
  conn = None
  cursor = None
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    esami_inseriti = []
    errori = []
    
    for esame in esami_validi:
      try:
        # Estrai informazioni per l'inserimento
        insegnamento = esame['codice']
        inizio_iscrizione = esame.get('data_inizio_iscrizione')
        fine_iscrizione = esame.get('data_fine_iscrizione')
        
        # Inserisci nel database
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

def getSessionePerData(data_esame, cds_code, anno_acc, cursor=None):
  # Determina la sessione in cui ricade una data per un certo corso di studi
  # Ritorna una tupla con tre valori: sessione, limite_max, data_inizio_sessione o None se non trovata
  close_connection = False
  conn = None
  
  try:
    if not cursor:
      close_connection = True
      conn = get_db_connection()
      cursor = conn.cursor()
    
    # Trova la sessione in cui ricade la data
    data_str = data_esame.strftime('%Y-%m-%d')
    cursor.execute("""
      SELECT tipo_periodo, max_esami, inizio
      FROM periodi_esame
      WHERE cds = %s
        AND anno_accademico = %s
        AND %s BETWEEN inizio AND fine
    """, (cds_code, anno_acc, data_str))
    
    result = cursor.fetchone()
    
    if result:
      sessione, limite_max, data_inizio_sessione = result
      return sessione, limite_max, data_inizio_sessione
      
    return None
    
  except Exception as e:
    return None
  finally:
    if close_connection and 'conn' in locals() and conn:
      if 'cursor' in locals() and cursor:
        cursor.close()
      release_connection(conn)

def costruisciRispostaParziale(esami_inseriti, errori):
  # Costruisce una risposta per inserimento parziale con successi ed errori
  # Ritorna un dizionario con stato e messaggi per l'interfaccia
  return {
    'status': 'partial', 
    'message': 'Alcuni esami sono stati inseriti con successo', 
    'inserted': esami_inseriti, 
    'errors': errori
  }
