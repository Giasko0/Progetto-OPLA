from flask import Flask, render_template, request, jsonify, redirect
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
    response = ottieniEsami()
    esami = response.get_json() # devo trasformare la risposta in un oggetto JSON
    return render_template("elencoEsami.html", esami=esami)

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

        # Verifica se ci sono già due esami con la stessa data
        cursor.execute("SELECT COUNT(*) FROM esami WHERE dataora = %s", (dataora,))
        count = cursor.fetchone()[0]
        if count >= 2:
            #return render_template("genericPopup.html", content="<h1>Errore</h1><p>Non è possibile inserire più di due esami lo stesso giorno</p>")
            return jsonify({'status': 'error', 'message': 'Non è possibile inserire più di due esami lo stesso giorno'}), 400

        # Verifica se esiste già un esame con la stessa data e stessa aula
        cursor.execute("SELECT 1 FROM esami WHERE dataora = %s AND aula = %s", (dataora, aula))
        if cursor.fetchone():
            #return render_template("genericPopup.html", content="<h1>Errore</h1><p>Esame già presente in questa aula</p>")
            return jsonify({'status': 'error', 'message': 'Esame già presente in questa aula'}), 400

        # Inserimento dati usando query parametrizzata
        query = sql.SQL("INSERT INTO esami (docente, insegnamento, aula, dataora) VALUES (%s, %s, %s, %s)")
        cursor.execute(query, (docente, insegnamento, aula, dataora))
        conn.commit()

        return redirect('/flask')
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

if __name__ == '__main__':
    app.config['DEBUG'] = True
    app.run(host='0.0.0.0')
