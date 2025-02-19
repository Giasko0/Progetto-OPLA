from flask import Flask, render_template, request, jsonify, redirect, make_response
import psycopg2
from psycopg2 import sql
import os

# app = Flask(__name__, static_url_path='/flask')
app = Flask(__name__)

# Database configuration
DB_HOST = os.getenv('DB_HOST')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASS = os.getenv('DB_PASSWORD')

def get_db_connection():
    db = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    return db

@app.route('/flask')
def home():
    return render_template("index.html")

@app.route('/flask/elencoEsami')
def elencoEsami():
    return render_template("elencoEsami.html")

@app.route('/flask/login')
def login():
    return render_template("login.html")

@app.route('/flask/logout')
def logout():
    response = redirect('/flask')
    response.delete_cookie('username')
    return response

@app.route('/flask/api/login', methods=['POST'])
def api_login():
    data = request.form
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM docenti WHERE matricola = %s AND nome = %s", (username, password))
    if cursor.fetchone():
        response = redirect('/flask')
        response.set_cookie('username', username)
        return response
    else:
        return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
    cursor.close()
    conn.close()

@app.route('/flask/api/inserisciEsame', methods=['POST'])
def inserisciEsame():
    try:
        # Estrazione e validazione dei dati dalla richiesta
        data = request.form
        docente = data.get('docente')
        insegnamento = data.get('insegnamento')
        aula = data.get('aula')
        dataora = data.get('dataora')

        if not docente or not insegnamento or not aula or not dataora:
            return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400

        # Connessione al database
        conn = get_db_connection()
        cursor = conn.cursor()

        # Creazione tabella se non esiste
        create_table_query = sql.SQL("""
            CREATE TABLE IF NOT EXISTS esami (
                id SERIAL PRIMARY KEY,
                docente VARCHAR(50) NOT NULL REFERENCES docenti(matricola),
                insegnamento VARCHAR(50) NOT NULL REFERENCES insegnamenti(titolo),
                aula VARCHAR(50) NOT NULL,
                dataora DATE NOT NULL
            )
        """)
        cursor.execute(create_table_query)
        conn.commit()

        # Verifica se ci sono già due esami nella stessa data
        cursor.execute("SELECT COUNT(*) FROM esami WHERE dataora = %s", (dataora,))
        count = cursor.fetchone()[0]
        if count >= 2:
            return jsonify({'status': 'error', 'message': 'Non è possibile inserire più di due esami lo stesso giorno'}), 400

        # Verifica se esiste già un esame con la stessa data e aula
        cursor.execute("SELECT 1 FROM esami WHERE dataora = %s AND aula = %s", (dataora, aula))
        if cursor.fetchone():
            return jsonify({'status': 'error', 'message': 'Esame già presente in questa aula'}), 400

        # Inserimento dati usando query parametrizzata
        query = sql.SQL("INSERT INTO esami (docente, insegnamento, aula, dataora) VALUES (%s, %s, %s, %s)")
        cursor.execute(query, (docente, insegnamento, aula, dataora))
        conn.commit()

        # Ritorna una risposta JSON di successo
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@app.route('/flask/api/ottieniEsami', methods=['GET'])
def ottieniEsami():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT docente, insegnamento, aula, dataora
            FROM esami
            ORDER BY dataora
        """)
        
        esami = []
        for row in cursor.fetchall():
            esami.append({
                'docente': row[0],
                'title': row[1],
                'aula': row[2],
                'start': row[3].isoformat()  # Formato ISO per FullCalendar
            })
        
        return jsonify(esami)
    
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@app.route('/flask/api/ottieniInsegnamenti', methods=['GET'])
def ottieniInsegnamenti():
    username = request.args.get('username')
    if not username:
        return jsonify({'status': 'error', 'message': 'Missing username parameter'}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Assumendo che la tabella insegnamenti abbia una colonna "docente" che memorizza la matricola
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
    academicYears = request.args.getlist('academicYear')
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        if academicYears:
            query = """
                SELECT e.docente, e.insegnamento, e.aula, e.dataora 
                FROM esami e
                JOIN insegnamenti i ON e.insegnamento = i.titolo
                WHERE i.annoAccademico = ANY(%s)
                ORDER BY e.dataora
            """
            cursor.execute(query, (academicYears,))
        else:
            cursor.execute("SELECT docente, insegnamento, aula, dataora FROM esami ORDER BY dataora")
        exams = []
        for row in cursor.fetchall():
            exams.append({
                'docente': row[0],
                'title': row[1],
                'aula': row[2],
                'start': row[3].isoformat()
            })
        return jsonify(exams)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

if __name__ == '__main__':
    app.config['DEBUG'] = True
    app.run(host='0.0.0.0')
