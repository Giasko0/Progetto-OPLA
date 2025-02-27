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

@app.route('/flask/profilo')
def profilo():
    """Pagina del profilo docente con statistiche"""
    username = request.cookies.get('username')
    if not username:
        return redirect('/flask/login')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM esami WHERE docente = %s", (username,))
        num_esami = cursor.fetchone()[0]
        
        # Conteggio esami per sessione
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN EXTRACT(MONTH FROM dataora) IN (1, 2) THEN 'Invernale'
                    WHEN EXTRACT(MONTH FROM dataora) = 4 THEN 'Straordinaria'
                    WHEN EXTRACT(MONTH FROM dataora) IN (6, 7) THEN 'Estiva'
                    WHEN EXTRACT(MONTH FROM dataora) = 11 THEN 'Pausa didattica'
                END as sessione,
                COUNT(*) as conteggio
            FROM esami 
            WHERE docente = %s
            GROUP BY sessione
        """, (username,))
        
        sessioni = {
            'Invernale': 0,
            'Straordinaria': 0,
            'Estiva': 0,
            'Pausa didattica': 0
        }
        for row in cursor.fetchall():
            if row[0]:  # skip None values
                sessioni[row[0]] = row[1]
        
        return render_template("profilo.html", 
                             username=username, 
                             num_esami=num_esami,
                             sessioni=sessioni)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

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
    try:
        data = request.form
        docente = data.get('docente')
        insegnamento = data.get('insegnamento')
        aula = data.get('aula')
        dataora = data.get('dataora')

        if not all([docente, insegnamento, aula, dataora]):
            return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400

        # Verifica che l'anno sia valido
        data_esame = datetime.fromisoformat(dataora)
        anno_valido_inizio, anno_valido_fine = get_valid_years()
        
        if not (anno_valido_inizio <= data_esame.year <= anno_valido_fine):
            return jsonify({
                'status': 'error',
                'message': f'È possibile inserire esami solo per gli anni {anno_valido_inizio}-{anno_valido_fine}'
            }), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Verifica vincoli
        cursor.execute("SELECT COUNT(*) FROM esami WHERE dataora = %s", (dataora,))
        if cursor.fetchone()[0] >= 2:
            return jsonify({'status': 'error', 'message': 'Massimo due esami per giorno'}), 400

        cursor.execute("SELECT 1 FROM esami WHERE dataora = %s AND aula = %s", (dataora, aula))
        if cursor.fetchone():
            return jsonify({'status': 'error', 'message': 'Aula già occupata'}), 400

        # Verifica vincolo dei 14 giorni
        data_esame = datetime.fromisoformat(dataora)
        data_min = data_esame - timedelta(days=14)
        data_max = data_esame + timedelta(days=14)
        
        cursor.execute("""
            SELECT dataora FROM esami 
            WHERE insegnamento = %s AND dataora BETWEEN %s AND %s
        """, (insegnamento, data_min, data_max))
        
        esami_vicini = cursor.fetchall()
        if esami_vicini:
            date_esami = [e[0].strftime('%d/%m/%Y') for e in esami_vicini]
            return jsonify({
                'status': 'error', 
                'message': f'Non puoi inserire esami a meno di 14 giorni di distanza. Hai già esami nelle date: {", ".join(date_esami)}'
            }), 400

        # Verifica limite esami per sessione
        sessione_info = get_session_for_date(data_esame)
        if sessione_info:
            sessione, limite_max = sessione_info
            cursor.execute("""
                SELECT COUNT(*) FROM esami 
                WHERE docente = %s AND 
                CASE 
                    WHEN EXTRACT(YEAR FROM dataora) = EXTRACT(YEAR FROM CURRENT_DATE) + 1 THEN
                        CASE
                            WHEN EXTRACT(MONTH FROM dataora) IN (1, 2) THEN 'Anticipata'
                            WHEN EXTRACT(MONTH FROM dataora) IN (3, 4) THEN 'Pausa Didattica Primavera'
                            WHEN EXTRACT(MONTH FROM dataora) IN (6, 7) THEN 'Estiva'
                            WHEN EXTRACT(MONTH FROM dataora) = 9 THEN 'Autunnale'
                            WHEN EXTRACT(MONTH FROM dataora) = 11 THEN 'Pausa Didattica Autunno'
                        END
                    WHEN EXTRACT(YEAR FROM dataora) = EXTRACT(YEAR FROM CURRENT_DATE) + 2 THEN
                        CASE
                            WHEN EXTRACT(MONTH FROM dataora) IN (1, 2) THEN 'Invernale'
                            WHEN EXTRACT(MONTH FROM dataora) IN (3, 4) THEN 'Pausa Didattica Primavera'
                        END
                END = %s
            """, (docente, sessione))
            
            if cursor.fetchone()[0] >= limite_max:
                return jsonify({
                    'status': 'error', 
                    'message': f'Limite di {limite_max} esami per la sessione {sessione} raggiunto'
                }), 400

        # Inserimento
        cursor.execute(
            "INSERT INTO esami (docente, insegnamento, aula, dataora) VALUES (%s, %s, %s, %s)",
            (docente, insegnamento, aula, dataora)
        )
        conn.commit()
        return jsonify({'status': 'success'}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@app.route('/flask/api/ottieniInsegnamenti', methods=['GET'])
def ottieniInsegnamenti():
    """API per ottenere gli insegnamenti di un docente"""
    username = request.args.get('username')
    if not username:
        return jsonify({'status': 'error', 'message': 'Username mancante'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT titolo FROM insegnamenti WHERE docente = %s", (username,))
        insegnamenti = [row[0] for row in cursor.fetchall()]
        return jsonify(insegnamenti)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@app.route('/flask/api/filtraEsami', methods=['GET'])
def filtraEsami():
    """API per filtrare gli esami per anno accademico e/o docente"""
    academicYears = request.args.getlist('academicYear')
    docente = request.args.get('docente')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        conditions = []
        params = []
        
        if academicYears:
            conditions.append("i.annoAccademico = ANY(%s)")
            params.append(academicYears)
        
        if docente:
            conditions.append("e.docente = %s")
            params.append(docente)
        
        query = """
            SELECT e.docente, e.insegnamento, e.aula, e.dataora 
            FROM esami e
            JOIN insegnamenti i ON e.insegnamento = i.titolo
            {where}
            ORDER BY e.dataora
        """.format(where=f"WHERE {' AND '.join(conditions)}" if conditions else "")
        
        cursor.execute(query, tuple(params))
        
        exams = [{
            'docente': row[0],
            'title': row[1],
            'aula': row[2],
            'start': row[3].isoformat()
        } for row in cursor.fetchall()]
        
        return jsonify(exams)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@app.route('/flask/api/mieiEsami', methods=['GET'])
def api_miei_esami():
    """Endpoint per ottenere le info degli esami del docente in formato JSON"""
    username = request.cookies.get('username')
    if not username:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ottieni gli anni validi
        anno_valido_inizio, anno_valido_fine = get_valid_years()
        
        # Ottieni gli insegnamenti del docente
        cursor.execute("SELECT titolo FROM insegnamenti WHERE docente = %s", (username,))
        insegnamenti = [row[0] for row in cursor.fetchall()]
        
        esami_docente = {'insegnamenti': {}}
        
        # Per ogni insegnamento, calcola le statistiche per sessione
        for insegnamento in insegnamenti:
            cursor.execute("""
                SELECT 
                    CASE 
                        WHEN EXTRACT(YEAR FROM dataora) = %s THEN
                            CASE
                                WHEN EXTRACT(MONTH FROM dataora) IN (1, 2) THEN 'Anticipata'
                                WHEN EXTRACT(MONTH FROM dataora) IN (3, 4) THEN 'Pausa Didattica Primavera'
                                WHEN EXTRACT(MONTH FROM dataora) IN (6, 7) THEN 'Estiva'
                                WHEN EXTRACT(MONTH FROM dataora) = 9 THEN 'Autunnale'
                                WHEN EXTRACT(MONTH FROM dataora) = 11 THEN 'Pausa Didattica Autunno'
                            END
                        WHEN EXTRACT(YEAR FROM dataora) = %s THEN
                            CASE
                                WHEN EXTRACT(MONTH FROM dataora) IN (1, 2) THEN 'Invernale'
                                WHEN EXTRACT(MONTH FROM dataora) IN (3, 4) THEN 'Pausa Didattica Primavera'
                            END
                    END as sessione,
                    COUNT(*) as conteggio
                FROM esami 
                WHERE docente = %s 
                AND insegnamento = %s 
                AND EXTRACT(YEAR FROM dataora) BETWEEN %s AND %s
                GROUP BY sessione
            """, (anno_valido_inizio, anno_valido_fine, username, insegnamento, 
                  anno_valido_inizio, anno_valido_fine))
            
            sessioni = {
                'Anticipata': 0,
                'Pausa Didattica Primavera': 0,
                'Estiva': 0,
                'Autunnale': 0,
                'Pausa Didattica Autunno': 0,
                'Invernale': 0
            }
            
            for row in cursor.fetchall():
                if row[0]:  # skip None values
                    sessioni[row[0]] = row[1]
            
            esami_docente['insegnamenti'][insegnamento] = sessioni
        
        return jsonify(esami_docente), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

# ===== Main =====
if __name__ == '__main__':
    app.config['DEBUG'] = True
    app.run(host='0.0.0.0')
