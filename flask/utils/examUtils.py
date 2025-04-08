from flask import request, jsonify
from datetime import datetime, timedelta
from db import get_db_connection, release_connection

def generaDatiEsame():
  """
  Raccoglie i dati dal form, li valida e genera un dizionario con tutti i dati 
  necessari per l'inserimento di un esame secondo la struttura della tabella esami.
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
    mostra_nel_calendario = data.get('mostra_nel_nel_calendario') == 'on'
    aula = data.get('aula')
    data_appello = data.get('dataora')
    ora_appello = data.get('ora')
    durata_appello = data.get('durata')
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    tipo_esame = data.get('tipoEsame')
    verbalizzazione = data.get('verbalizzazione')
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
    
    # Tipo appello
    tipo_appello = 'PP' if prova_parziale else 'PF'

    # Tipo iscrizione (Questo campo è strano nel file export. Che confusione)
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
    
    # Gestione delle date di iscrizione
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    
    # Segna se le date sono quelle di default (per eventuale sovrascrittura)
    date_default = {'inizio': False, 'fine': False}
    
    # Se le date non sono specificate, impostiamo i valori predefiniti
    if not inizio_iscrizione and data_appello:
      # Default: 20 giorni prima della data dell'esame
      data_esame = datetime.fromisoformat(data_appello)
      inizio_iscrizione = (data_esame - timedelta(days=30)).strftime("%Y-%m-%d")
      date_default['inizio'] = True
    
    if not fine_iscrizione and data_appello:
      # Default: 1 giorno prima della data dell'esame
      data_esame = datetime.fromisoformat(data_appello)
      fine_iscrizione = (data_esame - timedelta(days=1)).strftime("%Y-%m-%d")
      date_default['fine'] = True
    
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
      'descrizione': descrizione,
      'note_appello': note_appello,
      'posti': posti,
      'anno_accademico': anno_accademico,
      'tipo_appello': tipo_appello,
      'definizione_appello': definizione_appello,
      'gestione_prenotazione': gestione_prenotazione,
      'riservato': riservato,
      'tipo_iscrizione': tipo_iscrizione,
      'date_default': date_default,
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
    
    # Verifica se è una prova parziale e se deve essere mostrato nel calendario
    is_prova_parziale = dati_esame['tipo_appello'] == 'PP'
    mostra_nel_calendario = dati_esame.get('mostra_nel_calendario', True)
    
    # 1. Verifica conflitti di aula
    aula = dati_esame['aula']
    data_appello = dati_esame['data_appello']
    periodo = dati_esame['periodo']
    
    # Aggiungiamo una condizione speciale per lo studio del docente
    if aula != "Studio docente DMI":
      cursor.execute("""
        SELECT COUNT(*) FROM esami 
        WHERE data_appello = %s AND aula = %s AND periodo = %s
      """, (data_appello, aula, periodo))
      
      if cursor.fetchone()[0] > 0:
        return dati_esame, [], [], 'Aula già occupata in questo periodo'
    
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
    
    # 2. Verifica ogni insegnamento
    insegnamenti = dati_esame['insegnamenti']
    docente = dati_esame['docente']
    inizio_iscrizione = dati_esame['inizio_iscrizione']
    fine_iscrizione = dati_esame['fine_iscrizione']
    date_default = dati_esame.get('date_default', {'inizio': False, 'fine': False})
    
    # Converti in oggetto data
    data_esame = datetime.fromisoformat(data_appello)
    
    # Verifica se il giorno è sabato o domenica
    giorno_settimana = data_esame.weekday()
    if giorno_settimana >= 5:  # 5 = sabato, 6 = domenica
      return dati_esame, [], [], 'Non è possibile inserire esami di sabato o domenica'
    
    # Dizionario per memorizzare le informazioni delle sessioni trovate
    periodi_sessione = {}
    
    for insegnamento in insegnamenti:
      try:
        # Ottieni titolo per messaggi di errore
        cursor.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
        titolo_insegnamento = cursor.fetchone()[0] if cursor.rowcount > 0 else insegnamento
        
        # 2.1 Verifica che l'insegnamento esista per l'anno corrente
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
            'errore': "Insegnamento non trovato per l'anno accademico specificato"
          })
          continue
        
        cds_code, anno_acc = cds_info
        
        # 2.2 Verifica che la data rientri in una sessione d'esame valida
        sessione_info = getSessionePerData(data_esame, cds_code, anno_acc, cursor)
        if not sessione_info:
          esami_invalidi.append({
            'codice': insegnamento,
            'titolo': titolo_insegnamento,
            'errore': "La data selezionata non rientra in nessuna sessione d'esame valida"
          })
          continue
        
        sessione, limite_max, data_inizio_sessione = sessione_info
        
        # Se le date sono quelle di default, calcola le migliori date basate sulla sessione
        data_inizio_iscrizione = inizio_iscrizione
        data_fine_iscrizione = fine_iscrizione
        
        # Se la data di inizio iscrizione è quella di default, 
        # la sovrascriviamo con 20 giorni prima dell'inizio sessione
        if date_default['inizio']:
          data_inizio_iscrizione = (data_inizio_sessione - timedelta(days=20)).strftime("%Y-%m-%d")
          # Aggiorniamo anche il valore globale per gli altri esami
          if not periodi_sessione:  # Solo la prima volta
            dati_esame['inizio_iscrizione'] = data_inizio_iscrizione
        
        # 2.4 Verifica il limite di esami nella sessione (solo se il flag è attivo)
        if mostra_nel_calendario:
          # Salta il controllo del numero massimo se stiamo modificando un esame esistente
          exam_id_to_exclude = dati_esame.get('exam_id')
          if not exam_id_to_exclude:  # Solo se non stiamo modificando un esame esistente
            cursor.execute("""
              SELECT COUNT(*) 
              FROM esami e
              JOIN insegnamenti i ON e.insegnamento = i.id
              JOIN periodi_esame pe ON pe.cds = %s 
                  AND pe.anno_accademico = %s
                  AND pe.tipo_periodo = %s
              WHERE e.docente = %s 
                AND i.codice = %s
                AND e.data_appello BETWEEN pe.inizio AND pe.fine
            """, (cds_code, anno_acc, sessione, docente, insegnamento))
            
            if cursor.fetchone()[0] >= limite_max:
              esami_invalidi.append({
                'codice': insegnamento,
                'titolo': titolo_insegnamento,
                'errore': f"Limite di {limite_max} esami nella sessione {sessione} raggiunto"
              })
              continue
        
        # 2.5 Verifica vincolo dei 14 giorni tra esami dello stesso insegnamento (solo se il flag è attivo)
          # Metto 13 giorni perché il vincolo dice "non inferiore a due settimane"
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
            """, (insegnamento, data_min, data_max, exam_id_to_exclude))
          else:
            cursor.execute("""
              SELECT data_appello FROM esami e
              JOIN insegnamenti i ON e.insegnamento = i.id
              WHERE i.codice = %s AND data_appello BETWEEN %s AND %s
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
        
        # 2.6 Verifica sovrapposizione con altri esami dello stesso CDS, curriculum, anno e semestre
        # La sovrapposizione vale anche se uno dei due esami ha curriculum 'CORSO GENERICO'
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
          ora_parts = dati_esame['ora_appello'].split(':')
          ora_base = datetime.now().replace(hour=int(ora_parts[0]), 
                                         minute=int(ora_parts[1]), 
                                         second=0, microsecond=0)
          durata = int(dati_esame['durata_appello'])
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
                'errore': f"Sovrapposizione con l'esame di {esame[4]} ({esame[3]}) dello stesso CDS/curriculum/anno/semestre"
              })
              break  # Usciamo dal ciclo alla prima sovrapposizione trovata

        # Se non ci sono state sovrapposizioni, aggiungi alla lista dei validi
        if insegnamento not in [x['codice'] for x in esami_invalidi]:
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
    
    # Validazione durata
    try:
      durata = int(dati_esame.get('durata_appello', 0))
      if durata < 30 or durata > 480:  # min 30 minuti, max 8 ore (480 minuti)
        esami_invalidi.append({
          'codice': 'DURATA',
          'titolo': 'Durata esame',
          'errore': 'La durata deve essere compresa tra 30 minuti e 8 ore'
        })
    except (ValueError, TypeError):
      esami_invalidi.append({
        'codice': 'DURATA',
        'titolo': 'Durata esame',
        'errore': 'La durata deve essere un numero valido'
      })
    
    # Aggiorna il dizionario con le date di iscrizione
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
          (dati_comuni['docente'], insegnamento_id, dati_comuni['aula'], 
           dati_comuni['data_appello'], dati_comuni['ora_appello'], 
           inizio_iscrizione, fine_iscrizione, 
           dati_comuni['tipo_esame'], dati_comuni['verbalizzazione'],
           dati_comuni['descrizione'], dati_comuni['note_appello'],
           dati_comuni['posti'], dati_comuni['tipo_appello'],
           dati_comuni['definizione_appello'], dati_comuni['gestione_prenotazione'],
           dati_comuni['riservato'], dati_comuni['tipo_iscrizione'],
           dati_comuni['periodo'], dati_comuni['durata_appello'],
           cds, anno_accademico, curriculum, dati_comuni['mostra_nel_calendario'])
        )
        esami_inseriti.append(esame.get('titolo', insegnamento_codice))
      except Exception as e:
        # Gestisci il caso in cui 'titolo' non è disponibile
        titolo = esame.get('titolo', esame.get('codice', 'Sconosciuto'))
        errori.append({
          'codice': esame.get('codice', 'Sconosciuto'),
          'titolo': titolo,
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
  # Questa funzione rimane invariata
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
      release_connection(conn)
    if 'cursor' in locals() and cursor and close_connection:
      cursor.close()

def costruisciRispostaParziale(esami_inseriti, errori):
  # Questa funzione rimane invariata
  return {
    'status': 'partial', 
    'message': 'Alcuni esami sono stati inseriti con successo', 
    'inserted': esami_inseriti, 
    'errors': errori
  }
