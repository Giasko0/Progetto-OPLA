from db import get_db_connection
from datetime import datetime

def get_valid_years():
    """Determina gli anni validi per l'inserimento degli esami"""
    current_date = datetime.now()
    current_year = current_date.year
    current_month = current_date.month

    if current_month >= 9:  # Da settembre a dicembre
        return (current_year, current_year + 1)
    else:  # Da gennaio ad agosto
        return (current_year - 1, current_year)

def get_session_for_date(date, cds_code, anno_acc):
    """Determina la sessione di un esame in base alla data e al CDS"""
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
            
        # ...existing code for other sessions...
        
    finally:
        cursor.close()
        conn.close()
    return None
