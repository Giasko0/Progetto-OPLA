from flask import Blueprint, render_template, request, redirect, make_response, jsonify
from db import get_db_connection
import io
import csv
from datetime import datetime, timedelta

admin_bp = Blueprint('admin', __name__, url_prefix='/flask/admin')

@admin_bp.route('/')
def admin_login():
    if 'admin' in request.cookies:
        return redirect('/flask/admin/dashboard')
    return render_template('oh-issa/login.html')

@admin_bp.route('/dashboard')
def admin_dashboard():
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
    return render_template('oh-issa/dashboard.html')

@admin_bp.route('/auth', methods=['POST'])
def admin_auth():
    username = request.form.get('username')
    password = request.form.get('password')
    
    if username == "Admin" and password == "admin":
        response = redirect('/flask/admin/dashboard')
        response.set_cookie('admin', 'true')
        return response
    return redirect('/flask/admin')

@admin_bp.route('/logout')
def admin_logout():
    response = redirect('/flask/admin')
    response.delete_cookie('admin')
    return response

@admin_bp.route('/downloadCsv')
def download_csv():
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Query aggiornata con i campi corretti dal database
        cursor.execute("""
            SELECT 
                e.tipo_appello, e.docente, e.insegnamento, e.aula, 
                e.data_appello, e.data_inizio_iscrizione, e.data_fine_iscrizione, 
                e.ora_appello, e.verbalizzazione, e.definizione_appello, 
                e.gestione_prenotazione, e.riservato, e.tipo_iscrizione, 
                e.tipo_esame, e.note_appello, e.posti, e.codice_turno,
                i.anno, i.cds, i.codice, i.titolo,
                a.edificio, a.sede
            FROM esami e
            LEFT JOIN insegnamenti i ON e.insegnamento = i.codice
            LEFT JOIN aule a ON e.aula = a.nome
            ORDER BY e.data_appello, e.insegnamento
        """)
        esami = cursor.fetchall()

        # Crea il file CSV in memoria
        output = io.StringIO()
        writer = csv.writer(output)

        # Header CSV rimane lo stesso
        writer.writerow([
            'Tipo appello', 'Anno', 'CDS', 'AD', 'Des. Appello', 'Data Appello (gg/mm/yyyy)',
            'Data inizio iscr. (gg/mm/yyyy)', 'Data Fine iscr. (gg/mm/yyyy)', 'Ora appello (hh:mm)',
            'Verb.', 'Def. App.', 'Gest. Pren.', 'Riservato', 'Tipo Iscr.', 'Tipo Esa.', 'Edificio',
            'Aula', 'Matricola Docente', 'Sede', 'Condizione SQL', 'Partizionamento', 'Partizione',
            'Note Appello', 'Posti', 'Codice Turno'
        ])

        # Dati esami con mappatura corretta dal database
        for esame in esami:
            (tipo_appello, docente, insegnamento, aula, 
             data_appello, data_inizio_iscr, data_fine_iscr, 
             ora_appello, verbalizzazione, def_appello, 
             gest_prenotazione, riservato, tipo_iscr, 
             tipo_esame, note_appello, posti, codice_turno,
             anno, cds, codice, titolo,
             edificio, sede) = esame
                         
            row = [
                tipo_appello,              # Tipo appello dal db o default "PF"
                anno or "",                # Anno
                cds or "",                 # CDS
                codice or "",              # AD (codice insegnamento)
                titolo or "",              # Des. Appello
                data_appello,              # Data Appello
                data_inizio_iscr,          # Data inizio iscrizione
                data_fine_iscr,            # Data fine iscrizione
                ora_appello,               # Ora appello
                verbalizzazione,           # Verbalizzazione
                def_appello,               # Def. App.
                gest_prenotazione,         # Gest. Pren.
                "1" if riservato else "0", # Riservato
                tipo_iscr,                 # Tipo Iscr.
                tipo_esame,                # Tipo Esa.
                edificio,                  # Edificio
                aula,                      # Aula
                docente,                   # Matricola Docente
                sede,                      # Sede
                "",                        # Condizione SQL
                "",                        # Partizionamento
                "",                        # Partizione
                note_appello,              # Note Appello
                posti,                     # Posti
                codice_turno               # Codice Turno
            ]
            
            writer.writerow(row)

        # Prepara la risposta
        output.seek(0)
        response = make_response(output.getvalue())
        response.headers['Content-Disposition'] = 'attachment; filename=esami.csv'
        response.headers['Content-type'] = 'text/csv'
        
        return response

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@admin_bp.route('/upload-teachings', methods=['POST'])
def upload_teachings():
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
    
    conn = None
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400
            
        if not file.filename.endswith(('.csv', '.tsv', '.txt')):
            return jsonify({'status': 'error', 'message': 'Formato file non supportato. Usare CSV, TSV o TXT'}), 400
        
        # Lettura del file
        stream = io.StringIO(file.stream.read().decode("UTF-8"), newline=None)
        reader = csv.reader(stream)
        
        # Skip header row if present
        next(reader, None)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Elimina i dati esistenti
        cursor.execute("DELETE FROM insegnamenti")
        
        # Inserisci i nuovi dati
        inserted_count = 0
        for row in reader:
            if len(row) >= 7:  # Verifica che ci siano tutti i campi necessari
                codice = row[0]
                titolo = row[1]
                cds = row[2]
                anno = int(row[3]) if row[3].isdigit() else 0
                annocorso = int(row[4]) if row[4].isdigit() else 0
                semestre = int(row[5]) if row[5].isdigit() else 0
                docente = row[6]
                
                cursor.execute("""
                    INSERT INTO insegnamenti (codice, titolo, cds, anno, annocorso, semestre, docente)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (codice, titolo, cds, anno, annocorso, semestre, docente))
                inserted_count += 1
        
        conn.commit()
        return jsonify({
            'status': 'success', 
            'message': f'Caricamento completato con successo. {inserted_count} insegnamenti importati.'
        })
    
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@admin_bp.route('/upload-teachers', methods=['POST'])
def upload_teachers():
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
    
    conn = None
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400
            
        if not file.filename.endswith(('.csv', '.tsv', '.txt')):
            return jsonify({'status': 'error', 'message': 'Formato file non supportato. Usare CSV, TSV o TXT'}), 400
        
        # Lettura del file
        stream = io.StringIO(file.stream.read().decode("UTF-8"), newline=None)
        reader = csv.reader(stream)
        
        # Skip header row if present
        next(reader, None)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Elimina i dati esistenti
        cursor.execute("DELETE FROM docenti")
        
        # Inserisci i nuovi dati
        inserted_count = 0
        for row in reader:
            if len(row) >= 5:  # Verifica che ci siano tutti i campi necessari
                codicefiscale = row[0]
                matricola = row[1]
                email = row[2]
                nome = row[3]
                cognome = row[4]
                
                cursor.execute("""
                    INSERT INTO docenti (codicefiscale, matricola, email, nome, cognome)
                    VALUES (%s, %s, %s, %s, %s)
                """, (codicefiscale, matricola, email, nome, cognome))
                inserted_count += 1
        
        conn.commit()
        return jsonify({
            'status': 'success', 
            'message': f'Caricamento completato con successo. {inserted_count} docenti importati.'
        })
    
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@admin_bp.route('/truncate-table/<table_name>', methods=['POST'])
def truncate_table(table_name):
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
    
    # Lista delle tabelle consentite
    allowed_tables = ['insegnamenti', 'docenti', 'esami', 'sessioni']
    
    if table_name not in allowed_tables:
        return jsonify({
            'status': 'error',
            'message': 'Tabella non valida'
        }), 400
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Esegui il truncate della tabella
        cursor.execute(f"DELETE FROM {table_name}")
        
        # Se stiamo svuotando la tabella esami, resettiamo anche eventuali sequenze associate
        if table_name == 'esami':
            try:
                cursor.execute("ALTER SEQUENCE esami_id_seq RESTART WITH 1")
            except:
                # Se non esiste una sequenza, ignora l'errore
                pass
        
        conn.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'La tabella {table_name} è stata svuotata con successo'
        })
    
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    
    finally:
        if conn:
            cursor.close()
            conn.close()
