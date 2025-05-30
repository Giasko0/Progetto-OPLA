from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from datetime import datetime
from auth import get_user_data
from psycopg2.extras import DictCursor

fetch_bp = Blueprint('fetch', __name__)

def ottieni_insegnamenti_docente(docente, anno_accademico=None):
    # Ottiene gli insegnamenti di un docente.
    # Restituisce un dizionario con chiave l'ID dell'insegnamento e valore un dizionario con codice e titolo.
    if anno_accademico is None:
        current_date = datetime.now()
        anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query per ottenere gli insegnamenti del docente
        cursor.execute("""
            SELECT DISTINCT
                i.id,
                i.codice, 
                i.titolo
            FROM insegnamenti i
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            JOIN insegnamento_docente id ON i.id = id.insegnamento
            WHERE ic.anno_accademico = %s
            AND id.annoaccademico = %s
            AND id.docente = %s
            ORDER BY i.codice
        """, (anno_accademico, anno_accademico, docente))
        
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

# Funzione utilitaria per verificare se l'utente corrente è un amministratore

# API per ottenere le aule disponibili. Usato in formEsame.html
@fetch_bp.route('/api/getAule', methods=['GET'])
def ottieniAule():
  data = request.args.get('data')
  periodo = request.args.get('periodo')  # 0 per mattina, 1 per pomeriggio
  
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if data and periodo is not None:
      # Converti il periodo in fasce orarie
      if periodo == '0':  # Mattina
        inizio_fascia = '08:30:00'
        fine_fascia = '13:30:00'
      else:  # Pomeriggio
        inizio_fascia = '14:00:00'
        fine_fascia = '19:00:00'
      
      # Recupera tutte le aule dal database
      cursor.execute("SELECT nome, posti FROM aule ORDER BY nome")
      tutte_aule = [(row[0], row[1]) for row in cursor.fetchall()]
      
      # Recupera aule già occupate da esami interni nel sistema
      cursor.execute("""
        SELECT DISTINCT e.aula
        FROM esami e
        WHERE e.data_appello = %s
        AND e.periodo = %s
      """, (data, periodo))
      
      aule_occupate_esami = {row[0] for row in cursor.fetchall()}
      
      # Converti la data dal formato YYYY-MM-DD al formato DD-MM-YYYY per EasyAcademy
      data_parti = data.split('-')
      data_ea_format = f"{data_parti[2]}-{data_parti[1]}-{data_parti[0]}"
      
      # Effettua la richiesta all'API di EasyAcademy per verificare disponibilità
      import requests
      
      try:
        url = f'https://easyacademy.unipg.it/agendaweb/rooms_call.php?sede=P02E04&date={data_ea_format}'
        response = requests.get(url, timeout=5)
        
        aule_occupate_easyacademy = set()
        
        if response.ok:
          data_ea = response.json()
          if 'table' in data_ea:
            for aula_code, aula_data in data_ea['table'].items():
              for slot in aula_data:
                # Verifica se l'evento si sovrappone alla fascia oraria richiesta
                if isinstance(slot, dict) and 'from' in slot and 'to' in slot and 'NomeAula' in slot:
                  ora_inizio = slot['from']
                  ora_fine = slot['to']
                  nome_aula = slot['NomeAula']
                  
                  # Verifica sovrapposizione tra l'evento e la fascia oraria richiesta
                  if ((ora_inizio <= fine_fascia and ora_fine >= inizio_fascia) or 
                      (ora_inizio >= inizio_fascia and ora_inizio <= fine_fascia) or 
                      (ora_fine >= inizio_fascia and ora_fine <= fine_fascia)):
                    aule_occupate_easyacademy.add(nome_aula)
      except Exception as req_error:
        # In caso di errore nella richiesta, log dell'errore ma continua con le aule disponibili nel database
        print(f"Errore nella richiesta a EasyAcademy: {str(req_error)}")
      
      # Combina le aule occupate da entrambe le fonti
      aule_occupate = aule_occupate_esami.union(aule_occupate_easyacademy)
      
      # Determina le aule disponibili
      aule_disponibili = [(aula[0], aula[1]) for aula in tutte_aule if aula[0] not in aule_occupate]
      
      # Formato per la risposta
      aule = [{"nome": nome_aula, "posti": posti} for nome_aula, posti in aule_disponibili]
    else:
      # Se non sono specificate data e periodo, restituisci tutte le aule
      cursor.execute("SELECT nome, posti FROM aule ORDER BY nome")
      aule = [{"nome": row[0], "posti": row[1]} for row in cursor.fetchall()]
    
    return jsonify(aule)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per ottenere tutti gli esami. Usato per gli eventi del calendario
@fetch_bp.route('/api/getEsami', methods=['GET'])
def getEsami():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        docente = request.args.get('docente', None)
        insegnamenti = request.args.get('insegnamenti', None)
        
        if not docente:
            return jsonify({'status': 'error', 'message': 'Parametro docente mancante'}), 400

        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        
        is_admin_user = user_data['user_data']['permessi_admin']
        current_date = datetime.now()
        planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1
        
        # Query base per tutti gli esami del docente
        base_query = """
            SELECT e.id, e.descrizione, e.docente, 
                   concat(u.nome, ' ', u.cognome) as docente_nome,
                   i.codice as insegnamento, i.titolo as insegnamento_titolo,
                   e.aula, e.data_appello, e.ora_appello, e.durata_appello,
                   e.tipo_appello
            FROM esami e
            JOIN utenti u ON e.docente = u.username
            JOIN insegnamenti i ON e.insegnamento = i.id
        """
        
        params = []
        where_conditions = []
        
        if not is_admin_user:
            # Ottieni tutti gli insegnamenti del docente
            insegnamenti_docente_dict = ottieni_insegnamenti_docente(docente, planning_year)
            insegnamenti_docente = [data['codice'] for data in insegnamenti_docente_dict.values()]
            
            if insegnamenti_docente:
                where_conditions.append("i.codice = ANY(%s)")
                params.append(insegnamenti_docente)
            else:
                # Se il docente non ha insegnamenti, non mostrare nulla
                return jsonify([])
        
        # Se sono specificati insegnamenti, aggiungi anche gli esami di insegnamenti 
        # dello stesso anno, semestre e CdS
        if insegnamenti:
            insegnamenti_list = insegnamenti.split(',')
            
            # Query per trovare insegnamenti correlati (stesso anno, semestre, CdS)
            cursor.execute("""
                SELECT DISTINCT i2.codice
                FROM insegnamenti i1
                JOIN insegnamenti_cds ic1 ON i1.id = ic1.insegnamento
                JOIN insegnamenti_cds ic2 ON ic1.cds = ic2.cds 
                    AND ic1.anno_corso = ic2.anno_corso 
                    AND ic1.semestre = ic2.semestre
                    AND ic1.anno_accademico = ic2.anno_accademico
                JOIN insegnamenti i2 ON ic2.insegnamento = i2.id
                WHERE i1.codice = ANY(%s)
                AND ic1.anno_accademico = %s
            """, (insegnamenti_list, planning_year))
            
            insegnamenti_correlati = [row[0] for row in cursor.fetchall()]
            
            if insegnamenti_correlati:
                if where_conditions:
                    where_conditions.append("OR i.codice = ANY(%s)")
                else:
                    where_conditions.append("i.codice = ANY(%s)")
                params.append(insegnamenti_correlati)

        # Costruisci la query finale
        if where_conditions:
            base_query += " WHERE " + " ".join(where_conditions)
        
        # Ordina i risultati
        base_query += " ORDER BY data_appello, ora_appello"

        # Esegui la query
        cursor.execute(base_query, tuple(params))
        
        exams = []
        # Determina gli insegnamenti del docente per la proprietà insegnamentoDocente
        insegnamenti_docente = []
        if not is_admin_user:
            insegnamenti_docente_dict = ottieni_insegnamenti_docente(docente, planning_year)
            insegnamenti_docente = [data['codice'] for data in insegnamenti_docente_dict.values()]
        
        for row in cursor.fetchall():
            # Se l'utente è admin, considera tutti gli esami come propri
            esame_del_docente = True if is_admin_user else row['insegnamento'] in insegnamenti_docente
            
            exams.append({
                'id': str(row['id']),
                'title': row['insegnamento_titolo'],
                'aula': row['aula'],
                'start': f"{row['data_appello'].isoformat()}T{row['ora_appello']}" if row['ora_appello'] else row['data_appello'].isoformat(),
                'description': row['descrizione'],
                'allDay': False,
                'docente': row['docente'],
                'docenteNome': row['docente_nome'],
                'insegnamentoDocente': esame_del_docente,
                'tipo_appello': row['tipo_appello']
            })
        
        return jsonify(exams)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/getMieiEsamiInsegnamenti', methods=['GET'])
def miei_esami():
    user_data = get_user_data().get_json()
    if not user_data['authenticated']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    is_admin_user = user_data['user_data']['permessi_admin']
    docente = request.args.get('docente') if is_admin_user else user_data['user_data']['username']

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        current_date = datetime.now()
        planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1

        insegnamenti_docente = ottieni_insegnamenti_docente(docente, planning_year)
        
        if insegnamenti_docente:
            cursor.execute("""
              WITH esami_unici AS (
                SELECT DISTINCT ON (e.insegnamento, e.data_appello, e.periodo)
                       e.id,
                       e.docente, 
                       CONCAT(u.nome, ' ', u.cognome) as docente_nome,
                       i.titolo, 
                       e.aula, 
                       e.data_appello, 
                       e.ora_appello,
                       c.codice as codice_cds, 
                       c.nome_corso as nome_cds,
                       a.edificio, 
                       e.durata_appello, 
                       i.codice as codice_insegnamento,
                       i.id as insegnamento_id, 
                       e.tipo_appello,
                       e.periodo
                FROM esami e
                JOIN utenti u ON e.docente = u.username
                JOIN insegnamenti i ON e.insegnamento = i.id
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice 
                    AND ic.anno_accademico = c.anno_accademico 
                    AND ic.curriculum = c.curriculum
                LEFT JOIN aule a ON e.aula = a.nome
                WHERE ic.anno_accademico = %s
                AND i.id IN %s
                ORDER BY e.insegnamento, e.data_appello, e.periodo, e.data_appello
              )
              SELECT * FROM esami_unici
              ORDER BY data_appello
            """, (planning_year, tuple(insegnamenti_docente.keys())))
            
            rows = cursor.fetchall()
        else:
            rows = []
            
        esami = []
        insegnamenti_with_esami = {}
        
        for row in rows:
            # Estrai i dati nell'ordine corretto delle colonne
            id_esame, docente, docente_nome, titolo, aula, data_appello, ora = row[0:7]
            codice_cds, nome_cds, edificio, durata_appello, codice_insegnamento, insegnamento_id, tipo_appello, periodo = row[7:15]
            
            # Formatta l'edificio come sigla se presente
            aula_completa = f"{aula} ({edificio})" if edificio else aula
            
            # Determina la sessione a cui appartiene l'esame
            cursor.execute("""
                SELECT tipo_sessione
                FROM sessioni
                WHERE cds = %s
                AND anno_accademico = %s
                AND %s::date BETWEEN inizio AND fine
            """, (codice_cds, planning_year, data_appello))
            
            tipo_sessione = None
            sessione_row = cursor.fetchone()
            if sessione_row:
                tipo_sessione = sessione_row[0]
            
            # Determina il nome della sessione dalla tabella sessioni
            sessione = None
            if tipo_sessione:
                sessione = tipo_sessione.capitalize()
            
            # Formatta l'esame (aggiunto docente_nome)
            exam = {
                'docente': docente,
                'docenteNome': docente_nome,
                'insegnamento': titolo,
                'aula': aula_completa,
                'data': data_appello.strftime("%d/%m/%Y"),
                'ora': ora.strftime("%H:%M") if ora else "00:00",
                'dataora': f"{data_appello.isoformat()}T{ora.isoformat() if ora else '00:00:00'}",
                'cds': nome_cds,
                'codice_cds': codice_cds,
                'durata_appello': durata_appello,
                'tipo_appello': tipo_appello,
                'id': row[0]
            }
            esami.append(exam)
            
            # Aggiorna il conteggio delle sessioni, escludendo le prove parziali
            if tipo_appello != "PP":
                if titolo not in insegnamenti_with_esami:
                    insegnamenti_with_esami[titolo] = {
                        'Anticipata': 0,
                        'Estiva': 0,
                        'Autunnale': 0,
                        'Invernale': 0
                    }
                if sessione:
                    insegnamenti_with_esami[titolo][sessione] += 1
        
        # Creazione del dizionario insegnamenti includendo tutti gli insegnamenti del docente
        insegnamenti = {}
        for data in insegnamenti_docente.values():
            titolo = data['titolo']
            if titolo in insegnamenti_with_esami:
                insegnamenti[titolo] = insegnamenti_with_esami[titolo]
            else:
                insegnamenti[titolo] = {
                    'Anticipata': 0,
                    'Estiva': 0,
                    'Autunnale': 0,
                    'Invernale': 0
                }
        
        return jsonify({'esami': esami, 'insegnamenti': insegnamenti}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere le date delle sessioni d'esame
@fetch_bp.route('/api/get-date-valide', methods=['GET'])
def get_date_valide():
  try:
    docente = request.args.get('docente')
    insegnamenti = request.args.get('insegnamenti')
    
    user_data = get_user_data().get_json()
    if not user_data['authenticated']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    is_admin_user = user_data['user_data']['permessi_admin']
    current_date = datetime.now()
    planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    from utils.sessions import (
      ottieni_sessioni_da_cds, 
      ottieni_intersezione_sessioni_docente, 
      rimuovi_sessioni_duplicate, 
      ottieni_tutte_sessioni,
      ottieni_sessioni_da_insegnamenti
    )
    
    sessions = []
    
    if is_admin_user:
      sessions = ottieni_tutte_sessioni(planning_year)
    elif insegnamenti:
      sessions = ottieni_sessioni_da_insegnamenti(insegnamenti.split(','), planning_year)
    elif docente:
      sessions = ottieni_intersezione_sessioni_docente(docente, planning_year)
    else:
      return jsonify({'status': 'error', 'message': 'Inserisci almeno il docente o gli insegnamenti'}), 400

    # Formatta le date per il frontend
    date_valide = []
    for session in sessions:
      date_valide.append([
        session['inizio'].isoformat(),
        session['fine'].isoformat(),
        session['nome'],
        session['tipo'],
        session['inizio'].year,
        session['inizio'].month
      ])
    
    # Ordina le date per anno e poi per tipo di sessione
    date_valide.sort(key=lambda x: (x[4], x[5]))
    
    # Rimuovi i campi usati solo per l'ordinamento
    date_valide = [item[:3] for item in date_valide]
    
    return jsonify(date_valide)
    
  except Exception as e:
    print(f"Errore generale in get-date-valide: {str(e)}")
    return jsonify({'error': str(e)}), 500

@fetch_bp.route('/api/get-anni-accademici', methods=['GET'])
def get_anni_accademici():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT anno_accademico FROM cds ORDER BY anno_accademico ASC")
        anni = [row[0] for row in cursor.fetchall()]
        return jsonify(anni)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere gli insegnamenti di un docente. Usato in calendar.js e calendarUtils.js
@fetch_bp.route('/api/get-insegnamenti-docente', methods=['GET'])
def get_insegnamenti_docente():
    docente = request.args.get('docente')
    anno = request.args.get('anno')
    
    # Controlla se l'utente ha fornito un parametro docente valido
    if not docente:
        return jsonify({'status': 'error', 'message': 'Parametro docente mancante'}), 400
    
    if not anno or not anno.isdigit():
        current_date = datetime.now()
        anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1
    else:
        anno_accademico = int(anno)
    
    user_data = get_user_data().get_json()
    if not user_data['authenticated']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    is_admin_user = user_data['user_data']['permessi_admin']
    
    if not is_admin_user and user_data['user_data']['username'] != docente:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 403
    
    try:
        if is_admin_user:
            # Admin può accedere a tutti gli insegnamenti
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT DISTINCT i.id, i.codice, i.titolo, ic.cds, c.nome_corso, ic.curriculum
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum = c.curriculum
                WHERE ic.anno_accademico = %s
                ORDER BY ic.cds, i.codice
            """, (anno_accademico,))
            
            result = cursor.fetchall()
            
            # Organizza gli insegnamenti per CdS
            cds_dict = {}
            for row in result:
                ins_id, codice, titolo, cds_code, nome_corso, curriculum = row
                cds_key = f"{cds_code}_{curriculum}"
                
                if cds_key not in cds_dict:
                    cds_dict[cds_key] = {
                        "codice": cds_code,
                        "nome": nome_corso,
                        "curriculum": curriculum,
                        "insegnamenti": []
                    }
                
                cds_dict[cds_key]["insegnamenti"].append({
                    "id": ins_id,
                    "codice": codice,
                    "titolo": titolo
                })
            
            cds_list = list(cds_dict.values())
            
            return jsonify({
                "status": "success",
                "cds": cds_list
            })
        else:
            # Usa la funzione di utilità per ottenere gli insegnamenti del docente
            insegnamenti_dict = ottieni_insegnamenti_docente(docente, anno_accademico)
            
            # Converte in formato array per l'API
            insegnamenti_list = [
                {
                    'id': ins_id,
                    'codice': data['codice'],
                    'titolo': data['titolo']
                }
                for ins_id, data in insegnamenti_dict.items()
            ]
            
            return jsonify({
                'status': 'success',
                'insegnamenti': insegnamenti_list
            })
    
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
    
    is_admin_user = user_data['user_data']['permessi_admin']
    
    if is_admin_user:
        docente = request.args.get('docente')
        if not docente:
            return jsonify({'status': 'error', 'message': 'Parametro docente mancante per admin'}), 400
    else:
        docente = user_data['user_data']['username']
    
    try:
        current_date = datetime.now()
        planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1
        
        # Otteniamo tutti gli insegnamenti validi del docente
        insegnamenti = ottieni_insegnamenti_docente(docente, planning_year)
        if not insegnamenti:
            return jsonify({
                'status': 'success',
                'nessun_problema': True,
                'message': 'Nessun insegnamento trovato per il docente.'
            })
        
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            query = """
                SELECT 
                    i.id, 
                    i.titolo,
                    COUNT(e.id) AS conteggio_esami
                FROM insegnamenti i
                LEFT JOIN esami e ON i.id = e.insegnamento 
                    AND e.docente = %s 
                    AND e.tipo_appello != %s
                    AND e.mostra_nel_calendario = true
                WHERE i.id IN %s
                GROUP BY i.id, i.titolo
                HAVING COUNT(e.id) < %s
                ORDER BY conteggio_esami ASC, i.titolo ASC
            """
            
            # Filtriamo per esami con meno di 8 esami previsti (minimo richiesto)
            params = [docente, "PP", tuple(insegnamenti.keys()), 8]
                
            cursor.execute(query, params)
            
            insegnamenti_pochi_esami = []
            for row in cursor.fetchall():
                insegnamenti_pochi_esami.append({
                    'id': row[0],
                    'titolo': row[1],
                    'esami_inseriti': row[2]
                })
                
            if not insegnamenti_pochi_esami:
                return jsonify({
                    'status': 'success',
                    'nessun_problema': True,
                    'message': 'Tutti gli insegnamenti hanno almeno 8 esami previsti.'
                })
            
            # Altrimenti restituisci gli insegnamenti problematici
            nomi_insegnamenti = [i['titolo'] for i in insegnamenti_pochi_esami]
            esami_mancanti = [(8 - i['esami_inseriti']) for i in insegnamenti_pochi_esami]
            
            return jsonify({
                'status': 'warning',
                'nessun_problema': False,
                'insegnamenti': nomi_insegnamenti,
                'esami_mancanti': esami_mancanti,
                'insegnamenti_sotto_minimo': insegnamenti_pochi_esami
            })
            
        except Exception as e:
            print(f"Errore nel conteggio degli esami: {str(e)}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
        finally:
            if cursor:
                cursor.close()
            if conn:
                release_connection(conn)
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500