from db import get_db_connection, release_connection
from datetime import datetime

def get_valid_years():
    # Determina gli anni validi per l'inserimento degli esami
    current_date = datetime.now()
    current_year = current_date.year
    current_month = current_date.month

    if current_month >= 9:  # Da settembre a dicembre
        return (current_year, current_year + 1)
    else:  # Da gennaio ad agosto
        return (current_year - 1, current_year)

# Determina la sessione di un esame in base alla data e al CDS
def get_session_for_date(date, cds_code, anno_acc):
    """
    Determina in quale sessione d'esame rientra una data per un determinato CDS.
    
    Args:
        date: La data dell'esame
        cds_code: Il codice del corso di studi
        anno_acc: L'anno accademico
        
    Returns:
        Una tupla (nome_sessione, limite_max_esami, data_inizio_sessione) o None se la data non è in nessuna sessione
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Test sessione anticipata
        cursor.execute("""
            SELECT 'Anticipata', 3, inizio_sessione_anticipata
            FROM cds 
            WHERE codice = %s AND anno_accademico = %s 
            AND %s BETWEEN inizio_sessione_anticipata AND fine_sessione_anticipata
        """, (cds_code, anno_acc, date))
        result = cursor.fetchone()
        if result:
            return result
        
        # Test sessione estiva
        cursor.execute("""
            SELECT 'Estiva', 3, inizio_sessione_estiva
            FROM cds 
            WHERE codice = %s AND anno_accademico = %s 
            AND %s BETWEEN inizio_sessione_estiva AND fine_sessione_estiva
        """, (cds_code, anno_acc, date))
        result = cursor.fetchone()
        if result:
            return result
        
        # Test sessione autunnale
        cursor.execute("""
            SELECT 'Autunnale', 2, inizio_sessione_autunnale
            FROM cds 
            WHERE codice = %s AND anno_accademico = %s 
            AND %s BETWEEN inizio_sessione_autunnale AND fine_sessione_autunnale
        """, (cds_code, anno_acc, date))
        result = cursor.fetchone()
        if result:
            return result
        
        # Test sessione invernale
        cursor.execute("""
            SELECT 'Invernale', 3, inizio_sessione_invernale
            FROM cds 
            WHERE codice = %s AND anno_accademico = %s 
            AND %s BETWEEN inizio_sessione_invernale AND fine_sessione_invernale
        """, (cds_code, anno_acc, date))
        result = cursor.fetchone()
        if result:
            return result
            
        # Verifica se siamo nel periodo di pausa didattica del primo semestre
        cursor.execute("""
            SELECT 'Pausa Didattica I', 1, pausa_didattica_primo_inizio
            FROM cds 
            WHERE codice = %s AND anno_accademico = %s 
            AND %s BETWEEN pausa_didattica_primo_inizio AND pausa_didattica_primo_fine
        """, (cds_code, anno_acc, date))
        result = cursor.fetchone()
        if result:
            return result
            
        # Verifica se siamo nel periodo di pausa didattica del secondo semestre
        cursor.execute("""
            SELECT 'Pausa Didattica II', 1, pausa_didattica_secondo_inizio
            FROM cds 
            WHERE codice = %s AND anno_accademico = %s 
            AND %s BETWEEN pausa_didattica_secondo_inizio AND pausa_didattica_secondo_fine
        """, (cds_code, anno_acc, date))
        result = cursor.fetchone()
        if result:
            return result
            
        # Non siamo in nessuna sessione d'esame
        return None
            
    except Exception as e:
        print(f"Errore in get_session_for_date: {e}")
        return None
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)
