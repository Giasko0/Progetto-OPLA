# ===== Imports e configurazione =====
from flask import Flask, render_template, request, jsonify, redirect, make_response
from psycopg2 import sql
from admin import admin_bp
from db import get_db_connection
from datetime import datetime, timedelta

# app = Flask(__name__, static_url_path='/flask')
app = Flask(__name__)
app.register_blueprint(admin_bp)

def get_session_for_date(date, cds_code, anno_acc):
  """Determina la sessione di un esame in base alla data e al CDS"""
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Prima verifica se la data ricade nella sessione anticipata
    cursor.execute("""
      SELECT 'Anticipata', 3 
      FROM cds 
      WHERE codice = %s AND anno_accademico = %s 
      AND %s BETWEEN inizio_sessione_anticipata AND fine_sessione_anticipata
    """, (cds_code, anno_acc, date))
    result = cursor.fetchone()
    if result:
      return result
      
    # Verifica sessione estiva
    cursor.execute("""
      SELECT 'Estiva', 3 
      FROM cds 
      WHERE codice = %s AND anno_accademico = %s 
      AND %s BETWEEN inizio_sessione_estiva AND fine_sessione_estiva
    """, (cds_code, anno_acc, date))
    result = cursor.fetchone()
    if result:
      return result
      
    # Verifica sessione autunnale
    cursor.execute("""
      SELECT 'Autunnale', 2 
      FROM cds 
      WHERE codice = %s AND anno_accademico = %s 
      AND %s BETWEEN inizio_sessione_autunnale AND fine_sessione_autunnale
    """, (cds_code, anno_acc, date))
    result = cursor.fetchone()
    if result:
      return result
      
    # Verifica sessione invernale
    cursor.execute("""
      SELECT 'Invernale', 3 
      FROM cds 
      WHERE codice = %s AND anno_accademico = %s 
      AND %s BETWEEN inizio_sessione_invernale AND fine_sessione_invernale
    """, (cds_code, anno_acc, date))
    result = cursor.fetchone()
    if result:
      return result
      
  finally:
    cursor.close()
    conn.close()
  return None

def get_valid_years():
  """Determina gli anni validi per l'inserimento degli esami"""
  current_date = datetime.now()
  current_year = current_date.year
  current_month = current_date.month

  if current_month >= 9:  # Da settembre a dicembre
    return (current_year, current_year + 1)
  else:  # Da gennaio ad agosto
    return (current_year - 1, current_year)

# ===== Route principali =====
@app.route('/flask')
def home():
  """Pagina principale dell'applicazione"""
  return render_template("index.html")

@app.route('/flask/mieiEsami')
def mieiEsami():
  """Pagina personale del docente con i suoi esami"""
  username = request.cookies.get('username')
  if not username:
    return redirect('/flask/login')
  
  return render_template("mieiEsami.html")

@app.route('/flask/elencoEsami')
def elencoEsami():
  """Pagina che mostra l'elenco degli esami"""
  return render_template("elencoEsami.html")

# ===== Autenticazione =====
@app.route('/flask/login')
def login():
  """Pagina di login"""
  return render_template("login.html")

@app.route('/flask/logout')
def logout():
  """Gestisce il logout cancellando il cookie"""
  response = redirect('/flask')
  response.delete_cookie('username')
  return response

@app.route('/flask/api/login', methods=['POST'])
def api_login():
  """API per gestire il login"""
  data = request.form
  username = data.get('username')
  password = data.get('password')

  conn = get_db_connection()
  cursor = conn.cursor()
  try:
    cursor.execute("SELECT 1 FROM docenti WHERE username = %s AND nome = %s", (username, password))
    if cursor.fetchone():
      response = redirect('/flask')
      response.set_cookie('username', username)
      return response
    else:
      return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
  finally:
    cursor.close()
    conn.close()

# ===== API Gestione Esami =====
@app.route('/flask/api/inserisciEsame', methods=['POST'])
def inserisciEsame():
  """API per inserire un nuovo esame"""
  conn = None
  try:
    # Raccogli i dati dal form
    data = request.form
    docente = data.get('docente')
    insegnamento = data.get('insegnamento')
    aula = data.get('aula')
    data_appello = data.get('dataora')
    ora_appello = data.get('ora')
    inizio_iscrizione = data.get('inizioIscrizione')
    fine_iscrizione = data.get('fineIscrizione')
    tipo_esame = data.get('tipoEsame')
    verbalizzazione = data.get('verbalizzazione', 'STD')  # Default: Standard
    note_appello = data.get('note')
    posti = data.get('posti')
    anno_accademico = data.get('anno_accademico')  # Nuovo campo
    
    # Valori standard per i campi mancanti
    tipo_appello = 'PF'
    definizione_appello = 'STD'
    gestione_prenotazione = 'STD'
    riservato = False  # 0 in SQL
    tipo_iscrizione = 'STD'
    
    # Campi obbligatori
    if not all([docente, insegnamento, aula, data_appello]):
      return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400

    # Gestione ora_appello - Se è vuota impostiamo NULL
    if not ora_appello or ora_appello.strip() == '':
      ora_appello = None
    
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

    # Imposta valori predefiniti per i campi obbligatori
    if not inizio_iscrizione:
      inizio_iscrizione = data_esame - timedelta(days=30)
    if not fine_iscrizione:
      fine_iscrizione = data_esame - timedelta(days=1)

    conn = get_db_connection()
    cursor = conn.cursor()

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
      return jsonify({'status': 'error', 'message': 'Insegnamento non trovato'}), 400
    
    cds_code, anno_acc = cds_info

    # Verifica limite esami per sessione
    sessione_info = get_session_for_date(data_esame, cds_code, anno_acc)
    if not sessione_info:
      return jsonify({
        'status': 'error', 
        'message': 'La data selezionata non rientra in nessuna sessione d\'esame valida'
      }), 400

    sessione, limite_max = sessione_info
    
    # Conta esami nella stessa sessione
    cursor.execute("""
      SELECT COUNT(*) 
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.codice
      JOIN cds c ON c.codice = %s AND c.anno_accademico = %s
      WHERE e.docente = %s 
      AND (
        CASE %s
          WHEN 'Anticipata' THEN e.data_appello BETWEEN c.inizio_sessione_anticipata AND c.fine_sessione_anticipata
          WHEN 'Estiva' THEN e.data_appello BETWEEN c.inizio_sessione_estiva AND c.fine_sessione_estiva
          WHEN 'Autunnale' THEN e.data_appello BETWEEN c.inizio_sessione_autunnale AND c.fine_sessione_autunnale
          WHEN 'Invernale' THEN e.data_appello BETWEEN c.inizio_sessione_invernale AND c.fine_sessione_invernale
        END
      )
    """, (cds_code, anno_acc, docente, sessione))

    if cursor.fetchone()[0] >= limite_max:
      return jsonify({
        'status': 'error', 
        'message': f'Limite di {limite_max} esami per la sessione {sessione} raggiunto'
      }), 400

    # Verifica aule/giorni
    cursor.execute("SELECT COUNT(*) FROM esami WHERE data_appello = %s", (data_appello,))
    if cursor.fetchone()[0] >= 2:
      return jsonify({'status': 'error', 'message': 'Massimo due esami per giorno'}), 400

    cursor.execute("SELECT 1 FROM esami WHERE data_appello = %s AND aula = %s", (data_appello, aula))
    if cursor.fetchone():
      return jsonify({'status': 'error', 'message': 'Aula già occupata'}), 400

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
      return jsonify({
        'status': 'error', 
        'message': f'Non puoi inserire esami a meno di 14 giorni di distanza. Hai già esami nelle date: {", ".join(date_esami)}'
      }), 400

    # Inserimento con tutti i campi del database
    cursor.execute(
      """INSERT INTO esami 
         (docente, insegnamento, aula, data_appello, ora_appello, 
          data_inizio_iscrizione, data_fine_iscrizione, 
          tipo_esame, verbalizzazione, note_appello, posti,
          tipo_appello, definizione_appello, gestione_prenotazione, 
          riservato, tipo_iscrizione)
         VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
      (docente, insegnamento, aula, data_appello, ora_appello, 
       inizio_iscrizione, fine_iscrizione, 
       tipo_esame, verbalizzazione, note_appello, posti,
       tipo_appello, definizione_appello, gestione_prenotazione,
       riservato, tipo_iscrizione)
    )
    conn.commit()
    return jsonify({'status': 'success'}), 200

  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if conn:
      cursor.close()
      conn.close()

# API per ottenere gli insegnamenti di un docente. Usato per l'elenco insegnamenti del form
@app.route('/flask/api/ottieniInsegnamenti', methods=['GET'])
def ottieniInsegnamenti():
  username = request.args.get('username')
  if not username:
    return jsonify({'status': 'error', 'message': 'Username mancante'}), 400
  
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    current_date = datetime.now()
    planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1

    cursor.execute("""
      SELECT DISTINCT i.codice, i.titolo 
      FROM insegnamenti i 
      JOIN insegna ins ON i.codice = ins.insegnamento 
      WHERE ins.docente = %s 
      AND ins.annoaccademico = %s
    """, (username, planning_year))
    
    insegnamenti = [{'codice': row[0], 'titolo': row[1]} for row in cursor.fetchall()]
    return jsonify(insegnamenti)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    cursor.close()
    conn.close()

# API per ottenere gli esami filtrati per anno di corso
@app.route('/flask/api/filtraEsami', methods=['GET'])
def filtraEsami():
  anniCorso = request.args.getlist('annoCorso')
  current_date = datetime.now()
  anno_accademico = current_date.year if current_date.month >= 9 else current_date.year - 1

  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
      SELECT d.username, d.nome, d.cognome, i.titolo, e.aula, e.data_appello, e.ora_appello,
             e.tipo_esame, ic.anno_corso 
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.codice
      JOIN docenti d ON e.docente = d.username
      JOIN insegna ins ON e.insegnamento = ins.insegnamento 
        AND e.docente = ins.docente
        AND ins.annoaccademico = %s
      JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento 
        AND ic.anno_accademico = ins.annoaccademico
      WHERE ic.anno_accademico = %s
    """
    
    params = [anno_accademico, anno_accademico]
    if anniCorso:
      query += " AND ic.anno_corso = ANY(%s)"
      params.append(anniCorso)
    
    query += " ORDER BY e.data_appello, e.ora_appello"
    
    cursor.execute(query, tuple(params))
    
    exams = [{
      'id': idx,
      'title': f"{row[3]} - {row[1]}",  # Titolo insegnamento - Nome docente
      'aula': row[4],
      'start': f"{row[5].isoformat()}T{row[6]}" if row[6] else row[5].isoformat(),
      'description': f"Tipo: {row[7] or 'Non specificato'}\nAula: {row[4]}\nAnno: {row[8]}",
      'allDay': False,
      'docente': row[0]  # Passa l'username del docente invece del nome
    } for idx, row in enumerate(cursor.fetchall())]
    
    return jsonify(exams)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    cursor.close()
    conn.close()

# API per ottenere gli esami di un docente
@app.route('/flask/api/mieiEsami', methods=['GET'])
def miei_esami():
  docente = request.args.get('docente') or request.cookies.get('username')
  if not docente:
    return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401

  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    current_date = datetime.now()
    planning_year = current_date.year if current_date.month >= 9 else current_date.year - 1

    cursor.execute("""
      WITH esami_docente AS (
        SELECT DISTINCT e.docente, i.titolo, e.aula, e.data_appello, e.ora_appello,
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
      )
      SELECT * FROM esami_docente
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

# ===== Main =====
if __name__ == '__main__':
  app.config['DEBUG'] = True
  app.run(host='0.0.0.0')
