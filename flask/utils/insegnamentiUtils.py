from db import get_db_connection, release_connection
from datetime import datetime
from flask import jsonify

def ottieni_insegnamenti_docente(docente, anno_accademico=None):
    # Ottiene gli insegnamenti di un docente escludendo mutuazioni e moduli duplicati.
    # Restituisce un dizionario con chiave l'ID dell'insegnamento e valore un dizionario con codice e titolo.
    if anno_accademico is None:
        current_date = datetime.now()
        anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query ottimizzata per ottenere gli insegnamenti del docente escludendo duplicati
        cursor.execute("""
            -- Prima otteniamo tutti gli insegnamenti del docente per escluderli dalle mutuazioni/moduli
            WITH insegnamenti_docente AS (
                SELECT i.id, i.codice
                FROM insegnamento_docente id
                JOIN insegnamenti i ON id.insegnamento = i.id
                WHERE id.docente = %s
                AND id.annoaccademico = %s
            ),
            -- Poi selezioniamo gli insegnamenti da mostrare
            insegnamenti_filtrati AS (
                SELECT 
                    i.id,
                    i.codice, 
                    i.titolo
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN insegnamento_docente id ON i.id = id.insegnamento
                WHERE ic.anno_accademico = %s
                AND id.annoaccademico = %s
                AND id.docente = %s
                AND (
                    -- Escludiamo gli insegnamenti mutuati che hanno come padre un insegnamento del docente
                    (NOT ic.is_mutuato OR ic.padri_mutua IS NULL OR NOT EXISTS (
                        SELECT 1 
                        FROM unnest(ic.padri_mutua) AS padre_mutua
                        WHERE padre_mutua IN (SELECT codice FROM insegnamenti_docente)
                    ))
                    AND
                    -- Escludiamo i moduli che hanno come padre un insegnamento del docente
                    (NOT ic.is_modulo OR ic.padre_modulo IS NULL OR ic.padre_modulo NOT IN (
                        SELECT codice FROM insegnamenti_docente
                    ))
                )
            )
            SELECT DISTINCT ON (codice)
                id, codice, titolo
            FROM insegnamenti_filtrati
        """, (docente, anno_accademico, anno_accademico, anno_accademico, docente))
        
        # Costruisci un dizionario dei risultati
        insegnamenti = {row[0]: {'codice': row[1], 'titolo': row[2]} for row in cursor.fetchall()}
        return insegnamenti
        
    except Exception as e:
        print(f"Errore nell'ottenere gli insegnamenti del docente: {str(e)}")
        return {}
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

def conta_esami_insegnamenti(docente, anno_accademico=None, minimo_esami=None):
    # Conta il numero di esami per ogni insegnamento di un docente, escludendo le prove parziali (PP).
    if anno_accademico is None:
        current_date = datetime.now()
        anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Otteniamo tutti gli insegnamenti validi del docente
        insegnamenti = ottieni_insegnamenti_docente(docente, anno_accademico)
        if not insegnamenti:
            return []
        
        query = """
            SELECT 
                i.id, 
                i.titolo,
                COUNT(e.id) AS conteggio_esami
            FROM insegnamenti i
            LEFT JOIN esami e ON i.id = e.insegnamento AND e.docente = %s AND e.tipo_appello != %s
            WHERE i.id IN %s
            GROUP BY i.id, i.titolo
        """
        
        params = [docente, "PP", tuple(insegnamenti.keys())]
        
        # Aggiungiamo clausola HAVING per il minimo esami se specificato
        if minimo_esami is not None:
            query += " HAVING COUNT(e.id) < %s"
            params.append(minimo_esami)
            
        query += " ORDER BY conteggio_esami ASC, i.titolo ASC"
        
        cursor.execute(query, params)
        
        risultati = []
        for row in cursor.fetchall():
            risultati.append({
                'id': row[0],
                'titolo': row[1],
                'esami_inseriti': row[2]
            })
            
        return risultati
        
    except Exception as e:
        print(f"Errore nel conteggio degli esami: {str(e)}")
        return []
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

def check_esami_minimi(user_data):
    # Verifica se il docente ha inserito il numero minimo di esami per ogni insegnamento.
    if not user_data['authenticated'] or not user_data['user_data']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401

    docente = user_data['user_data']['username']
    
    # Verifica se l'utente è un docente
    if not user_data['user_data'].get('permessi_docente', False):
        return jsonify({'status': 'error', 'message': 'Solo i docenti possono accedere a questa funzione'}), 403

    try:
        current_date = datetime.now()
        planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1
        numero_minimo_esami = 8  # Minimo 8 esami per insegnamento
        
        # Usa la funzione di supporto per ottenere gli insegnamenti sotto il minimo
        insegnamenti_sotto_minimo = conta_esami_insegnamenti(docente, planning_year, numero_minimo_esami)
        
        # Creiamo un messaggio descrittivo per la risposta
        message = "Tutti gli insegnamenti hanno il numero minimo di esami."
        if insegnamenti_sotto_minimo:
            if len(insegnamenti_sotto_minimo) == 1:
                ins = insegnamenti_sotto_minimo[0]
                message = f"L'insegnamento {ins['titolo']} ha solo {ins['esami_inseriti']} esami inseriti su 8 richiesti."
            else:
                message = f"Ci sono {len(insegnamenti_sotto_minimo)} insegnamenti che non hanno il numero minimo di 8 esami."
        
        return jsonify({
            'status': 'success',
            'message': message,
            'insegnamenti_sotto_minimo': insegnamenti_sotto_minimo
        }), 200
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
