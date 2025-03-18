from datetime import datetime, timedelta
from db import get_db_connection, release_connection

def get_session_for_date(date, cds_code, anno_acc):
    """
    Determina a quale sessione d'esame appartiene una data per un determinato corso di studi.
    Restituisce (tipo_periodo, max_esami, data_inizio_sessione)
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Cerca nella tabella periodi_esame un periodo che contenga la data
        cursor.execute("""
            SELECT tipo_periodo, max_esami, inizio
            FROM periodi_esame
            WHERE cds = %s 
              AND anno_accademico = %s
              AND %s BETWEEN inizio AND fine
        """, (cds_code, anno_acc, date))
        
        result = cursor.fetchone()
        
        if result:
            return result
        else:
            return None
            
    except Exception as e:
        print(f"Errore nel recupero della sessione: {str(e)}")
        return None
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def get_all_sessions_for_cds(cds_code, anno_acc):
    """
    Ottiene tutti i periodi di esame per un corso di studio e anno accademico.
    Restituisce una lista di dizionari con i dettagli di ogni sessione.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Recupera tutti i periodi per il CdS
        cursor.execute("""
            SELECT tipo_periodo, inizio, fine, max_esami 
            FROM periodi_esame
            WHERE cds = %s AND anno_accademico = %s
            ORDER BY inizio
        """, (cds_code, anno_acc))
        
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
        
        # Verifica se aggiungere la sessione anticipata (sessione invernale dell'anno precedente)
        if not any(s['tipo'] == 'anticipata' for s in sessions):
            cursor.execute("""
                SELECT inizio, fine, max_esami
                FROM periodi_esame
                WHERE cds = %s AND anno_accademico = %s AND tipo_periodo = 'INVERNALE'
            """, (cds_code, anno_acc - 1))
            
            anticipata = cursor.fetchone()
            if anticipata:
                inizio, fine, max_esami = anticipata
                sessions.append({
                    'tipo': 'anticipata',
                    'inizio': inizio,
                    'fine': fine,
                    'max_esami': max_esami,
                    'nome': format_session_name('anticipata')
                })
        
        return sessions
            
    except Exception as e:
        print(f"Errore nel recupero delle sessioni: {str(e)}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def format_session_name(tipo_periodo):
    """
    Formatta il nome della sessione per la visualizzazione.
    """
    mapping = {
        'anticipata': 'Sessione Anticipata',
        'estiva': 'Sessione Estiva', 
        'autunnale': 'Sessione Autunnale', 
        'invernale': 'Sessione Invernale',
        'pausa_autunnale': 'Pausa Didattica (1° sem)',
        'pausa_primaverile': 'Pausa Didattica (2° sem)'
    }
    
    return mapping.get(tipo_periodo.lower(), tipo_periodo.capitalize())

def get_session_intersection_for_docente(docente, anno_acc):
    """
    Ottiene l'intersezione dei periodi di esame per tutti i CdS di un docente.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Recupera tutti i CdS associati al docente
        cursor.execute("""
            SELECT DISTINCT c.codice
            FROM cds c
            JOIN insegnamenti_cds ic ON c.codice = ic.cds AND c.anno_accademico = ic.anno_accademico
            JOIN insegnamento_docente id ON ic.insegnamento = id.insegnamento AND ic.anno_accademico = id.annoaccademico
            WHERE id.docente = %s AND ic.anno_accademico = %s
        """, (docente, anno_acc))
        
        cds_list = [row[0] for row in cursor.fetchall()]
        
        if not cds_list:
            return []
        
        # Recupera i periodi d'esame di tutti i CdS in una singola query
        # Inclusi sia i periodi normali che la sessione anticipata
        result = {}
        
        # Prepara la query per recuperare tutti i periodi normali
        query = """
            SELECT cds, tipo_periodo, inizio, fine, max_esami
            FROM periodi_esame
            WHERE cds IN ({}) AND anno_accademico = %s
            
            UNION ALL
            
            SELECT cds, 'ANTICIPATA' as tipo_periodo, inizio, fine, max_esami
            FROM periodi_esame
            WHERE cds IN ({}) AND anno_accademico = %s AND tipo_periodo = 'INVERNALE'
        """.format(','.join(['%s'] * len(cds_list)), ','.join(['%s'] * len(cds_list)))
        
        # Prepara i parametri: prima per la query normale, poi per la query della sessione anticipata
        params = cds_list + [anno_acc] + cds_list + [anno_acc - 1]
        
        cursor.execute(query, params)
        
        # Elabora i risultati e calcola le intersezioni
        for cds, tipo_periodo, inizio, fine, max_esami in cursor.fetchall():
            if tipo_periodo not in result:
                result[tipo_periodo] = {
                    'inizio': inizio,
                    'fine': fine,
                    'max_esami': max_esami,
                    'cds_count': 1,
                    'cds_con_periodo': set([cds])  # Teniamo traccia dei CdS che hanno questo periodo
                }
            else:
                # Aggiorna il conteggio solo se questo CdS non è già stato contato
                if cds not in result[tipo_periodo]['cds_con_periodo']:
                    result[tipo_periodo]['cds_count'] += 1
                    result[tipo_periodo]['cds_con_periodo'].add(cds)
                
                # Calcola l'intersezione delle date
                result[tipo_periodo]['inizio'] = max(result[tipo_periodo]['inizio'], inizio)
                result[tipo_periodo]['fine'] = min(result[tipo_periodo]['fine'], fine)
                result[tipo_periodo]['max_esami'] = min(result[tipo_periodo]['max_esami'], max_esami)
        
        # Filtra solo i periodi con date valide e comuni a tutti i CdS
        sessions = []
        for tipo_periodo, dati in result.items():
            # Verifica che le date siano valide e che il periodo sia comune a tutti i CdS
            if dati['inizio'] <= dati['fine'] and dati['cds_count'] == len(cds_list):
                sessions.append({
                    'tipo': tipo_periodo.lower(),
                    'inizio': dati['inizio'],
                    'fine': dati['fine'],
                    'max_esami': dati['max_esami'],
                    'nome': format_session_name(tipo_periodo.lower())
                })
        
        return sessions
            
    except Exception as e:
        print(f"Errore nel calcolo dell'intersezione delle sessioni: {str(e)}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)