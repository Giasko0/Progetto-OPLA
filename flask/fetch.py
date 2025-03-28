from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from datetime import datetime
from auth import get_user_data
from psycopg2.extras import DictCursor
from utils.insegnamentiUtils import ottieni_insegnamenti_docente, conta_esami_insegnamenti, check_esami_minimi

fetch_bp = Blueprint('fetch', __name__)

# Funzione utilitaria per verificare se l'utente corrente è un amministratore
def is_admin():
    try:
        user_data = get_user_data().get_json()
        return user_data['authenticated'] and user_data['user_data'] and user_data['user_data'].get('permessi_admin', False)
    except Exception:
        return False

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
      cursor.execute("SELECT nome FROM aule ORDER BY nome")
      tutte_aule = [row[0] for row in cursor.fetchall()]
      
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
      aule_disponibili = [aula for aula in tutte_aule if aula not in aule_occupate]
      
      # Formato per la risposta
      aule = [{"nome": nome_aula} for nome_aula in aule_disponibili]
    else:
      # Se non sono specificate data e periodo, restituisci tutte le aule
      cursor.execute("SELECT nome FROM aule ORDER BY nome")
      aule = [{"nome": row[0]} for row in cursor.fetchall()]
    
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
        anno = request.args.get('anno', None)
        insegnamenti = request.args.get('insegnamenti', None)
        cds = request.args.get('cds', None)
        
        is_admin_user = is_admin()
        
        if not docente:
            return jsonify({'status': 'error', 'message': 'Parametro docente mancante'}), 400

        current_date = datetime.now()
        planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1
        insegnamenti_docente_dict = ottieni_insegnamenti_docente(docente, planning_year)
        insegnamenti_docente = [data['codice'] for data in insegnamenti_docente_dict.values()]
        
        # Query base modificata: ora seleziona gli esami basati sugli insegnamenti invece che sul docente
        base_query = """
            SELECT e.id, e.descrizione, e.docente, 
                   concat(u.nome, ' ', u.cognome) as docente_nome,
                   i.codice as insegnamento, i.titolo as insegnamento_titolo,
                   e.aula, e.data_appello, e.ora_appello, e.durata_appello,
                   e.tipo_appello
            FROM esami e
            JOIN utenti u ON e.docente = u.username
            JOIN insegnamenti i ON e.insegnamento = i.id
            WHERE i.codice IN %s
        """
        
        params = [tuple(insegnamenti_docente)]
        
        # Se sono specificati degli insegnamenti, aggiungi la query unione come prima
        if insegnamenti:
            insegnamenti_list = insegnamenti.split(',')
            
            union_query = """
            UNION
            
            SELECT e.id, e.descrizione, e.docente, 
                   concat(u.nome, ' ', u.cognome) as docente_nome,
                   i.codice as insegnamento, i.titolo as insegnamento_titolo,
                   e.aula, e.data_appello, e.ora_appello, e.durata_appello,
                   e.tipo_appello
            FROM esami e
            JOIN utenti u ON e.docente = u.username
            JOIN insegnamenti i ON e.insegnamento = i.id
            WHERE e.insegnamento IN (
                SELECT ic1.insegnamento 
                FROM insegnamenti_cds ic1
                JOIN insegnamenti_cds ic2 ON 
                    ic1.anno_corso = ic2.anno_corso AND
                    ic1.anno_accademico = ic2.anno_accademico AND
                    ic1.cds = ic2.cds AND
                    ic1.curriculum = ic2.curriculum AND
                    (ic1.semestre = ic2.semestre 
                     OR ic1.semestre = 3 
                     OR ic2.semestre = 3)
                JOIN insegnamenti i2 ON ic2.insegnamento = i2.id
                WHERE i2.codice IN ({})
            )
            """.format(','.join(['%s'] * len(insegnamenti_list)))
            
            query = base_query + union_query
            params.extend(insegnamenti_list)
        else:
            query = base_query
            
        # Aggiungi filtri comuni opzionali
        filters = []
        filter_params = []
        
        if anno:
            filters.append("EXTRACT(YEAR FROM data_appello) = %s")
            filter_params.append(int(anno))
        
        if cds:
            filters.append("insegnamento IN (SELECT insegnamento FROM insegnamenti_cds WHERE cds = %s)")
            filter_params.append(cds)
        
        # Applica filtri alla query finale se ce ne sono
        if filters:
            # Poiché abbiamo una UNION, dobbiamo usare una subquery
            query = f"SELECT * FROM ({query}) AS combined_results WHERE {' AND '.join(filters)}"
            params.extend(filter_params)
        
        # Ordina i risultati
        query += " ORDER BY data_appello, ora_appello"
        
        cursor.execute(query, tuple(params))
        
        # Formattazione dei risultati
        exams = []
        for row in cursor.fetchall():
            # Controlla se l'esame è di un insegnamento del docente
            esame_del_docente = row['insegnamento'] in insegnamenti_docente
            
            exams.append({
                'id': row['id'],
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
    if not user_data['authenticated'] or not user_data['user_data']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401

    docente = user_data['user_data']['username']

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
                SELECT tipo_periodo
                FROM periodi_esame
                WHERE cds = %s
                AND anno_accademico = %s
                AND %s::date BETWEEN inizio AND fine
            """, (codice_cds, planning_year, data_appello))
            
            tipo_periodo = None
            periodo_row = cursor.fetchone()
            if periodo_row:
                tipo_periodo = periodo_row[0]
            
            # Se tipo_periodo include "PAUSA", lo mappiamo come periodo speciale
            sessione = None
            if tipo_periodo:
                if "PAUSA" in tipo_periodo:
                    sessione = "Pausa Didattica"
                else:
                    sessione = tipo_periodo.capitalize()
            
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
                        'Invernale': 0,
                        'Pausa Didattica': 0
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
                    'Invernale': 0,
                    'Pausa Didattica': 0
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
@fetch_bp.route('/api/getDateValide', methods=['GET'])
def getDateValide():
  try:
    docente = request.args.get('docente')
    insegnamenti = request.args.get('insegnamenti')
    
    is_admin_user = is_admin()
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
    print(f"Errore generale in getDateValide: {str(e)}")
    return jsonify({'error': str(e)}), 500

@fetch_bp.route('/api/getAnniAccademici', methods=['GET'])
def getAnniAccademici():
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
@fetch_bp.route('/api/getInsegnamentiDocente', methods=['GET'])
def getInsegnamentiDocente():
    docente = request.args.get('docente')
    anno = request.args.get('anno')
    
    # Controlla se l'utente ha fornito un parametro docente valido
    if not docente:
        return jsonify({"error": "Parametro docente mancante"}), 400
    
    # Verifica che l'anno sia valido, altrimenti usa l'anno corrente
    if not anno or not anno.isdigit():
        current_date = datetime.now()
        anno = current_date.year if current_date.month >= 9 else current_date.year - 1
    else:
        anno = int(anno)
    
    # Verifica se l'utente è un amministratore direttamente qui
    is_admin_user = is_admin()
    
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Se l'utente è un admin, ottiene tutti gli insegnamenti
        if is_admin_user:
            cursor.execute("""
                SELECT DISTINCT ON (i.codice)
                    i.codice, 
                    i.titolo, 
                    ic.semestre, 
                    ic.anno_corso, 
                    ic.cds, 
                    c.nome_corso
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice 
                     AND ic.anno_accademico = c.anno_accademico 
                     AND ic.curriculum = c.curriculum
                WHERE ic.anno_accademico = %s
                AND (ic.padri_mutua IS NULL OR NOT (i.codice = ANY(ic.padri_mutua)))
                ORDER BY i.codice, i.titolo
            """, (anno,))
            result = cursor.fetchall()
        else:
            # Otteniamo gli insegnamenti del docente usando la funzione ottieni_insegnamenti_docente
            # che già implementa la logica per escludere mutuazioni e moduli
            insegnamenti_docente_dict = ottieni_insegnamenti_docente(docente, anno)
            
            # Se non ci sono insegnamenti, restituisci una lista vuota
            if not insegnamenti_docente_dict:
                return jsonify({'cds': []}), 200
                
            # Ottieni i codici degli insegnamenti
            codici_insegnamenti = [data['codice'] for data in insegnamenti_docente_dict.values()]
            placeholders = ','.join(['%s'] * len(codici_insegnamenti))
            
            # Recupera i dettagli completi degli insegnamenti
            cursor.execute(f"""
                SELECT DISTINCT ON (i.codice)
                    i.codice, 
                    i.titolo, 
                    ic.semestre, 
                    ic.anno_corso, 
                    ic.cds, 
                    c.nome_corso
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice 
                     AND ic.anno_accademico = c.anno_accademico 
                     AND ic.curriculum = c.curriculum
                WHERE ic.anno_accademico = %s
                AND i.codice IN ({placeholders})
                AND (ic.padri_mutua IS NULL OR NOT (i.codice = ANY(ic.padri_mutua)))
                ORDER BY i.codice, i.titolo
            """, (anno, *codici_insegnamenti))
            
            result = cursor.fetchall()
        
        # Organizzo gli insegnamenti per CdS
        cds_dict = {}
        
        for row in result:
            codice_ins, titolo, semestre, anno_corso, codice_cds, nome_cds = row
            
            # Se il CdS non è ancora nel dizionario, crealo
            if codice_cds not in cds_dict:
                cds_dict[codice_cds] = {
                    "codice": codice_cds,
                    "nome": nome_cds,
                    "insegnamenti": []
                }
            
            # Aggiungi l'insegnamento alla lista del CdS corrispondente
            cds_dict[codice_cds]["insegnamenti"].append({
                "codice": codice_ins,
                "titolo": titolo,
                "semestre": semestre,
                "anno_corso": anno_corso
            })
        
        # Converti il dizionario in una lista di CdS
        cds_list = list(cds_dict.values())
        
        # Prepara la risposta nel formato gerarchico
        response = {
            "cds": cds_list
        }
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

# API per controllare gli insegnamenti con meno del numero minimo di esami
@fetch_bp.route('/api/checkEsamiMinimi', methods=['GET'])
def check_esami_minimi_endpoint():
    # Ottenimento dati utente e verifica
    user_data = get_user_data().get_json()
    
    # Usa la funzione spostata in insegnamentiList.py
    return check_esami_minimi(user_data)