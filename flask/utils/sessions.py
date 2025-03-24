from datetime import datetime, timedelta
from db import get_db_connection, release_connection

def ottieni_sessioni_da_cds(cds_code, year):
  # Ritorna i periodi di esame per un CdS nel periodo indicato: anno corrente e anno successivo fino ad aprile.
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Recupera tutti i periodi del CdS che iniziano nell'anno corrente o nell'anno successivo fino ad aprile
    cursor.execute("""
      SELECT tipo_periodo, inizio, fine, max_esami 
      FROM periodi_esame
      WHERE cds = %s 
      AND (
        (EXTRACT(YEAR FROM inizio) = %s) OR
        (EXTRACT(YEAR FROM inizio) = %s AND EXTRACT(MONTH FROM inizio) <= 4)
      )
      ORDER BY inizio
    """, (cds_code, year+1, year+2))
    
    sessions = []
    for row in cursor.fetchall():
      tipo_periodo, inizio, fine, max_esami = row
      sessions.append({
        'tipo': tipo_periodo.lower(),
        'inizio': inizio,
        'fine': fine,
        'max_esami': max_esami,
        'nome': format_session_name(tipo_periodo.lower())
      })
    
    return sessions
      
  except Exception as e:
    print(f"Errore nel recupero delle sessioni per periodo: {str(e)}")
    return []
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

def ottieni_intersezione_sessioni_docente(docente, year):
  # Ritorna i periodi di esame comuni a tutti i CdS associati al docente
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Recupera tutti i CdS associati al docente
    cursor.execute("""
      SELECT DISTINCT ic.cds
      FROM insegnamento_docente id
      JOIN insegnamenti_cds ic ON id.insegnamento = ic.insegnamento
      WHERE id.docente = %s
      AND id.annoaccademico = %s
    """, (docente, year))
    
    cds_list = [row[0] for row in cursor.fetchall()]
    
    if not cds_list:
      return []
    
    # Recupera tutte le sessioni di tutti i CdS
    all_sessions = []
    
    for cds_code in cds_list:
      cursor.execute("""
        SELECT tipo_periodo, inizio, fine, max_esami 
        FROM periodi_esame
        WHERE cds = %s 
        AND (
          (EXTRACT(YEAR FROM inizio) = %s) OR
          (EXTRACT(YEAR FROM inizio) = %s AND EXTRACT(MONTH FROM inizio) <= 4)
        )
        ORDER BY inizio
      """, (cds_code, year+1, year+2))
      
      cds_sessions = []
      for row in cursor.fetchall():
        tipo_periodo, inizio, fine, max_esami = row
        cds_sessions.append({
          'cds': cds_code,
          'tipo': tipo_periodo,
          'inizio': inizio,
          'fine': fine,
          'max_esami': max_esami
        })
      
      all_sessions.append(cds_sessions)
    
    # Se non ci sono sessioni per qualche CdS, non possiamo trovare intersezioni
    if any(len(sessions) == 0 for sessions in all_sessions):
      return []
    
    # Trova le possibili intersezioni di date tra tutti i CdS
    # Confrontiamo ogni sessione del primo CdS con ogni sessione degli altri CdS
    result = []
    
    for session1 in all_sessions[0]:
      # Per ogni sessione del primo CdS, controlla se c'è un'intersezione con tutti gli altri CdS
      intersection = {
        'tipo': session1['tipo'],
        'inizio': session1['inizio'],
        'fine': session1['fine'],
        'max_esami': session1['max_esami'],
        'shared_with_all': True
      }
      
      # Controlla l'intersezione con ogni altro CdS
      for cds_sessions in all_sessions[1:]:
        found_intersection = False
        
        for session2 in cds_sessions:
          # Verifica solo se sono dello stesso tipo
          if session2['tipo'] == session1['tipo']:
            # Calcola l'intersezione
            intersection_start = max(intersection['inizio'], session2['inizio'])
            intersection_end = min(intersection['fine'], session2['fine'])
            
            # Verifica se l'intersezione è valida
            if intersection_start <= intersection_end:
              # Aggiorna l'intersezione
              intersection['inizio'] = intersection_start
              intersection['fine'] = intersection_end
              intersection['max_esami'] = min(intersection['max_esami'], session2['max_esami'])
              found_intersection = True
              break
        
        # Se non è stata trovata intersezione con questo CdS, questa sessione non è comune a tutti
        if not found_intersection:
          intersection['shared_with_all'] = False
          break
      
      # Se la sessione è condivisa con tutti i CdS e l'intersezione è valida, aggiungila ai risultati
      if intersection['shared_with_all'] and intersection['inizio'] <= intersection['fine']:
        result.append({
          'tipo': intersection['tipo'].lower(),
          'inizio': intersection['inizio'],
          'fine': intersection['fine'],
          'max_esami': intersection['max_esami'],
          'nome': format_session_name(intersection['tipo'].lower())
        })
    
    return result
      
  except Exception as e:
    print(f"Errore nel calcolo dell'intersezione delle sessioni per periodo: {str(e)}")
    return []
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

def format_session_name(tipo_periodo):
  # Formatta il nome della sessione per la visualizzazione.
  mapping = {
    'anticipata': 'Sessione Anticipata',
    'estiva': 'Sessione Estiva', 
    'autunnale': 'Sessione Autunnale', 
    'invernale': 'Sessione Invernale',
    'pausa_autunnale': 'Pausa Didattica (1° sem)',
    'pausa_primaverile': 'Pausa Didattica (2° sem)'
  }
  
  return mapping.get(tipo_periodo.lower(), tipo_periodo.capitalize())

def rimuovi_sessioni_duplicate(sessions):
    """
    Rimuove le sessioni duplicate in base alla data di inizio e fine.
    Se due sessioni hanno le stesse date, mantiene solo quella con priorità più alta.
    Ad esempio, tra una sessione 'invernale' e una 'anticipata' con le stesse date,
    mantiene solo 'anticipata'.
    """
    if not sessions:
        return []
    
    # Ordine di priorità delle sessioni (ordine decrescente)
    priorita_sessioni = {
        'anticipata': 6,
        'estiva': 5,
        'autunnale': 4, 
        'invernale': 3,
        'pausa_primaverile': 2,
        'pausa_autunnale': 1
    }
    
    # Dizionario per tenere traccia delle sessioni univoche
    # Usiamo come chiave una tupla (inizio, fine) delle date
    sessioni_uniche = {}
    
    for session in sessions:
        key = (session['inizio'].isoformat(), session['fine'].isoformat())
        
        # Se la chiave esiste già, controlliamo quale sessione ha la priorità più alta
        if key in sessioni_uniche:
            current_priority = priorita_sessioni.get(sessioni_uniche[key]['tipo'], 0)
            new_priority = priorita_sessioni.get(session['tipo'], 0)
            
            # Sostituisci solo se la nuova sessione ha priorità più alta
            if new_priority > current_priority:
                sessioni_uniche[key] = session
        else:
            # Se la chiave non esiste, aggiungi la sessione
            sessioni_uniche[key] = session
    
    # Converti il dizionario in una lista di sessioni
    return list(sessioni_uniche.values())

def ottieni_tutte_sessioni(anno_accademico):
    """
    Ottiene tutte le sessioni d'esame per tutti i CdS per un dato anno accademico
    """
    from db import get_db_connection, release_connection
    from datetime import datetime, timedelta
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ottieni tutti i periodi d'esame per tutti i CdS
        cursor.execute("""
            SELECT pe.cds, pe.tipo_periodo, pe.inizio, pe.fine
            FROM periodi_esame pe
            JOIN cds c ON pe.cds = c.codice AND pe.anno_accademico = c.anno_accademico
            WHERE pe.anno_accademico = %s
            ORDER BY pe.inizio
        """, (anno_accademico,))
        
        sessioni = []
        for row in cursor.fetchall():
            codice_cds, tipo_periodo, inizio, fine = row
            
            # Formattazione del nome del periodo
            nome_periodo = tipo_periodo.capitalize()
            
            sessioni.append({
                'cds': codice_cds,
                'tipo': tipo_periodo,
                'nome': nome_periodo,
                'inizio': inizio,
                'fine': fine
            })
        
        return sessioni
    except Exception as e:
        print(f"Errore nell'ottenere tutte le sessioni: {e}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)