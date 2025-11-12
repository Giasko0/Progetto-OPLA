from flask import Blueprint, jsonify, session
from db import get_db_connection, release_connection
from auth import require_auth

strumenti_bp = Blueprint('strumenti', __name__, url_prefix='/api/oh-issa')

def semestri_compatibili(semestre1, semestre2):
    """Verifica se due semestri sono compatibili per le sovrapposizioni."""
    # Semestre 3 (annuale) è compatibile con tutti
    if semestre1 == 3 or semestre2 == 3:
        return True
    # Semestri uguali sono compatibili
    return semestre1 == semestre2

def hanno_docenti_comuni(insegnamento1_id, insegnamento2_id, anno_accademico, cursor):
    """Verifica se due insegnamenti hanno docenti in comune."""
    cursor.execute("""
        SELECT COUNT(*) FROM (
            SELECT docente FROM insegnamento_docente 
            WHERE insegnamento = %s AND annoaccademico = %s
            INTERSECT
            SELECT docente FROM insegnamento_docente 
            WHERE insegnamento = %s AND annoaccademico = %s
        ) AS comuni
    """, (insegnamento1_id, anno_accademico, insegnamento2_id, anno_accademico))
    
    count = cursor.fetchone()[0]
    return count > 0

def conta_sovrapposizioni_per_insegnamento(insegnamento_id, cds, anno_accademico, cursor):
    """
    Conta il numero di date in sovrapposizione per un insegnamento.
    """
    # Ottieni il semestre dell'insegnamento
    cursor.execute("""
        SELECT semestre FROM insegnamenti_cds 
        WHERE insegnamento = %s AND cds = %s AND anno_accademico = %s
        LIMIT 1
    """, (insegnamento_id, cds, anno_accademico))
    
    result = cursor.fetchone()
    if not result:
        return 0
    
    semestre_ins = result[0]
    
    # Trova tutti gli esami ufficiali dell'insegnamento
    cursor.execute("""
        SELECT DISTINCT data_appello, periodo
        FROM esami
        WHERE insegnamento = %s 
            AND cds = %s
            AND anno_accademico = %s
            AND mostra_nel_calendario = true
    """, (insegnamento_id, cds, anno_accademico))
    
    date_esami = cursor.fetchall()
    
    # Conta quante date hanno sovrapposizioni
    sovrapposizioni = 0
    
    for data_appello, periodo in date_esami:
        # Trova tutti gli esami ufficiali nella stessa data/periodo/cds
        cursor.execute("""
            SELECT DISTINCT e.insegnamento, ic.semestre
            FROM esami e
            JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento 
                AND e.cds = ic.cds 
                AND e.anno_accademico = ic.anno_accademico
            WHERE e.cds = %s 
                AND e.anno_accademico = %s
                AND e.data_appello = %s
                AND e.periodo = %s
                AND e.mostra_nel_calendario = true
                AND e.insegnamento != %s
        """, (cds, anno_accademico, data_appello, periodo, insegnamento_id))
        
        altri_esami = cursor.fetchall()
        
        # Verifica se esiste almeno un esame compatibile senza docenti comuni
        ha_sovrapposizione = False
        for altro_ins_id, altro_semestre in altri_esami:
            # Verifica compatibilità semestre
            if not semestri_compatibili(semestre_ins, altro_semestre):
                continue
            
            # Verifica nessun docente comune
            if hanno_docenti_comuni(insegnamento_id, altro_ins_id, anno_accademico, cursor):
                continue
            
            # Trovata una sovrapposizione valida per questa data
            ha_sovrapposizione = True
            break
        
        if ha_sovrapposizione:
            sovrapposizioni += 1
    
    return sovrapposizioni

def ricalcola_sovrapposizioni_global():
    """
    Ricalcola tutte le sovrapposizioni usando la stessa logica di exams.py
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Reset tutti i contatori
        cursor.execute("UPDATE insegnamenti_cds SET sovrapposizioni = 0")
        
        # Ottieni tutti gli insegnamenti attivi
        cursor.execute("""
            SELECT DISTINCT insegnamento, cds, anno_accademico
            FROM insegnamenti_cds
            ORDER BY anno_accademico, cds, insegnamento
        """)
        
        insegnamenti = cursor.fetchall()
        
        report = {
            'total_insegnamenti_processati': len(insegnamenti),
            'insegnamenti_con_sovrapposizioni': 0,
            'dettagli': [],
            'errori': []
        }
        
        # Calcola sovrapposizioni per ogni insegnamento
        for insegnamento_id, cds, anno_accademico in insegnamenti:
            try:
                num_sovrapposizioni = conta_sovrapposizioni_per_insegnamento(
                    insegnamento_id, cds, anno_accademico, cursor
                )
                
                if num_sovrapposizioni > 0:
                    # Aggiorna il contatore
                    cursor.execute("""
                        UPDATE insegnamenti_cds
                        SET sovrapposizioni = %s
                        WHERE insegnamento = %s AND cds = %s AND anno_accademico = %s
                    """, (num_sovrapposizioni, insegnamento_id, cds, anno_accademico))
                    
                    report['insegnamenti_con_sovrapposizioni'] += 1
                    
                    # Ottieni titolo insegnamento per il report
                    cursor.execute("""
                        SELECT titolo FROM insegnamenti WHERE id = %s
                    """, (insegnamento_id,))
                    titolo = cursor.fetchone()
                    
                    report['dettagli'].append({
                        'insegnamento_id': insegnamento_id,
                        'titolo': titolo[0] if titolo else insegnamento_id,
                        'cds': cds,
                        'anno_accademico': anno_accademico,
                        'numero_sovrapposizioni': num_sovrapposizioni
                    })
                    
            except Exception as e:
                report['errori'].append({
                    'insegnamento_id': insegnamento_id,
                    'cds': cds,
                    'anno_accademico': anno_accademico,
                    'errore': str(e)
                })
        
        conn.commit()
        
        report['status'] = 'success'
        report['message'] = (
            f"Ricalcolo completato: {report['insegnamenti_con_sovrapposizioni']} "
            f"insegnamenti con sovrapposizioni su {report['total_insegnamenti_processati']} totali"
        )
        
        return report
        
    except Exception as e:
        conn.rollback()
        return {
            'status': 'error',
            'message': f'Errore durante il ricalcolo delle sovrapposizioni: {str(e)}',
            'errori': [str(e)]
        }
    finally:
        cursor.close()
        release_connection(conn)

@strumenti_bp.route('/ricalcola-sovrapposizioni', methods=['GET'])
@require_auth
def ricalcola_sovrapposizioni():
    try:
        username = session.get('username', '')
        is_admin = session.get('permessi_admin', False)
        if not is_admin:
            return jsonify({
                'status': 'error',
                'message': 'Accesso negato: solo gli admin possono ricalcolare le sovrapposizioni'
            }), 403
        report = ricalcola_sovrapposizioni_global()
        return jsonify(report), 200 if report.get('status') == 'success' else 500
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Errore durante il ricalcolo: {str(e)}'
        }), 500
