from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from datetime import datetime
from auth import get_user_data
from psycopg2.extras import DictCursor

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
        solo_docente = request.args.get('solo_docente', 'false').lower() == 'true'
        
        # Verifica se l'utente è effettivamente un admin
        is_admin_user = is_admin()
        
        if not docente:
            return jsonify({'status': 'error', 'message': 'Parametro docente mancante'}), 400

        # Ottieni gli insegnamenti del docente per l'anno accademico corrente
        cursor.execute("""
            SELECT codice 
            FROM insegnamenti
            JOIN insegnamento_docente ON insegnamenti.id = insegnamento_docente.insegnamento
            WHERE docente = %s 
            AND annoaccademico = date_part('year', CURRENT_DATE) - 
                CASE WHEN date_part('month', CURRENT_DATE) >= 9 THEN 0 ELSE 1 END
        """, (docente,))
        
        insegnamenti_docente = [row[0] for row in cursor.fetchall()]
        
        # Costruisci la query di base
        query = """
            SELECT e.id, e.descrizione, e.docente, 
                   concat(u.nome, ' ', u.cognome) as docente_nome,
                   i.codice as insegnamento, i.titolo as insegnamento_titolo,
                   e.aula, e.data_appello, e.ora_appello, e.durata_appello,
                   e.tipo_appello
            FROM esami e
            JOIN utenti u ON e.docente = u.username
            JOIN insegnamenti i ON e.insegnamento = i.id
            WHERE 1=1
        """
        
        params = []
        
        # Aggiungi filtri opzionali
        if anno:
            query += " AND EXTRACT(YEAR FROM e.data_appello) = %s"
            params.append(int(anno))
        
        if insegnamenti:
            insegnamenti_list = insegnamenti.split(',')
            query += " AND e.insegnamento IN ({})".format(','.join(['%s'] * len(insegnamenti_list)))
            params.extend(insegnamenti_list)
        
        if cds:
            query += " AND e.insegnamento IN (SELECT insegnamento FROM insegnamenti_cds WHERE cds = %s)"
            params.append(cds)
        
        if solo_docente and not is_admin_user:
            query += " AND e.docente = %s"
            params.append(docente)
        
        query += " ORDER BY e.data_appello, e.ora_appello"
        
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

# API per ottenere gli esami di un docente. Usato in mieiEsami.html
@fetch_bp.route('/api/getMieiEsamiInsegnamenti', methods=['GET'])
def miei_esami():
    # Ottieni i dati dell'utente usando la nuova funzione
    user_data = get_user_data().get_json()
    if not user_data['authenticated'] or not user_data['user_data']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401

    docente = user_data['user_data']['username']

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        current_date = datetime.now()
        planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1

        # Prima otteniamo tutti gli insegnamenti del docente
        cursor.execute("""
            SELECT i.codice, i.titolo
            FROM insegnamenti i
            JOIN insegnamento_docente id ON i.id = id.insegnamento
            WHERE id.docente = %s
            AND id.annoaccademico = %s
        """, (docente, planning_year))
        
        insegnamenti_docente = {row[0]: row[1] for row in cursor.fetchall()}
        
        # Poi otteniamo gli esami pianificati
        cursor.execute("""
          WITH esami_unici AS (
            SELECT DISTINCT ON (e.insegnamento, e.data_appello, e.periodo)
                   e.docente, i.titolo, e.aula, e.data_appello, e.ora_appello,
                   c.codice as codice_cds, c.nome_corso as nome_cds,
                   a.edificio, e.durata_appello, i.codice as codice_insegnamento
            FROM esami e
            JOIN insegnamenti i ON e.insegnamento = i.id
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum = c.curriculum
            LEFT JOIN aule a ON e.aula = a.nome
            WHERE e.docente = %s 
            AND ic.anno_accademico = %s
            ORDER BY e.insegnamento, e.data_appello, e.periodo, e.data_appello
          )
          SELECT * FROM esami_unici
          ORDER BY data_appello
        """, (docente, planning_year))
        
        rows = cursor.fetchall()
        esami = []
        insegnamenti_with_esami = {}
        
        for row in rows:
            # Estrai i dati base dell'esame
            docente, titolo, aula, data_appello, ora = row[:5]
            # Estrai le informazioni aggiuntive
            codice_cds, nome_cds, edificio, durata_appello, codice_insegnamento = row[5:10]
            
            # Formatta l'edificio come sigla se presente
            aula_completa = f"{aula} ({edificio})" if edificio else aula
            
            # Determina la sessione a cui appartiene l'esame
            cursor.execute("""
                SELECT tipo_periodo
                FROM periodi_esame
                WHERE cds = %s
                AND anno_accademico = %s
                AND %s BETWEEN inizio AND fine
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
            
            # Formatta l'esame
            exam = {
                'docente': docente,
                'insegnamento': titolo,
                'aula': aula_completa,
                'data': data_appello.strftime("%d/%m/%Y"),
                'ora': ora.strftime("%H:%M") if ora else "00:00",
                'dataora': f"{data_appello.isoformat()}T{ora.isoformat() if ora else '00:00:00'}",
                'cds': nome_cds,
                'codice_cds': codice_cds,
                'durata_appello': durata_appello
            }
            esami.append(exam)
            
            # Aggiorna il conteggio delle sessioni
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
        for codice, titolo in insegnamenti_docente.items():
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
    anno = request.args.get('anno')
    docente = request.args.get('docente')
    cds = request.args.get('cds')  # Filtro per CdS
    search = request.args.get('search')  # Aggiunto supporto per ricerca testuale
    
    # Verifica se l'utente è effettivamente un admin
    is_admin_user = is_admin()
    
    # Usa l'anno corrente se non specificato
    if not anno:
        current_date = datetime.now()
        anno = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    # Verifica se sono forniti parametri necessari
    if not docente and not is_admin_user:
        return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query modificata per escludere correttamente sia insegnamenti mutuati che moduli
        query = """
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
                    i.titolo, 
                    ic.semestre, 
                    ic.anno_corso, 
                    ic.cds, 
                    c.nome_corso, 
                    ic.curriculum,
                    ic.is_mutuato,
                    ic.is_modulo,
                    ic.padri_mutua,
                    ic.padre_modulo,
                    -- Facciamo in modo che sia selezionato come primo l'insegnamento con docente corrispondente
                    CASE WHEN id.docente = %s THEN 0 ELSE 1 END as priorita
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice 
                     AND ic.anno_accademico = c.anno_accademico 
                     AND ic.curriculum = c.curriculum
                JOIN insegnamento_docente id ON i.id = id.insegnamento
                WHERE ic.anno_accademico = %s
                AND id.annoaccademico = %s
                AND (
                    -- Se è admin o se è il docente stesso
                    %s OR id.docente = %s
                )
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
            -- Selezioniamo i risultati finali applicando i filtri richiesti
            SELECT DISTINCT ON (codice)
                codice, titolo, semestre, anno_corso, cds, nome_corso
            FROM insegnamenti_filtrati
            -- Ordina prima per codice e poi per priorità (dando precedenza agli insegnamenti del docente)
            ORDER BY codice, priorita
        """
        params = [docente, anno, docente, anno, anno, is_admin_user, docente]
        
        # Aggiungi filtro per CdS se specificato
        if cds:
            query += " AND cds = %s"
            params.append(cds)
        
        # Aggiungi filtro per ricerca testuale
        if search:
            query += " AND titolo ILIKE %s"
            params.append(f"%{search}%")
        
        cursor.execute(query, tuple(params))
        result = cursor.fetchall()
        
        # Organizzo gli insegnamenti per CdS
        cds_dict = {}
        for row in result:
            codice_ins, titolo, semestre, anno_corso, codice_cds, nome_cds = row
            
            # Crea la struttura del CdS se non esiste
            if codice_cds not in cds_dict:
                cds_dict[codice_cds] = {
                    'codice': codice_cds,
                    'nome': nome_cds,
                    'insegnamenti': []
                }
            
            # Aggiungi l'insegnamento al CdS solo se non è già presente in un altro CdS
            # Facciamo un controllo esplicito per evitare duplicati
            already_added = False
            for existing_cds in cds_dict.values():
                if any(ins['codice'] == codice_ins for ins in existing_cds['insegnamenti']):
                    already_added = True
                    break
            
            if not already_added:
                cds_dict[codice_cds]['insegnamenti'].append({
                    'codice': codice_ins,
                    'titolo': titolo,
                    'semestre': semestre,
                    'anno_corso': anno_corso
                })
        
        # Trasforma il dizionario in lista e ordina i CdS per nome
        cds_list = sorted(list(cds_dict.values()), key=lambda x: x['nome'])
        
        # Rimuovi CdS senza insegnamenti dopo il filtraggio
        cds_list = [cds_item for cds_item in cds_list if cds_item['insegnamenti']]
        
        # Per ogni CdS, ordina gli insegnamenti per titolo
        for cds_item in cds_list:
            cds_item['insegnamenti'].sort(key=lambda x: x['titolo'])
        
        return jsonify({
            'cds': cds_list
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)