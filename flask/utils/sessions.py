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

def get_valid_years():
    """
    Restituisce il range di anni accademici validi per la pianificazione degli esami
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ottieni gli anni accademici disponibili
        cursor.execute("""
            SELECT MIN(anno_accademico), MAX(anno_accademico)
            FROM periodi_esame
        """)
        
        result = cursor.fetchone()
        
        # Se non ci sono dati, restituisci un range predefinito attuale
        current_year = datetime.now().year
        if not result or not result[0] or not result[1]:
            return current_year-1, current_year+1
            
        return result[0], result[1]
            
    except Exception as e:
        print(f"Errore nel recupero degli anni validi: {str(e)}")
        current_year = datetime.now().year
        return current_year-1, current_year+1
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)
