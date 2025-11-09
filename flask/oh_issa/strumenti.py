from flask import Blueprint, jsonify, session
from db import get_db_connection, release_connection
from auth import require_auth

strumenti_bp = Blueprint('strumenti', __name__, url_prefix='/api/oh-issa')

def ricalcola_sovrapposizioni_global():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE insegnamenti_cds SET sovrapposizioni = 0")
        cursor.execute("""
            SELECT DISTINCT e.id, e.insegnamento, e.data_appello, e.anno_accademico, e.docente
            FROM esami e
            WHERE e.mostra_nel_calendario = true
            ORDER BY e.data_appello, e.insegnamento
        """)
        esami_ufficiali = cursor.fetchall()
        sovrapposti_per_giorno = {}
        report = {
            'total_esami_processati': len(esami_ufficiali),
            'giorni_con_sovrapposizioni': 0,
            'coppie_sovrapposte': [],
            'dettagli_errori': []
        }
        for esame_id, insegnamento_id, data_appello, anno_accademico, docente in esami_ufficiali:
            try:
                cursor.execute("""
                    SELECT ic.semestre, ic.cds, ic.anno_corso
                    FROM insegnamenti_cds ic
                    WHERE ic.insegnamento = %s AND ic.anno_accademico = %s
                    LIMIT 1
                """, (insegnamento_id, anno_accademico))
                insegnamento_info = cursor.fetchone()
                if not insegnamento_info:
                    continue
                semestre_corrente, cds, anno_corso = insegnamento_info
                chiave_giorno = (str(data_appello), cds, anno_corso, anno_accademico)
                if semestre_corrente == 3:
                    semestre_condition = "ic2.semestre IN (1, 2, 3)"
                else:
                    semestre_condition = f"ic2.semestre IN ({semestre_corrente}, 3)"
                cursor.execute("""
                    SELECT e.periodo FROM esami e
                    WHERE e.id IN (
                        SELECT id FROM esami 
                        WHERE insegnamento = %s AND data_appello = %s
                    )
                    LIMIT 1
                """, (insegnamento_id, data_appello))
                periodo_result = cursor.fetchone()
                periodo = periodo_result[0] if periodo_result else None
                query = f"""
                    SELECT DISTINCT e2.insegnamento, e2.docente
                    FROM esami e2
                    JOIN insegnamenti_cds ic2 ON e2.insegnamento = ic2.insegnamento 
                        AND e2.anno_accademico = ic2.anno_accademico
                    WHERE e2.data_appello = %s
                    AND e2.mostra_nel_calendario = true
                    AND e2.periodo = %s
                    AND ic2.cds = %s
                    AND ic2.anno_corso = %s
                    AND e2.anno_accademico = %s
                    AND ({semestre_condition})
                    AND e2.insegnamento != %s
                """
                cursor.execute(query, (
                    data_appello, periodo, cds, anno_corso, anno_accademico, insegnamento_id
                ))
                esami_sovrapposti = cursor.fetchall()
                if esami_sovrapposti:
                    if chiave_giorno not in sovrapposti_per_giorno:
                        sovrapposti_per_giorno[chiave_giorno] = {}
                        report['giorni_con_sovrapposizioni'] += 1
                    sovrapposti_per_giorno[chiave_giorno][insegnamento_id] = docente
                    for ins_sovrapposto, doc_sovrapposto in esami_sovrapposti:
                        sovrapposti_per_giorno[chiave_giorno][ins_sovrapposto] = doc_sovrapposto
            except Exception as e:
                report['dettagli_errori'].append(f"Errore processing esame {esame_id}: {str(e)}")
        for chiave_giorno, insegnamenti_docenti in sovrapposti_per_giorno.items():
            data_appello, cds, anno_corso, anno_accademico = chiave_giorno
            for insegnamento_id, docente in insegnamenti_docenti.items():
                num_sovrapposizioni = sum(
                    1 for ins_id, doc in insegnamenti_docenti.items()
                    if ins_id != insegnamento_id and doc != docente
                )
                if num_sovrapposizioni > 0:
                    cursor.execute("""
                        UPDATE insegnamenti_cds
                        SET sovrapposizioni = %s
                        WHERE insegnamento = %s AND anno_accademico = %s
                    """, (num_sovrapposizioni, insegnamento_id, anno_accademico))
                    report['coppie_sovrapposte'].append({
                        'data': data_appello,
                        'cds': cds,
                        'anno_corso': anno_corso,
                        'insegnamento_id': insegnamento_id,
                        'numero_sovrapposizioni': num_sovrapposizioni
                    })
        conn.commit()
        report['status'] = 'success'
        report['message'] = f"Ricalcolo completato: {report['giorni_con_sovrapposizioni']} giorni con sovrapposizioni, {len(report['coppie_sovrapposte'])} registri aggiornati"
        return report
    except Exception as e:
        conn.rollback()
        return {
            'status': 'error',
            'message': f'Errore durante il ricalcolo delle sovrapposizioni: {str(e)}',
            'dettagli_errori': [str(e)]
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
