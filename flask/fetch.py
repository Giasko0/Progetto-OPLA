from flask import Blueprint, request, jsonify
from db import get_db_connection, release_connection
from datetime import datetime
from auth import get_user_data
from psycopg2.extras import DictCursor
import requests
from utils.sessions import (ottieni_intersezione_sessioni_docente, ottieni_sessioni_da_insegnamenti, ottieni_vacanze, escludi_vacanze_da_sessioni)

fetch_bp = Blueprint('fetch', __name__)

def ottieni_insegnamenti_docente(docente, anno_accademico):
    """Ottiene gli insegnamenti di un docente per un anno accademico"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT DISTINCT i.id, i.codice, i.titolo
            FROM insegnamenti i
            JOIN insegnamento_docente id ON i.id = id.insegnamento
            WHERE id.annoaccademico = %s AND id.docente = %s
            ORDER BY i.codice
        """, (anno_accademico, docente))
        
        return {row[0]: {'codice': row[1], 'titolo': row[2]} for row in cursor.fetchall()}
        
    except Exception as e:
        print(f"Errore nell'ottenere gli insegnamenti del docente: {str(e)}")
        return {}
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/get-aule', methods=['GET'])
def get_aule():
    data = request.args.get('data')
    periodo = request.args.get('periodo')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT nome, posti FROM aule ORDER BY nome")
        tutte_aule = [(row[0], row[1]) for row in cursor.fetchall()]
        
        if data and periodo is not None:
            # Definisci le fasce orarie
            if periodo == '0':  # Mattina
                inizio_fascia = '08:30:00'
                fine_fascia = '13:30:00'
            else:  # Pomeriggio
                inizio_fascia = '14:00:00'
                fine_fascia = '19:00:00'
            
            # Recupera aule occupate da esami nel DB locale
            cursor.execute("""
                SELECT DISTINCT e.aula FROM esami e
                WHERE e.data_appello = %s AND e.periodo = %s AND e.aula IS NOT NULL
            """, (data, periodo))
            
            aule_occupate_db = {row[0] for row in cursor.fetchall()}
            
            # Controlla disponibilità tramite API EasyAcademy
            aule_occupate_ea = set()
            try:
                # Converti data da YYYY-MM-DD a DD-MM-YYYY per EasyAcademy
                data_parti = data.split('-')
                data_ea_format = f"{data_parti[2]}-{data_parti[1]}-{data_parti[0]}"
                
                url = f'https://easyacademy.unipg.it/agendaweb/rooms_call.php?sede=P02E04&date={data_ea_format}'
                response = requests.get(url, timeout=5)
                
                if response.ok:
                    data_ea = response.json()
                    if 'table' in data_ea:
                        for aula_code, aula_data in data_ea['table'].items():
                            for slot in aula_data:
                                if isinstance(slot, dict) and 'from' in slot and 'to' in slot and 'NomeAula' in slot:
                                    ora_inizio = slot['from']
                                    ora_fine = slot['to']
                                    nome_aula = slot['NomeAula']
                                    
                                    # Verifica sovrapposizione con la fascia oraria richiesta
                                    if ((ora_inizio <= fine_fascia and ora_fine >= inizio_fascia) or 
                                        (ora_inizio >= inizio_fascia and ora_inizio <= fine_fascia) or 
                                        (ora_fine >= inizio_fascia and ora_fine <= fine_fascia)):
                                        aule_occupate_ea.add(nome_aula)
            except Exception as req_error:
                print(f"Errore nella richiesta a EasyAcademy: {str(req_error)}")
            
            # Combina le aule occupate da entrambe le fonti
            aule_occupate = aule_occupate_db.union(aule_occupate_ea)
            
            # Filtra le aule disponibili
            aule_disponibili = [(aula[0], aula[1]) for aula in tutte_aule if aula[0] not in aule_occupate]
            aule = [{"nome": nome_aula, "posti": posti} for nome_aula, posti in aule_disponibili]
        else:
            aule = [{"nome": row[0], "posti": row[1]} for row in tutte_aule]
        
        return jsonify(aule)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/get-esami', methods=['GET'])
def get_esami():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        
        is_admin_user = user_data['user_data']['permessi_admin']
        docente = request.args.get('docente')
        insegnamenti = request.args.get('insegnamenti')
        anno = int(request.args.get('anno'))
        
        if not docente or not anno:
            return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400

        base_query = """
            SELECT e.id, e.descrizione, e.docente, 
                   CONCAT(u.nome, ' ', u.cognome) as docente_nome,
                   i.codice as insegnamento, i.titolo as insegnamento_titolo,
                   e.aula, e.data_appello, e.ora_appello, e.tipo_appello,
                   e.durata_appello, e.periodo,
                   e.cds as codice_cds, c.nome_corso as nome_cds
            FROM esami e
            JOIN utenti u ON e.docente = u.username
            JOIN insegnamenti i ON e.insegnamento = i.id
            LEFT JOIN cds c ON e.cds = c.codice AND e.anno_accademico = c.anno_accademico AND e.curriculum_codice = c.curriculum_codice
            WHERE e.anno_accademico = %s AND e.mostra_nel_calendario = true
        """
        
        params = [anno]
        
        if not is_admin_user:
            insegnamenti_docente = list(ottieni_insegnamenti_docente(docente, anno).keys())
            if insegnamenti_docente:
                base_query += " AND e.insegnamento = ANY(%s)"
                params.append(insegnamenti_docente)
            else:
                return jsonify([])
        
        if insegnamenti:
            insegnamenti_list = insegnamenti.split(',')
            base_query += " AND i.codice = ANY(%s)"
            params.append(insegnamenti_list)

        base_query += " ORDER BY e.data_appello, e.ora_appello"

        cursor.execute(base_query, tuple(params))
        
        exams = []
        for row in cursor.fetchall():
            esame_del_docente = True if is_admin_user else row['docente'] == docente
            
            exams.append({
                'id': str(row['id']),
                'title': row['insegnamento_titolo'],
                'aula': row['aula'],
                'start': f"{row['data_appello'].isoformat()}T{row['ora_appello']}" if row['ora_appello'] else row['data_appello'].isoformat(),
                'description': row['descrizione'],
                'allDay': False,
                'extendedProps': {
                    'docente': row['docente'],
                    'docenteNome': row['docente_nome'],
                    'insegnamento': row['insegnamento'],
                    'insegnamentoDocente': esame_del_docente,
                    'tipo_appello': row['tipo_appello'],
                    'durata_appello': row['durata_appello'],
                    'periodo': row['periodo'],
                    'codice_cds': row['codice_cds'],
                    'nome_cds': row['nome_cds']
                }
            })
        
        return jsonify(exams)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere gli anni accademici disponibili
@fetch_bp.route('/api/get-anni-accademici')
def get_anni_accademici():
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Recupera tutti gli anni accademici
    cursor.execute("""
      SELECT DISTINCT anno_accademico 
      FROM configurazioni_globali 
      ORDER BY anno_accademico DESC
    """)
    
    # Estrae gli anni dalla query e li converte in una lista
    anni = [row[0] for row in cursor.fetchall()]
    
    return jsonify(anni)
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

@fetch_bp.route('/api/get-date-valide', methods=['GET'])
def get_date_valide():
    try:
        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        
        docente = request.args.get('docente')
        anno = int(request.args.get('anno'))
        insegnamenti = request.args.get('insegnamenti')
        
        # Docente e anno sono sempre obbligatori
        if not docente or not anno:
            return jsonify({'status': 'error', 'message': 'Docente e anno accademico sono obbligatori'}), 400
                
        # Se sono specificati insegnamenti, usa quelli per filtrare le sessioni
        if insegnamenti:
            sessions = ottieni_sessioni_da_insegnamenti(insegnamenti.split(','), anno)
        else:
            # Altrimenti usa tutte le sessioni del docente
            sessions = ottieni_intersezione_sessioni_docente(docente, anno)

        # Ottieni le vacanze per l'anno accademico e escludile dalle sessioni
        vacanze = ottieni_vacanze(anno)
        sessions_senza_vacanze = escludi_vacanze_da_sessioni(sessions, vacanze)

        date_valide = [
            [session['inizio'].isoformat(), session['fine'].isoformat(), session['nome'], session.get('sessione_id', ''), session.get('nome_base', session['nome']), session.get('parte_numero'), session.get('totale_parti')]
            for session in sorted(sessions_senza_vacanze, key=lambda x: (x['inizio'].year, x['inizio'].month))
        ]
        
        return jsonify(date_valide)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@fetch_bp.route('/api/get-insegnamenti-docente', methods=['GET'])
def get_insegnamenti_docente():
    docente = request.args.get('docente')
    anno = int(request.args.get('anno'))
    
    if not docente or not anno:
        return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
    
    user_data = get_user_data().get_json()
    if not user_data['authenticated']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    is_admin_user = user_data['user_data']['permessi_admin']
    
    if not is_admin_user and user_data['user_data']['username'] != docente:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 403
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if is_admin_user:
            cursor.execute("""
                SELECT DISTINCT i.id, i.codice, i.titolo, ic.cds, c.nome_corso, ic.curriculum_codice, 
                       ic.semestre, ic.anno_corso
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum_codice = c.curriculum_codice
                WHERE ic.anno_accademico = %s
                ORDER BY ic.cds, i.codice
            """, (anno,))
        else:
            cursor.execute("""
                SELECT DISTINCT i.id, i.codice, i.titolo, ic.cds, c.nome_corso, ic.curriculum_codice, 
                       ic.semestre, ic.anno_corso
                FROM insegnamenti i
                JOIN insegnamento_docente id ON i.id = id.insegnamento
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum_codice = c.curriculum_codice
                WHERE ic.anno_accademico = %s AND id.annoaccademico = %s AND id.docente = %s
                ORDER BY ic.cds, i.codice
            """, (anno, anno, docente))
        
        # Organizza per CdS
        cds_dict = {}
        for row in cursor.fetchall():
            ins_id, codice, titolo, cds_code, nome_corso, curriculum_codice, semestre, anno_corso = row
            cds_key = f"{cds_code}_{curriculum_codice}"
            
            if cds_key not in cds_dict:
                cds_dict[cds_key] = {
                    "codice": cds_code, "nome": nome_corso, "curriculum_codice": curriculum_codice, "insegnamenti": []
                }
            
            cds_dict[cds_key]["insegnamenti"].append({
                "id": ins_id, "codice": codice, "titolo": titolo, 
                "semestre": semestre, "anno_corso": anno_corso,
                "cds_codice": cds_code, "cds_nome": nome_corso
            })
        
        return jsonify({"status": "success", "cds": list(cds_dict.values())})
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/check-esami-minimi', methods=['GET'])
def check_esami_minimi():
    user_data = get_user_data().get_json()
    if not user_data['authenticated']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    docente = request.args.get('docente')
    anno = int(request.args.get('anno'))
    
    # Docente e anno sono sempre obbligatori
    if not docente or not anno:
        return jsonify({'status': 'error', 'message': 'Docente e anno accademico sono obbligatori'}), 400
    
    try:
        insegnamenti = ottieni_insegnamenti_docente(docente, anno)
        if not insegnamenti:
            return jsonify({'status': 'success', 'nessun_problema': True, 'message': 'Nessun insegnamento trovato.'})
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ottieni il target di esami dalle configurazioni globali
        cursor.execute("""
            SELECT target_esami_default 
            FROM configurazioni_globali 
            WHERE anno_accademico = %s
        """, (anno,))
        
        target_result = cursor.fetchone()
        target_esami = target_result[0] if target_result and target_result[0] else 8  # Default fallback
        
        cursor.execute("""
            SELECT i.id, i.titolo, COUNT(e.id) AS conteggio_esami,
                   CONCAT(c.nome_corso, ' - ', ic.cds) AS codici_cds
            FROM insegnamenti i
            JOIN insegnamento_docente id ON i.id = id.insegnamento
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            LEFT JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum_codice = c.curriculum_codice
            LEFT JOIN esami e ON i.id = e.insegnamento AND e.docente = %s 
                AND e.anno_accademico = %s AND e.tipo_appello != 'PP' AND e.mostra_nel_calendario = true
            WHERE id.docente = %s AND id.annoaccademico = %s AND ic.anno_accademico = %s
            GROUP BY i.id, i.titolo, ic.cds, c.nome_corso
            HAVING COUNT(e.id) < %s
            ORDER BY COUNT(e.id) ASC, i.titolo ASC
        """, (docente, anno, docente, anno, anno, target_esami))
        
        insegnamenti_pochi_esami = [
            {
                'id': row[0], 
                'titolo': row[1], 
                'esami_inseriti': row[2], 
                'codici_cds': row[3],
                'target_esami': target_esami
            }
            for row in cursor.fetchall()
        ]
        
        if not insegnamenti_pochi_esami:
            return jsonify({
                'status': 'success', 
                'nessun_problema': True, 
                'message': f'Tutti gli insegnamenti hanno almeno {target_esami} esami.',
                'target_esami': target_esami
            })
        
        return jsonify({
            'status': 'warning', 
            'nessun_problema': False,
            'insegnamenti': [i['titolo'] for i in insegnamenti_pochi_esami],
            'esami_mancanti': [target_esami - i['esami_inseriti'] for i in insegnamenti_pochi_esami],
            'insegnamenti_sotto_minimo': insegnamenti_pochi_esami,
            'target_esami': target_esami
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)