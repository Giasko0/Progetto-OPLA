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