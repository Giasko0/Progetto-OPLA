from flask import Blueprint, request, jsonify, session
from db import get_db_connection
from datetime import datetime
from utils.sessions import get_valid_years
from auth import get_user_data

fetch_bp = Blueprint('fetch', __name__)

# API per ottenere gli insegnamenti di un docente. Usato in formEsame.html
@fetch_bp.route('/api/ottieniInsegnamenti', methods=['GET'])
def ottieniInsegnamenti():
  username = request.args.get('username')
  search = request.args.get('search')
  codici = request.args.get('codici')
  
  if not username:
    return jsonify({'status': 'error', 'message': 'Username mancante'}), 400
  
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    current_date = datetime.now()
    planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1
    
    # Query base
    query = """
      SELECT DISTINCT i.codice, i.titolo 
      FROM insegnamenti i 
      JOIN insegna ins ON i.codice = ins.insegnamento 
      WHERE ins.docente = %s 
      AND ins.annoaccademico = %s
    """
    params = [username, planning_year]
    
    # Se è specificato un termine di ricerca, aggiungi la condizione
    if search:
      query += " AND i.titolo ILIKE %s"
      params.append(f"%{search}%")
    
    # Se sono specificati dei codici, aggiungi la condizione
    if codici:
      codici_list = codici.split(',')
      placeholders = ', '.join(['%s'] * len(codici_list))
      query += f" AND i.codice IN ({placeholders})"
      params.extend(codici_list)
    
    cursor.execute(query, params)
    
    insegnamenti = [{'codice': row[0], 'titolo': row[1]} for row in cursor.fetchall()]
    return jsonify(insegnamenti)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    cursor.close()
    conn.close()

# API per ottenere le aule disponibili. Usato in formEsame.html
@fetch_bp.route('/api/ottieniAule', methods=['GET'])
def ottieniAule():
  data = request.args.get('data')
  periodo = request.args.get('periodo')  # 0 per mattina, 1 per pomeriggio
  
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if data and periodo is not None:
      # Recupera solo le aule disponibili nella data e periodo specificati
      cursor.execute("""
        SELECT DISTINCT a.nome 
        FROM aule a
        WHERE NOT EXISTS (
          SELECT 1 FROM esami e
          WHERE e.aula = a.nome
          AND e.data_appello = %s
          AND e.periodo = %s
        )
        ORDER BY a.nome
      """, (data, periodo))
    else:
      # Se non sono specificate data e periodo, restituisci tutte le aule
      cursor.execute("SELECT nome FROM aule ORDER BY nome")
      
    aule = [row[0] for row in cursor.fetchall()]
    return jsonify(aule)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    cursor.close()
    conn.close()

# API per ottenere tutti gli esami. Usato per gli eventi del calendario
@fetch_bp.route('/api/getEsami', methods=['GET'])
def getEsami():
    # Parametri di input
    show_all = request.args.get('all', 'false').lower() == 'true'
    anno = request.args.get('anno')
    insegnamenti = [ins for ins in request.args.get('insegnamenti', '').split(',') if ins]
    docente = request.args.get('docente')
    solo_docente = request.args.get('solo_docente', 'false').lower() == 'true'
    
    # Parametri aggiuntivi per il filtraggio
    anni_corso_filtro = request.args.get('anni_corso')
    semestri_filtro = request.args.get('semestri')
    cds_filtro = request.args.get('cds')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        current_date = datetime.now()
        planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1

        if show_all:
            # Query per mostrare tutti gli esami (debug mode)
            query = """
                SELECT DISTINCT ON (e.insegnamento, e.data_appello, e.periodo)
                    d.username, d.nome, d.cognome, i.titolo, e.aula, 
                    e.data_appello, e.ora_appello, e.tipo_esame, ic.anno_corso, 
                    e.periodo, ic.semestre, ic.anno_accademico
                FROM esami e
                JOIN utenti d ON e.docente = d.username
                JOIN insegnamenti i ON e.insegnamento = i.codice
                JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento
                WHERE ic.anno_accademico = %s
                ORDER BY e.insegnamento, e.data_appello, e.periodo, e.data_appello
            """
            cursor.execute(query, (planning_year,))
        
        elif solo_docente or not insegnamenti:
            # Query per mostrare solo gli esami del docente loggato
            query = """
                SELECT DISTINCT ON (e.insegnamento, e.data_appello, e.periodo)
                    d.username, d.nome, d.cognome, i.titolo, e.aula, 
                    e.data_appello, e.ora_appello, e.tipo_esame, ic.anno_corso, 
                    e.periodo, ic.semestre, ic.anno_accademico
                FROM esami e
                JOIN utenti d ON e.docente = d.username
                JOIN insegnamenti i ON e.insegnamento = i.codice
                JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento 
                    AND ic.anno_accademico = %s
                JOIN insegna ins ON e.insegnamento = ins.insegnamento 
                    AND ins.annoaccademico = ic.anno_accademico
                WHERE e.docente = %s
            """
            params = [planning_year, docente]
            
            if anno:
                query += " AND ins.annoaccademico = %s"
                params.append(int(anno))
                
            query += " ORDER BY e.insegnamento, e.data_appello, e.periodo, e.data_appello"
            cursor.execute(query, tuple(params))
            
        else:
            # Query per mostrare gli esami filtrati per anno/semestre/cds degli insegnamenti selezionati
            query = """
                WITH parametri_selezionati AS (
                    -- Ottieni tutte le combinazioni anno_corso/semestre/cds degli insegnamenti selezionati
                    SELECT DISTINCT ic.anno_corso, ic.semestre, ic.cds
                    FROM insegnamenti_cds ic
                    WHERE ic.anno_accademico = %s
                    AND ic.insegnamento IN ({})
                )
                SELECT DISTINCT ON (e.insegnamento, e.data_appello, e.periodo)
                    d.username, d.nome, d.cognome, i.titolo, e.aula, 
                    e.data_appello, e.ora_appello, e.tipo_esame, ic.anno_corso, 
                    e.periodo, ic.semestre, ic.anno_accademico
                FROM esami e
                JOIN utenti d ON e.docente = d.username
                JOIN insegnamenti i ON e.insegnamento = i.codice
                JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento
                    AND ic.anno_accademico = %s
                -- JOIN con le combinazioni di anno/semestre/cds degli insegnamenti selezionati
                JOIN parametri_selezionati ps ON ic.anno_corso = ps.anno_corso 
                    AND ic.semestre = ps.semestre
                    AND ic.cds = ps.cds
                JOIN insegna ins ON e.insegnamento = ins.insegnamento 
                    AND ins.annoaccademico = ic.anno_accademico
                WHERE 1=1
            """.format(','.join(['%s'] * len(insegnamenti)))
            
            params = [planning_year] + insegnamenti + [planning_year]
            
            # Aggiungi filtri aggiuntivi se specificati
            if anno:
                query += " AND ins.annoaccademico = %s"
                params.append(int(anno))
                
            query += " ORDER BY e.insegnamento, e.data_appello, e.periodo, e.data_appello"
            cursor.execute(query, tuple(params))

        # Formattazione dei risultati
        exams = [{
            'id': idx,
            'title': f"{row[3]} - {row[2]}" + (f" ({row[11]}/{row[11]+1})" if show_all else ""),
            'aula': row[4],
            'start': f"{row[5].isoformat()}T{row[6]}" if row[6] else row[5].isoformat(),
            'description': f"Tipo: {row[7] or 'Non specificato'}\nAula: {row[4]}\nAnno: {row[8]}\nPeriodo: {'Mattina' if row[9] == 0 else 'Pomeriggio'}",
            'allDay': False,
            'docente': row[0],
            'periodo': row[9],
            'annoCorso': row[8],
            'semestre': row[10],
            'annoAccademico': row[11]
        } for idx, row in enumerate(cursor.fetchall())]
        
        return jsonify(exams)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

# API per ottenere gli esami di un docente. Usato in mieiEsami.html
@fetch_bp.route('/api/mieiEsami', methods=['GET'])
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

        cursor.execute("""
          WITH esami_unici AS (
            SELECT DISTINCT ON (e.insegnamento, e.data_appello, e.periodo)
                   e.docente, i.titolo, e.aula, e.data_appello, e.ora_appello,
                   c.inizio_sessione_anticipata, c.fine_sessione_anticipata,
                   c.inizio_sessione_estiva, c.fine_sessione_estiva,
                   c.inizio_sessione_autunnale, c.fine_sessione_autunnale,
                   c.inizio_sessione_invernale, c.fine_sessione_invernale,
                   c.nome_corso as nome_cds, c.codice as codice_cds,
                   a.edificio
            FROM esami e
            JOIN insegnamenti i ON e.insegnamento = i.codice
            JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento
            JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico
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
        insegnamenti = {}
        
        for row in rows:
          # Estrai i dati base dell'esame
          docente, titolo, aula, data_appello, ora = row[:5]
          # Estrai le date delle sessioni
          date_sessioni = row[5:13]
          # Estrai le informazioni aggiuntive
          nome_cds, codice_cds, edificio = row[13:]
          
          # Formatta l'edificio come sigla se presente
          aula_completa = f"{aula} ({edificio})" if edificio else aula
          
          # Determina la sessione in base alle date
          sessione = None
          if data_appello >= date_sessioni[0] and data_appello <= date_sessioni[1]:
            sessione = 'Anticipata'
          elif data_appello >= date_sessioni[2] and data_appello <= date_sessioni[3]:
            sessione = 'Estiva'
          elif data_appello >= date_sessioni[4] and data_appello <= date_sessioni[5]:
            sessione = 'Autunnale'
          elif data_appello >= date_sessioni[6] and data_appello <= date_sessioni[7]:
            sessione = 'Invernale'
          
          # Formatta l'esame
          exam = {
            'docente': docente,
            'insegnamento': titolo,
            'aula': aula_completa,
            'data': data_appello.strftime("%d/%m/%Y"),
            'ora': ora.strftime("%H:%M") if ora else "00:00",
            'dataora': f"{data_appello.isoformat()}T{ora.isoformat() if ora else '00:00:00'}",
            'cds': nome_cds,
            'codice_cds': codice_cds
          }
          esami.append(exam)
          
          # Aggiorna il conteggio delle sessioni
          if titolo not in insegnamenti:
            insegnamenti[titolo] = {
              'Anticipata': 0,
              'Estiva': 0,
              'Autunnale': 0,
              'Invernale': 0
            }
          if sessione:
            insegnamenti[titolo][sessione] += 1
        
        return jsonify({'esami': esami, 'insegnamenti': insegnamenti}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API per ottenere le date delle sessioni d'esame
@fetch_bp.route('/api/ottieniSessioni', methods=['GET'])
def ottieniSessioni():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        current_date = datetime.now()
        anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1

        cursor.execute("""
            SELECT 
                inizio_sessione_anticipata, fine_sessione_anticipata,
                inizio_sessione_estiva, fine_sessione_estiva,
                inizio_sessione_autunnale, fine_sessione_autunnale,
                inizio_sessione_invernale, fine_sessione_invernale,
                pausa_didattica_primo_inizio, pausa_didattica_primo_fine,
                pausa_didattica_secondo_inizio, pausa_didattica_secondo_fine
            FROM cds 
            WHERE anno_accademico = %s
        """, (anno_accademico,))
        
        result = cursor.fetchone()
        if result:
            return jsonify({
                'anticipata': {'start': result[0].isoformat(), 'end': result[1].isoformat()},
                'estiva': {'start': result[2].isoformat(), 'end': result[3].isoformat()},
                'autunnale': {'start': result[4].isoformat(), 'end': result[5].isoformat()},
                'invernale': {'start': result[6].isoformat(), 'end': result[7].isoformat()},
                'pausa_primo': {'start': result[8].isoformat(), 'end': result[9].isoformat()},
                'pausa_secondo': {'start': result[10].isoformat(), 'end': result[11].isoformat()}
            })
        return jsonify({'error': 'Nessuna sessione trovata'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

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
        cursor.close()
        conn.close()

@fetch_bp.route('/api/getInsegnamentiDocente', methods=['GET'])
def getInsegnamentiDocente():
    anno = request.args.get('anno')
    docente = request.args.get('docente')
    if not anno or not docente:
        return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            WITH insegnamenti_unici AS (
                SELECT DISTINCT ON (i.codice, ic.cds)
                       i.codice, i.titolo, ic.semestre, ic.anno_corso, ic.cds, c.nome_corso
                FROM insegnamenti i
                JOIN insegna ins ON i.codice = ins.insegnamento
                JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento 
                JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico
                WHERE ins.docente = %s 
                AND ins.annoaccademico = %s
                AND ic.anno_accademico = %s
                ORDER BY i.codice, ic.cds, ic.anno_accademico DESC
            )
            SELECT * FROM insegnamenti_unici
            ORDER BY nome_corso, titolo
        """, (docente, anno, anno))
        
        insegnamenti = [{'codice': row[0], 'titolo': row[1], 'semestre': row[2], 'anno_corso': row[3], 
                        'cds_codice': row[4], 'cds_nome': row[5]} 
                        for row in cursor.fetchall()]
        return jsonify(insegnamenti)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()
