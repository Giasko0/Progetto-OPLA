from datetime import datetime, timedelta
from db import get_db_connection, release_connection

def ottieni_sessioni_da_cds(cds_code, year):
    """Ritorna i periodi di esame per un CdS nell'anno accademico specificato"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT tipo_sessione, inizio, fine 
            FROM sessioni
            WHERE cds = %s AND anno_accademico = %s
            ORDER BY inizio
        """, (cds_code, year))
        
        sessions = []
        for tipo_sessione, inizio, fine in cursor.fetchall():
            sessions.append({
                'tipo': tipo_sessione.lower(),
                'inizio': inizio,
                'fine': fine,
                'nome': format_session_name(tipo_sessione.lower())
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

def ottieni_intersezione_sessioni_docente(docente, year, cds_list=None):
    """Ritorna l'intersezione dei periodi di esame tra i CdS del docente"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if cds_list is None:
            cursor.execute("""
                SELECT DISTINCT ic.cds
                FROM insegnamento_docente id
                JOIN insegnamenti_cds ic ON id.insegnamento = ic.insegnamento
                WHERE id.docente = %s AND id.annoaccademico = %s
            """, (docente, year))
            cds_list = [row[0] for row in cursor.fetchall()]
        
        if not cds_list:
            return []
        
        # Ottieni tutte le sessioni per ciascun CdS
        all_sessions = {}
        for cds_code in cds_list:
            cursor.execute("""
                SELECT tipo_sessione, inizio, fine 
                FROM sessioni
                WHERE cds = %s AND anno_accademico = %s 
                  AND curriculum_codice IN (
                    SELECT DISTINCT curriculum_codice FROM insegnamenti_cds ic
                    JOIN insegnamento_docente id ON ic.insegnamento = id.insegnamento
                    WHERE id.docente = %s AND ic.cds = %s AND ic.anno_accademico = %s
                  )
                ORDER BY inizio
            """, (cds_code, year, docente, cds_code, year))
            
            all_sessions[cds_code] = {
                row[0]: {'inizio': row[1], 'fine': row[2]} 
                for row in cursor.fetchall()
            }
        
        # Calcola l'intersezione per tipo di sessione
        if not all_sessions:
            return []
        
        first_cds = list(all_sessions.keys())[0]
        result = []
        
        for tipo_sessione, dates in all_sessions[first_cds].items():
            intersection_start = dates['inizio']
            intersection_end = dates['fine']
            valid_intersection = True
            
            # Verifica intersezione con tutti gli altri CdS
            for cds_code in list(all_sessions.keys())[1:]:
                if tipo_sessione not in all_sessions[cds_code]:
                    valid_intersection = False
                    break
                
                other_dates = all_sessions[cds_code][tipo_sessione]
                intersection_start = max(intersection_start, other_dates['inizio'])
                intersection_end = min(intersection_end, other_dates['fine'])
                
                if intersection_start > intersection_end:
                    valid_intersection = False
                    break
            
            if valid_intersection:
                result.append({
                    'tipo': tipo_sessione.lower(),
                    'inizio': intersection_start,
                    'fine': intersection_end,
                    'nome': format_session_name(tipo_sessione.lower())
                })
        
        return sorted(result, key=lambda x: x['inizio'])
        
    except Exception as e:
        print(f"Errore nel calcolo dell'intersezione delle sessioni: {str(e)}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def ottieni_sessioni_da_insegnamenti(insegnamenti_list, year):
    """Ottiene le sessioni associate agli insegnamenti specificati"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if not insegnamenti_list:
            return []
        
        placeholders = ', '.join(['%s'] * len(insegnamenti_list))
        cursor.execute(f"""
            SELECT DISTINCT ic.cds 
            FROM insegnamenti_cds ic
            JOIN insegnamenti i ON ic.insegnamento = i.id
            WHERE i.codice IN ({placeholders}) AND ic.anno_accademico = %s
        """, insegnamenti_list + [year])
        
        cds_list = [row[0] for row in cursor.fetchall()]
        
        if not cds_list:
            return []
        elif len(cds_list) == 1:
            return ottieni_sessioni_da_cds(cds_list[0], year)
        else:
            return ottieni_intersezione_sessioni_docente(None, year, cds_list)
    
    except Exception as e:
        print(f"Errore nel recupero delle sessioni per insegnamenti: {e}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def ottieni_tutte_sessioni(anno_accademico):
    """Ottiene tutte le sessioni d'esame per tutti i CdS"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT s.cds, s.tipo_sessione, s.inizio, s.fine
            FROM sessioni s
            WHERE s.anno_accademico = %s
            ORDER BY s.inizio
        """, (anno_accademico,))
        
        sessions = []
        for cds, tipo_sessione, inizio, fine in cursor.fetchall():
            sessions.append({
                'cds': cds,
                'tipo': tipo_sessione.lower(),
                'nome': format_session_name(tipo_sessione),
                'inizio': inizio,
                'fine': fine
            })
        
        return sessions
    except Exception as e:
        print(f"Errore nell'ottenere tutte le sessioni: {e}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def format_session_name(tipo_periodo):
    """Formatta il nome della sessione per la visualizzazione"""
    mapping = {
        'anticipata': 'Sessione Anticipata',
        'estiva': 'Sessione Estiva', 
        'autunnale': 'Sessione Autunnale', 
        'invernale': 'Sessione Invernale'
    }
    return mapping.get(tipo_periodo.lower(), tipo_periodo.capitalize())

def getSessionePerData(data, cds_codice, anno_accademico):
    """Restituisce il tipo di sessione per una data specifica e CdS"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT tipo_sessione, inizio
            FROM sessioni 
            WHERE cds = %s AND anno_accademico = %s AND %s BETWEEN inizio AND fine
        """, (cds_codice, anno_accademico, data))
        
        result = cursor.fetchone()
        return result if result else (None, None)
        
    except Exception as e:
        print(f"Errore in getSessionePerData: {str(e)}")
        return (None, None)
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)