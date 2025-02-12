from flask import Flask, render_template, request, jsonify, redirect
import psycopg2 # type: ignore
from psycopg2 import sql    # type: ignore
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
    if 'username' not in request.cookies:
        return render_template("index.html", total_exams=0)
    esami = ottieniEsami().get_json()
    numero_esami = len(esami)
    return render_template("index.html", total_exams=numero_esami)

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

    if username == 'Amedeo' and password == 'amedeo':
        response = redirect('/flask')
        response.set_cookie('username', 'Amedeo')
        return response
    else:
        return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

@app.route('/flask/api/inserisciEsame', methods=['POST'])
def inserisciEsame():
    try:
        # Estrazione e validazione dei dati dalla richiesta
        data = request.form
        titolo = data.get('titolo')
        aula = data.get('aula')
        dataora = data.get('dataora')

        if not titolo or not aula or not dataora:
            return jsonify({'status': 'error', 'message': 'Dati incompleti'}), 400

        # Connessione al database
        conn = get_db_connection()
        cursor = conn.cursor()

        # Creazione tabella se non esiste
        create_table_query = sql.SQL("""
            CREATE TABLE IF NOT EXISTS esami (
                id SERIAL PRIMARY KEY,
                titolo VARCHAR(100) NOT NULL,
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
        query = sql.SQL("INSERT INTO esami (titolo, aula, dataora) VALUES (%s, %s, %s)")
        cursor.execute(query, (titolo, aula, dataora))
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
            SELECT titolo, aula, dataora
            FROM esami
            ORDER BY dataora
        """)
        
        esami = []
        for row in cursor.fetchall():
            esami.append({
                'title': row[0],
                'aula': row[1],
                'start': row[2].isoformat()  # Formato ISO per FullCalendar
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
