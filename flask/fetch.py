from flask import Blueprint, request, jsonify
from db import get_db_connection, release_connection
from datetime import datetime
from auth import get_user_data
from psycopg2.extras import DictCursor
import requests
from functools import wraps

fetch_bp = Blueprint('fetch', __name__)

# Decorator per gestione automatica connessioni DB
def with_db_connection(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        conn = None
        try:
            conn = get_db_connection()
            return f(conn, *args, **kwargs)
        except Exception as e:
            if conn:
                conn.rollback()
            return jsonify({'status': 'error', 'message': str(e)}), 500
        finally:
            if conn:
                release_connection(conn)
    return decorated

# Decorator per autenticazione
def require_auth_api(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        return f(user_data, *args, **kwargs)
    return decorated

def ottieni_insegnamenti_docente(conn, docente, anno_accademico):
    """Ottiene gli insegnamenti di un docente per un anno accademico"""
    if not anno_accademico:
        return {}
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT i.id, i.codice, i.titolo
        FROM insegnamenti i
        JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
        JOIN insegnamento_docente id ON i.id = id.insegnamento
        WHERE ic.anno_accademico = %s AND id.annoaccademico = %s AND id.docente = %s
        ORDER BY i.codice
    """, (anno_accademico, anno_accademico, docente))
    
    return {row[0]: {'codice': row[1], 'titolo': row[2]} for row in cursor.fetchall()}

@fetch_bp.route('/api/getAule', methods=['GET'])
@with_db_connection
def ottieniAule(conn):
    data = request.args.get('data')
    periodo = request.args.get('periodo')
    
    cursor = conn.cursor()
    cursor.execute("SELECT nome, posti FROM aule ORDER BY nome")
    tutte_aule = [(row[0], row[1]) for row in cursor.fetchall()]
    
    if data and periodo is not None:
        # Definisci le fasce orarie
        fasce = {'0': ('08:30:00', '13:30:00'), '1': ('14:00:00', '19:00:00')}
        inizio_fascia, fine_fascia = fasce.get(periodo, ('08:30:00', '13:30:00'))
        
        # Recupera aule occupate da esami nel DB locale
        cursor.execute("""
            SELECT DISTINCT e.aula FROM esami e
            WHERE e.data_appello = %s AND e.periodo = %s
        """, (data, periodo))
        
        aule_occupate_db = {row[0] for row in cursor.fetchall()}
        
        # Controlla disponibilità tramite API EasyAcademy
        aule_occupate_ea = set()
        try:
            data_parti = data.split('-')
            data_ea_format = f"{data_parti[2]}-{data_parti[1]}-{data_parti[0]}"
            url = f'https://easyacademy.unipg.it/agendaweb/rooms_call.php?sede=P02E04&date={data_ea_format}'
            response = requests.get(url, timeout=5)
            
            if response.ok:
                data_ea = response.json()
                if 'table' in data_ea:
                    for aula_data in data_ea['table'].values():
                        for slot in aula_data:
                            if (isinstance(slot, dict) and 
                                all(k in slot for k in ['from', 'to', 'NomeAula'])):
                                ora_inizio, ora_fine = slot['from'], slot['to']
                                # Verifica sovrapposizione
                                if (ora_inizio <= fine_fascia and ora_fine >= inizio_fascia):
                                    aule_occupate_ea.add(slot['NomeAula'])
        except Exception as req_error:
            print(f"Errore EasyAcademy: {req_error}")
        
        # Filtra aule disponibili
        aule_occupate = aule_occupate_db.union(aule_occupate_ea)
        aule_disponibili = [aula for aula in tutte_aule if aula[0] not in aule_occupate]
        return jsonify([{"nome": nome, "posti": posti} for nome, posti in aule_disponibili])
    
    return jsonify([{"nome": row[0], "posti": row[1]} for row in tutte_aule])

@fetch_bp.route('/api/getEsami', methods=['GET'])
@require_auth_api
@with_db_connection
def getEsami(user_data, conn):
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    is_admin_user = user_data['user_data']['permessi_admin']
    docente = request.args.get('docente')
    insegnamenti = request.args.get('insegnamenti')
    anno = int(request.args.get('anno', 0))
    
    if not docente or not anno:
        return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400

    # Query base unificata
    base_query = """
        SELECT e.id, e.descrizione, e.docente, 
               CONCAT(u.nome, ' ', u.cognome) as docente_nome,
               i.codice as insegnamento, i.titolo as insegnamento_titolo,
               e.aula, e.data_appello, e.ora_appello, e.tipo_appello,
               e.durata_appello, e.periodo,
               ic.cds as codice_cds, c.nome_corso as nome_cds,
               a.edificio
        FROM esami e
        JOIN utenti u ON e.docente = u.username
        JOIN insegnamenti i ON e.insegnamento = i.id
        LEFT JOIN insegnamenti_cds ic ON i.id = ic.insegnamento AND ic.anno_accademico = e.anno_accademico
        LEFT JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum = c.curriculum
        LEFT JOIN aule a ON e.aula = a.nome
    """
    
    params = []
    where_conditions = []
    
    # Logica di filtro semplificata
    if not is_admin_user:
        insegnamenti_docente = list(ottieni_insegnamenti_docente(conn, docente, anno).keys())
        if not insegnamenti_docente:
            return jsonify([])
        where_conditions.append("e.insegnamento = ANY(%s)")
        params.append(insegnamenti_docente)
    
    if insegnamenti:
        # Query correlati semplificata
        cursor.execute("""
            SELECT DISTINCT i2.id FROM insegnamenti i1
            JOIN insegnamenti_cds ic1 ON i1.id = ic1.insegnamento
            JOIN insegnamenti_cds ic2 ON ic1.cds = ic2.cds AND ic1.anno_corso = ic2.anno_corso 
                AND ic1.semestre = ic2.semestre AND ic1.anno_accademico = ic2.anno_accademico
            JOIN insegnamenti i2 ON ic2.insegnamento = i2.id
            WHERE i1.codice = ANY(%s) AND ic1.anno_accademico = %s
        """, (insegnamenti.split(','), anno))
        
        insegnamenti_correlati = [row[0] for row in cursor.fetchall()]
        if insegnamenti_correlati:
            condition = "OR e.insegnamento = ANY(%s)" if where_conditions else "e.insegnamento = ANY(%s)"
            where_conditions.append(condition)
            params.append(insegnamenti_correlati)

    if where_conditions:
        base_query += " WHERE " + " ".join(where_conditions)
    base_query += " ORDER BY e.data_appello, e.ora_appello"

    cursor.execute(base_query, tuple(params))
    
    # Determina codici insegnamenti del docente
    insegnamenti_docente_codes = []
    if not is_admin_user:
        insegnamenti_docente_dict = ottieni_insegnamenti_docente(conn, docente, anno)
        insegnamenti_docente_codes = [data['codice'] for data in insegnamenti_docente_dict.values()]
    
    # Costruisci risultati
    exams = []
    for row in cursor.fetchall():
        esame_del_docente = is_admin_user or row['insegnamento'] in insegnamenti_docente_codes
        aula_completa = f"{row['aula']} ({row['edificio']})" if row['edificio'] and row['aula'] else (row['aula'] or 'N/A')
        
        exams.append({
            'id': str(row['id']),
            'title': row['insegnamento_titolo'],
            'aula': aula_completa,
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
                'nome_cds': row['nome_cds'],
                'edificio': row['edificio']
            }
        })
    
    return jsonify(exams)

@fetch_bp.route('/api/get-date-valide', methods=['GET'])
@require_auth_api
def get_date_valide(user_data):
    is_admin_user = user_data['user_data']['permessi_admin']
    docente = request.args.get('docente')
    insegnamenti = request.args.get('insegnamenti')
    anno = int(request.args.get('anno', 0))
    
    if not anno:
        return jsonify({'status': 'error', 'message': 'Anno accademico mancante'}), 400
    
    from utils.sessions import get_sessions_for_request
    
    try:
        sessions = get_sessions_for_request(is_admin_user, docente, insegnamenti, anno)
        date_valide = [
            [session['inizio'].isoformat(), session['fine'].isoformat(), session['nome']]
            for session in sorted(sessions, key=lambda x: (x['inizio'].year, x['inizio'].month))
        ]
        return jsonify(date_valide)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@fetch_bp.route('/api/get-anni-accademici', methods=['GET'])
@with_db_connection
def get_anni_accademici(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT anno_accademico FROM cds ORDER BY anno_accademico ASC")
    anni = [row[0] for row in cursor.fetchall()]
    return jsonify(anni)

@fetch_bp.route('/api/get-insegnamenti-docente', methods=['GET'])
@require_auth_api
@with_db_connection
def get_insegnamenti_docente_endpoint(user_data, conn):
    docente = request.args.get('docente')
    anno = int(request.args.get('anno', 0))
    
    if not docente or not anno:
        return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
    
    is_admin_user = user_data['user_data']['permessi_admin']
    
    if not is_admin_user and user_data['user_data']['username'] != docente:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 403
    
    cursor = conn.cursor()
    
    # Query unificata con condizione
    query = """
        SELECT DISTINCT i.id, i.codice, i.titolo, ic.cds, c.nome_corso, ic.curriculum, 
               ic.semestre, ic.anno_corso
        FROM insegnamenti i
        JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
        JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum = c.curriculum
    """
    
    if is_admin_user:
        query += " WHERE ic.anno_accademico = %s ORDER BY ic.cds, i.codice"
        cursor.execute(query, (anno,))
    else:
        query += """ JOIN insegnamento_docente id ON i.id = id.insegnamento
                     WHERE ic.anno_accademico = %s AND id.annoaccademico = %s AND id.docente = %s
                     ORDER BY ic.cds, i.codice"""
        cursor.execute(query, (anno, anno, docente))
    
    # Organizza per CdS
    cds_dict = {}
    for row in cursor.fetchall():
        ins_id, codice, titolo, cds_code, nome_corso, curriculum, semestre, anno_corso = row
        cds_key = f"{cds_code}_{curriculum}"
        
        if cds_key not in cds_dict:
            cds_dict[cds_key] = {
                "codice": cds_code, "nome": nome_corso, "curriculum": curriculum, "insegnamenti": []
            }
        
        cds_dict[cds_key]["insegnamenti"].append({
            "id": ins_id, "codice": codice, "titolo": titolo, 
            "semestre": semestre, "anno_corso": anno_corso,
            "cds_codice": cds_code, "cds_nome": nome_corso
        })
    
    return jsonify({"status": "success", "cds": list(cds_dict.values())})

@fetch_bp.route('/api/check-esami-minimi', methods=['GET'])
@require_auth_api
@with_db_connection
def check_esami_minimi(user_data, conn):
    is_admin_user = user_data['user_data']['permessi_admin']
    anno = int(request.args.get('anno', 0))
    docente = request.args.get('docente') if is_admin_user else user_data['user_data']['username']
    
    if not anno or not docente:
        return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
    
    insegnamenti = ottieni_insegnamenti_docente(conn, docente, anno)
    if not insegnamenti:
        return jsonify({'status': 'success', 'nessun_problema': True, 'message': 'Nessun insegnamento trovato.'})
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT i.id, i.titolo, COUNT(e.id) AS conteggio_esami,
               STRING_AGG(DISTINCT icds.cds, ', ' ORDER BY icds.cds) AS codici_cds
        FROM insegnamenti i
        LEFT JOIN esami e ON i.id = e.insegnamento AND e.docente = %s 
            AND e.tipo_appello != 'PP' AND e.mostra_nel_calendario = true
        JOIN insegnamenti_cds icds ON i.id = icds.insegnamento AND icds.anno_accademico = %s
        WHERE i.id = ANY(%s)
        GROUP BY i.id, i.titolo
        HAVING COUNT(e.id) < 8
        ORDER BY COUNT(e.id) ASC, i.titolo ASC
    """, (docente, anno, list(insegnamenti.keys())))
    
    insegnamenti_pochi_esami = [
        {'id': row[0], 'titolo': row[1], 'esami_inseriti': row[2], 'codici_cds': row[3]}
        for row in cursor.fetchall()
    ]
    
    if not insegnamenti_pochi_esami:
        return jsonify({'status': 'success', 'nessun_problema': True, 'message': 'Tutti gli insegnamenti hanno almeno 8 esami.'})
    
    return jsonify({
        'status': 'warning', 'nessun_problema': False,
        'insegnamenti': [i['titolo'] for i in insegnamenti_pochi_esami],
        'esami_mancanti': [8 - i['esami_inseriti'] for i in insegnamenti_pochi_esami],
        'insegnamenti_sotto_minimo': insegnamenti_pochi_esami
    })