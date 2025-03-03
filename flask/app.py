# ===== Imports e configurazione =====
from flask import Flask, render_template, request, jsonify, redirect, make_response
from psycopg2 import sql
from admin import admin_bp
from db import get_db_connection
from datetime import datetime, timedelta

# app = Flask(__name__, static_url_path='/flask')
app = Flask(__name__)
app.register_blueprint(admin_bp)

def get_session_for_date(date):
  """Determina la sessione di un esame in base alla data"""
  month = date.month
  year = date.year
  planning_year = datetime.now().year + 1  # Anno di pianificazione

  if year == planning_year:
    if month in [1, 2]:
      return ("Anticipata", 3)
    elif month in [3, 4]:
      return ("Pausa Didattica Primavera", 1)
    elif month in [6, 7]:
      return ("Estiva", 3)
    elif month == 9:
      return ("Autunnale", 2)
    elif month == 11:
      return ("Pausa Didattica Autunno", 1)
  elif year == planning_year + 1:
    if month in [1, 2]:
      return ("Invernale", 3)
    elif month in [3, 4]:
      return ("Pausa Didattica Primavera", 1)
  return None

def get_valid_years():
  """Determina gli anni validi per l'inserimento degli esami"""
  current_date = datetime.now()
  current_year = current_date.year
  current_month = current_date.month

  if current_month >= 9:  # Da settembre a dicembre
    return (current_year + 1, current_year + 2)
  else:  # Da gennaio ad agosto
    return (current_year, current_year + 1)

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
    cursor.execute("SELECT 1 FROM docenti WHERE matricola = %s AND nome = %s", (username, password))
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

    # Verifica limite esami per sessione
    sessione_info = get_session_for_date(data_esame)
    if sessione_info:
      sessione, limite_max = sessione_info
      cursor.execute("""
        SELECT COUNT(*) FROM esami 
        WHERE docente = %s AND 
        CASE 
          WHEN EXTRACT(YEAR FROM data_appello) = EXTRACT(YEAR FROM CURRENT_DATE) + 1 THEN
            CASE
              WHEN EXTRACT(MONTH FROM data_appello) IN (1, 2) THEN 'Anticipata'
              WHEN EXTRACT(MONTH FROM data_appello) IN (3, 4) THEN 'Pausa Didattica Primavera'
              WHEN EXTRACT(MONTH FROM data_appello) IN (6, 7) THEN 'Estiva'
              WHEN EXTRACT(MONTH FROM data_appello) = 9 THEN 'Autunnale'
              WHEN EXTRACT(MONTH FROM data_appello) = 11 THEN 'Pausa Didattica Autunno'
            END
          WHEN EXTRACT(YEAR FROM data_appello) = EXTRACT(YEAR FROM CURRENT_DATE) + 2 THEN
            CASE
              WHEN EXTRACT(MONTH FROM data_appello) IN (1, 2) THEN 'Invernale'
              WHEN EXTRACT(MONTH FROM data_appello) IN (3, 4) THEN 'Pausa Didattica Primavera'
            END
        END = %s
      """, (docente, sessione))
      
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
    cursor.execute("SELECT codice, titolo FROM insegnamenti WHERE docente = %s", (username,))
    insegnamenti = [{'codice': row[0], 'titolo': row[1]} for row in cursor.fetchall()]
    return jsonify(insegnamenti)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if conn:
      cursor.close()
      conn.close()

# API per ottenere gli esami filtrati per anno di corso
@app.route('/flask/api/filtraEsami', methods=['GET'])
def filtraEsami():
  anniCorso = request.args.getlist('annoCorso')

  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
      SELECT e.docente, i.titolo, e.aula, e.data_appello, e.ora_appello 
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.codice
    """
    
    params = []
    if anniCorso:  # Se sono stati specificati anni di corso
      query += " WHERE i.annocorso = ANY(%s)"
      params.append(anniCorso)
    
    query += " ORDER BY e.data_appello"
    
    cursor.execute(query, tuple(params))
    
    exams = [{
      'docente': row[0],
      'title': row[1],  # Titolo dell'insegnamento come titolo dell'evento
      'aula': row[2],
      'start': f"{row[3].isoformat()}T{row[4]}" if row[4] else row[3].isoformat()
    } for row in cursor.fetchall()]
    
    return jsonify(exams)
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if conn:
      cursor.close()
      conn.close()

# API per ottenere gli esami di un docente
@app.route('/flask/api/mieiEsami', methods=['GET'])
def miei_esami():
  # Usa il parametro 'docente' se presente, altrimenti il cookie
  docente = request.args.get('docente') or request.cookies.get('username')
  if not docente:
    return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401

  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    # Recupera tutti gli esami del docente con il titolo dell'insegnamento
    cursor.execute("""
      SELECT e.docente, i.titolo, e.aula, e.data_appello, e.ora_appello 
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.codice
      WHERE e.docente = %s
      ORDER BY e.data_appello
    """, (docente,))
    
    rows = cursor.fetchall()
    esami = []
    insegnamenti = {}
    
    # Ricava gli anni validi per determinare la sessione
    anno_valido_inizio, anno_valido_fine = get_valid_years()
    session_labels = [
      'Anticipata', 'Pausa Didattica Primavera',
      'Estiva', 'Autunnale', 'Pausa Didattica Autunno',
      'Invernale'
    ]
    
    for row in rows:
      # Gestisci correttamente la data e l'ora
      data_appello = row[3]
      ora_appello = row[4] if row[4] else "00:00:00"
      
      # Formattazione migliorata per data e ora
      data_formattata = data_appello.strftime("%d/%m/%Y")
      ora_formattata = ora_appello if isinstance(ora_appello, str) else ora_appello.strftime("%H:%M")
      
      exam = {
        'docente': row[0],
        'insegnamento': row[1],  # Ora contiene il titolo dell'insegnamento
        'aula': row[2],
        'data': data_formattata,
        'ora': ora_formattata,
        'dataora': f"{data_appello.isoformat()}T{ora_appello}"  # Manteniamo questo formato per compatibilità
      }
      esami.append(exam)
      
      # Calcola la sessione per l'esame
      dt = data_appello
      sessione = None
      if dt.year == anno_valido_inizio:
        if dt.month in [1, 2]:
          sessione = 'Anticipata'
        elif dt.month in [3, 4]:
          sessione = 'Pausa Didattica Primavera'
        elif dt.month in [6, 7]:
          sessione = 'Estiva'
        elif dt.month == 9:
          sessione = 'Autunnale'
        elif dt.month == 11:
          sessione = 'Pausa Didattica Autunno'
      elif dt.year == anno_valido_fine:
        if dt.month in [1, 2]:
          sessione = 'Invernale'
        elif dt.month in [3, 4]:
          sessione = 'Pausa Didattica Primavera'
      
      # Inizializza il raggruppamento per insegnamento se necessario
      ins = row[1]  # Ora usiamo il titolo dell'insegnamento
      if ins not in insegnamenti:
        insegnamenti[ins] = {label: 0 for label in session_labels}
      if sessione in insegnamenti[ins]:
        insegnamenti[ins][sessione] += 1
    
    return jsonify({'esami': esami, 'insegnamenti': insegnamenti}), 200
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if conn:
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

# ===== Main =====
if __name__ == '__main__':
  app.config['DEBUG'] = True
  app.run(host='0.0.0.0')
