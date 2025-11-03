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
        
        # Se non c'è intersezione, restituisci l'unione delle sessioni
        if not result:
            print(f"Nessuna intersezione trovata per {list(all_sessions.keys())}, utilizzo unione delle sessioni")
            return ottieni_unione_sessioni_cds(list(all_sessions.keys()), year)
        
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
            WHERE i.id IN ({placeholders}) AND ic.anno_accademico = %s
        """, insegnamenti_list + [year])
        
        cds_list = [row[0] for row in cursor.fetchall()]
        
        if not cds_list:
            return []
        elif len(cds_list) == 1:
            return ottieni_sessioni_da_cds(cds_list[0], year)
        else:
            # Prima prova l'intersezione, se non funziona usa l'unione
            intersect_result = ottieni_intersezione_sessioni_docente(None, year, cds_list)
            if intersect_result:
                return intersect_result
            else:
                # Se non c'è intersezione, restituisci l'unione
                return ottieni_unione_sessioni_cds(cds_list, year)
    
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

def ottieni_vacanze(anno_accademico):
    """Ottiene tutte le vacanze per l'anno accademico specificato"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT inizio, fine, descrizione
            FROM vacanze
            WHERE anno_accademico = %s
            ORDER BY inizio
        """, (anno_accademico,))
        
        vacanze = []
        for inizio, fine, descrizione in cursor.fetchall():
            vacanze.append({
                'inizio': inizio,
                'fine': fine,
                'descrizione': descrizione
            })
        
        return vacanze
        
    except Exception as e:
        print(f"Errore nel recupero delle vacanze: {str(e)}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def escludi_vacanze_da_sessioni(sessions, vacanze):
    """Esclude i periodi di vacanza dalle sessioni, dividendole se necessario"""
    if not vacanze:
        return sessions
    
    result = []
    
    for session in sessions:
        periodi_validi = [{'inizio': session['inizio'], 'fine': session['fine']}]
        
        # Per ogni vacanza, dividi i periodi che si sovrappongono
        for vacanza in vacanze:
            nuovi_periodi = []
            
            for periodo in periodi_validi:
                # Se la vacanza non si sovrappone con il periodo, mantienilo così com'è
                if vacanza['fine'] < periodo['inizio'] or vacanza['inizio'] > periodo['fine']:
                    nuovi_periodi.append(periodo)
                else:
                    # La vacanza si sovrappone, dividi il periodo
                    # Periodo prima della vacanza
                    if periodo['inizio'] < vacanza['inizio']:
                        nuovi_periodi.append({
                            'inizio': periodo['inizio'],
                            'fine': vacanza['inizio'] - timedelta(days=1)
                        })
                    
                    # Periodo dopo la vacanza
                    if periodo['fine'] > vacanza['fine']:
                        nuovi_periodi.append({
                            'inizio': vacanza['fine'] + timedelta(days=1),
                            'fine': periodo['fine']
                        })
            
            periodi_validi = nuovi_periodi
        
        # Aggiungi i periodi validi risultanti alla lista finale
        for i, periodo in enumerate(periodi_validi):
            if periodo['inizio'] <= periodo['fine']:  # Solo periodi validi
                nome_sessione = session['nome']
                nome_base = session['nome']  # Nome originale senza parti
                if len(periodi_validi) > 1:
                    nome_sessione += f" (Parte {i + 1})"
                
                result.append({
                    'tipo': session['tipo'],
                    'inizio': periodo['inizio'],
                    'fine': periodo['fine'],
                    'nome': nome_sessione,
                    'nome_base': nome_base,  # Aggiungiamo il nome base per l'unificazione
                    'sessione_id': f"{session['tipo']}_{session['inizio'].isoformat()}",  # ID univoco della sessione originale
                    'parte_numero': i + 1 if len(periodi_validi) > 1 else None,
                    'totale_parti': len(periodi_validi) if len(periodi_validi) > 1 else None
                })
    
    return sorted(result, key=lambda x: x['inizio'])

def ottieni_unione_sessioni_cds(cds_list, year):
    """Ottiene l'unione delle sessioni per i CdS specificati"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if not cds_list:
            return []
        
        # Ottieni tutte le sessioni per tutti i CdS
        placeholders = ', '.join(['%s'] * len(cds_list))
        cursor.execute(f"""
            SELECT DISTINCT tipo_sessione, MIN(inizio) as inizio, MAX(fine) as fine
            FROM sessioni
            WHERE cds IN ({placeholders}) AND anno_accademico = %s
            GROUP BY tipo_sessione
            ORDER BY MIN(inizio)
        """, cds_list + [year])
        
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
        print(f"Errore nell'ottenere l'unione delle sessioni: {str(e)}")
        return []
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def unifica_sessioni_divise(sessions):
    """Unifica le sessioni che sono state divise dalle vacanze per la visualizzazione nel frontend"""
    if not sessions:
        return []
    
    # Raggruppa le sessioni per sessione_id (sessioni originali divise)
    sessioni_raggruppate = {}
    
    for session in sessions:
        sessione_id = session.get('sessione_id')
        if not sessione_id:
            # Se non ha sessione_id, è una sessione non divisa
            sessioni_raggruppate[f"single_{session['tipo']}_{session['inizio'].isoformat()}"] = [session]
        else:
            if sessione_id not in sessioni_raggruppate:
                sessioni_raggruppate[sessione_id] = []
            sessioni_raggruppate[sessione_id].append(session)
    
    # Unifica le sessioni raggruppate
    result = []
    for sessione_id, parti in sessioni_raggruppate.items():
        if len(parti) == 1:
            # Sessione non divisa, mantieni così com'è ma rimuovi il "(Parte 1)" se presente
            sessione = parti[0].copy()
            if sessione.get('totale_parti') == 1:
                sessione['nome'] = sessione.get('nome_base', sessione['nome'])
            result.append(sessione)
        else:
            # Sessione divisa, unifica
            parti_ordinate = sorted(parti, key=lambda x: x['inizio'])
            prima_parte = parti_ordinate[0]
            ultima_parte = parti_ordinate[-1]
            
            sessione_unificata = {
                'tipo': prima_parte['tipo'],
                'inizio': prima_parte['inizio'],
                'fine': ultima_parte['fine'],
                'nome': prima_parte.get('nome_base', prima_parte['nome'].split(' (Parte')[0]),
                'nome_base': prima_parte.get('nome_base', prima_parte['nome'].split(' (Parte')[0]),
                'sessione_id': prima_parte['sessione_id'],
                'parti': parti_ordinate,  # Mantieni le parti originali per referenza
                'numero_parti': len(parti_ordinate)
            }
            result.append(sessione_unificata)
    
    return sorted(result, key=lambda x: x['inizio'])