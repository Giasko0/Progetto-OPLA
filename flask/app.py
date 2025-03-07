# ===== Imports e configurazione =====
from flask import Flask, render_template, request, jsonify, redirect, make_response, session
from psycopg2 import sql
from datetime import datetime, timedelta
import os
# Config DB
from db import get_db_connection
# Funzioni per la gestione delle date/sessioni
from utils.sessions import get_session_for_date, get_valid_years
# Auth stupida e SAML
from auth import auth_bp
from saml_auth import saml_bp, require_auth
# Backend OH-ISSA
from admin import admin_bp

# app = Flask(__name__, static_url_path='/flask')
app = Flask(__name__)
# Chiave super segreta per SAML, TODO: Capire perché
app.config['SECRET_KEY'] = os.urandom(24)
app.register_blueprint(auth_bp)
app.register_blueprint(saml_bp)
app.register_blueprint(admin_bp)

# Metodo popo rozzo pe non usa saml
app.config['SAML_ENABLED'] = False

# ===== Routes =====
@app.route('/flask')
def home():
  return render_template("index.html")

@app.route('/flask/mieiEsami')
@require_auth
def mieiEsami():
    if app.config['SAML_ENABLED']:
        username = session.get('saml_nameid')
    else:
        username = request.cookies.get('username')
    if not username:
        return redirect('/flask/login')
    return render_template("mieiEsami.html")

# ===== API Gestione Esami =====
@app.route('/flask/api/inserisciEsame', methods=['POST'])
def inserisciEsame():
  """API per inserire un nuovo esame"""
  conn = None
  try:
    # Raccogli i dati dal form
    data = request.form
    docente = data.get('docente')
    
    # Gestione di insegnamenti multipli
    insegnamenti = request.form.getlist('insegnamento')
    if not insegnamenti:
      return jsonify({'status': 'error', 'message': 'Nessun insegnamento selezionato'}), 400
    
    aula = data.get('aula')
    data_appello = data.get('dataora')
    ora_appello = data.get('ora')
    durata_appello = data.get('durata')
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    tipo_esame = data.get('tipoEsame')
    verbalizzazione = data.get('verbalizzazione', 'STD')  # Default: Standard
    note_appello = data.get('note')
    posti = data.get('posti')
    anno_accademico = data.get('anno_accademico')  # Nuovo campo
    # Converti ora_appello in intero per il confronto
    ora_int = int(ora_appello.split(':')[0])
    periodo = 1 if ora_int > 13 else 0

    # Campi obbligatori
    if not all([docente, aula, data_appello, ora_appello]):
      return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400

    # Validazione ora appello
    try:
      ora_parts = ora_appello.split(':')
      ora_int = int(ora_parts[0])
      if ora_int < 8 or ora_int > 23:
        return jsonify({'status': 'error', 'message': 'L\'ora dell\'appello deve essere compresa tra le 08:00 e le 23:00'}), 400
    except (ValueError, IndexError):
      return jsonify({'status': 'error', 'message': 'Formato ora non valido'}), 400

    # Converti ora_appello in intero per il confronto
    periodo = 1 if ora_int > 13 else 0

    # Valori standard per i campi mancanti
    tipo_appello = 'PF'
    definizione_appello = 'STD'
    gestione_prenotazione = 'STD'
    riservato = False  # 0 in SQL
    tipo_iscrizione = 'STD'
    
    # Gestione tipo_esame - Se è vuoto impostiamo NULL
    if not tipo_esame or tipo_esame.strip() == '':
      tipo_esame = None
    
    # Converti posti in intero se presente
    if posti:
      try:
        posti = int(posti)
      except ValueError:
        posti = None
    else:
      posti = None

    # Verifica che l'anno sia valido
    data_esame = datetime.fromisoformat(data_appello)
    anno_valido_inizio, anno_valido_fine = get_valid_years()
    
    if not (anno_valido_inizio <= data_esame.year <= anno_valido_fine):
      return jsonify({
        'status': 'error',
        'message': f'È possibile inserire esami solo per gli anni {anno_valido_inizio}-{anno_valido_fine}'
      }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    # Lista per tenere traccia degli esami inseriti
    esami_inseriti = []
    errori = []

    # Ciclo su tutti gli insegnamenti selezionati
    for insegnamento in insegnamenti:
      try:
        # Ottieni le informazioni del CDS dall'insegnamento per l'anno corrente
        cursor.execute("""
          SELECT ic.cds, ic.anno_accademico 
          FROM insegnamenti_cds ic
          JOIN insegna i ON ic.insegnamento = i.insegnamento 
            AND ic.anno_accademico = i.annoaccademico
          WHERE ic.insegnamento = %s 
            AND i.docente = %s 
            AND i.annoaccademico = %s
        """, (insegnamento, docente, anno_accademico))
        
        cds_info = cursor.fetchone()
        if not cds_info:
          errori.append(f"Insegnamento {insegnamento} non trovato")
          continue
        
        cds_code, anno_acc = cds_info

        # Verifica limite esami per sessione
        sessione_info = get_session_for_date(data_esame, cds_code, anno_acc)
        if not sessione_info:
          errori.append(f"La data selezionata non rientra in nessuna sessione d'esame valida per {insegnamento}")
          continue

        sessione, limite_max, data_inizio_sessione = sessione_info

        # Imposta valori predefiniti per i campi obbligatori
        if not inizio_iscrizione:
          inizio_iscrizione = data_inizio_sessione - timedelta(days=20)
        if not fine_iscrizione:
          fine_iscrizione = data_esame - timedelta(days=1)

        # Conta esami nella stessa sessione
        cursor.execute("""
          SELECT COUNT(*) 
          FROM esami e
          JOIN insegnamenti i ON e.insegnamento = i.codice
          JOIN cds c ON c.codice = %s AND c.anno_accademico = %s
          WHERE e.docente = %s 
          AND e.insegnamento = %s
          AND (
            CASE %s
              WHEN 'Anticipata' THEN e.data_appello BETWEEN c.inizio_sessione_anticipata AND c.fine_sessione_anticipata
              WHEN 'Estiva' THEN e.data_appello BETWEEN c.inizio_sessione_estiva AND c.fine_sessione_estiva
              WHEN 'Autunnale' THEN e.data_appello BETWEEN c.inizio_sessione_autunnale AND c.fine_sessione_autunnale
              WHEN 'Invernale' THEN e.data_appello BETWEEN c.inizio_sessione_invernale AND c.fine_sessione_invernale
            END
          )
        """, (cds_code, anno_acc, docente, insegnamento, sessione))

        if cursor.fetchone()[0] >= limite_max:
          errori.append(f"Limite di {limite_max} esami per l'insegnamento {insegnamento} nella sessione {sessione} raggiunto")
          continue

        # Verifica vincolo dei 14 giorni
        data_min = data_esame - timedelta(days=14)
        data_max = data_esame + timedelta(days=14)
        
        cursor.execute("""
          SELECT data_appello FROM esami 
          WHERE insegnamento = %s AND data_appello BETWEEN %s AND %s
        """, (insegnamento, data_min, data_max))
        
        esami_vicini = cursor.fetchall()
        if esami_vicini:
          date_esami = [e[0].strftime('%d/%m/%Y') for e in esami_vicini]
          errori.append(f"Non puoi inserire esami a meno di 14 giorni di distanza per {insegnamento}. Hai già esami nelle date: {', '.join(date_esami)}")
          continue

        # Inserimento nel database
        cursor.execute(
          """INSERT INTO esami 
             (docente, insegnamento, aula, data_appello, ora_appello, 
              data_inizio_iscrizione, data_fine_iscrizione, 
              tipo_esame, verbalizzazione, note_appello, posti,
              tipo_appello, definizione_appello, gestione_prenotazione, 
              riservato, tipo_iscrizione, periodo, durata_appello)
             VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          (docente, insegnamento, aula, data_appello, ora_appello, 
           inizio_iscrizione, fine_iscrizione, 
           tipo_esame, verbalizzazione, note_appello, posti,
           tipo_appello, definizione_appello, gestione_prenotazione,
           riservato, tipo_iscrizione, periodo, durata_appello)
        )
        esami_inseriti.append(insegnamento)
      except Exception as e:
        errori.append(f"Errore nell'inserimento dell'esame per {insegnamento}: {str(e)}")
        # Non facciamo rollback qui per consentire a altri esami di essere inseriti

    # Verifica aule/giorni/periodo - facciamo questa verifica una sola volta per tutti gli esami
    cursor.execute("""
      SELECT COUNT(*) FROM esami 
      WHERE data_appello = %s AND aula = %s AND periodo = %s
    """, (data_appello, aula, periodo))
    if cursor.fetchone()[0] > len(esami_inseriti):
      # C'è un conflitto con altre prenotazioni (oltre quelle che abbiamo appena inserito)
      if esami_inseriti:
        # Se abbiamo inserito alcuni esami, facciamo rollback per liberare l'aula
        conn.rollback()
        return jsonify({'status': 'error', 'message': 'Aula già occupata in questo periodo'}), 400
    
    # Se non ci sono esami inseriti, significa che tutti gli insegnamenti hanno avuto problemi
    if not esami_inseriti:
      return jsonify({'status': 'error', 'message': 'Nessun esame inserito', 'errors': errori}), 400
    
    # Commit delle modifiche se è stato inserito almeno un esame
    conn.commit()
    
    # Se ci sono stati alcuni errori ma almeno un esame è stato inserito, restituisci avviso
    if errori:
      return jsonify({'status': 'partial', 'message': 'Alcuni esami sono stati inseriti con successo', 
                     'inserted': esami_inseriti, 'errors': errori}), 207
    
    return jsonify({'status': 'success', 'message': 'Tutti gli esami sono stati inseriti con successo'}), 200

  except Exception as e:
    if conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if conn:
      cursor.close()
      conn.close()

# API per ottenere gli insegnamenti di un docente. Usato in formEsame.html
@app.route('/flask/api/ottieniInsegnamenti', methods=['GET'])
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
@app.route('/flask/api/ottieniAule', methods=['GET'])
def ottieniAule():
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nome FROM aule")
    aule = [row[0] for row in cursor.fetchall()]
    return jsonify(aule)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    cursor.close()
    conn.close()

# API per ottenere tutti gli esami. Usato per gli eventi del calendario
@app.route('/flask/api/getEsami', methods=['GET'])
def getEsami():
    # Parametri di input
    show_all = request.args.get('all', 'false').lower() == 'true'
    anno = request.args.get('anno')
    insegnamenti = [ins for ins in request.args.get('insegnamenti', '').split(',') if ins]
    docente = request.args.get('docente')
    solo_docente = request.args.get('solo_docente', 'false').lower() == 'true'
    
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
                JOIN docenti d ON e.docente = d.username
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
                JOIN docenti d ON e.docente = d.username
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
            # Query per mostrare gli esami filtrati per anno/semestre degli insegnamenti selezionati
            query = """
                WITH anno_semestre_selezionati AS (
                    -- Ottieni tutte le combinazioni anno_corso/semestre degli insegnamenti selezionati
                    SELECT DISTINCT ic.anno_corso, ic.semestre
                    FROM insegnamenti_cds ic
                    WHERE ic.anno_accademico = %s
                    AND ic.insegnamento IN ({})
                )
                SELECT DISTINCT ON (e.insegnamento, e.data_appello, e.periodo)
                    d.username, d.nome, d.cognome, i.titolo, e.aula, 
                    e.data_appello, e.ora_appello, e.tipo_esame, ic.anno_corso, 
                    e.periodo, ic.semestre, ic.anno_accademico
                FROM esami e
                JOIN docenti d ON e.docente = d.username
                JOIN insegnamenti i ON e.insegnamento = i.codice
                JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento
                    AND ic.anno_accademico = %s
                -- JOIN con le combinazioni di anno/semestre degli insegnamenti selezionati
                JOIN anno_semestre_selezionati ase ON ic.anno_corso = ase.anno_corso 
                    AND ic.semestre = ase.semestre
                JOIN insegna ins ON e.insegnamento = ins.insegnamento 
                    AND ins.annoaccademico = ic.anno_accademico
                WHERE 1=1
            """.format(','.join(['%s'] * len(insegnamenti)))
            
            params = [planning_year] + insegnamenti + [planning_year]
            
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

# Funzione di debug per stampare tutti gli esami
# @app.route('/flask/api/getAllExams', methods=['GET'])
# def getAllExams():
#    ...

# API per ottenere gli esami di un docente. Usato in mieiEsami.html
@app.route('/flask/api/mieiEsami', methods=['GET'])
def miei_esami():
  # Check SAML-non-SAML
  if app.config['SAML_ENABLED']:
    docente = session.get('saml_nameid')
  else:
    docente = request.cookies.get('username')

  if not docente:
    return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401

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
               c.inizio_sessione_invernale, c.fine_sessione_invernale
        FROM esami e
        JOIN insegnamenti i ON e.insegnamento = i.codice
        JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento
        JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico
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
      date_sessioni = row[5:]
      
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
        'aula': aula,
        'data': data_appello.strftime("%d/%m/%Y"),
        'ora': ora.strftime("%H:%M") if ora else "00:00",
        'dataora': f"{data_appello.isoformat()}T{ora.isoformat() if ora else '00:00:00'}"
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
@app.route('/flask/api/ottieniSessioni', methods=['GET'])
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

@app.route('/flask/api/getAnniAccademici', methods=['GET'])
def getAnniAccademici():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT anno_accademico FROM cds ORDER BY anno_accademico DESC")
        anni = [row[0] for row in cursor.fetchall()]
        return jsonify(anni)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/flask/api/getInsegnamentiDocente', methods=['GET'])
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

# ===== Main =====
if __name__ == '__main__':
    app.config['DEBUG'] = True 
    app.run(host='0.0.0.0')
