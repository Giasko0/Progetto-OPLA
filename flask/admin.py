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

@admin_bp.route('/downloadFileESSE3')
def download_csv():
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT 
                e.tipo_appello,             -- Tipo appello
                ic.anno_accademico,         -- Anno
                ic.cds,                     -- CDS
                i.codice,                   -- AD
                i.titolo,                   -- Des. Appello
                e.data_appello,             -- Data Appello
                e.data_inizio_iscrizione,   -- Data inizio iscrizione
                e.data_fine_iscrizione,     -- Data fine iscrizione
                e.ora_appello,              -- Ora appello
                e.verbalizzazione,          -- Verbalizzazione
                e.definizione_appello,      -- Def. App.
                e.gestione_prenotazione,    -- Gest. Pren.
                e.riservato,                -- Riservato
                e.tipo_iscrizione,          -- Tipo Iscr.
                e.tipo_esame,               -- Tipo Esa.
                a.edificio,                 -- Edificio
                e.aula,                     -- Aula
                d.matricola,                -- Matricola Docente
                a.sede,                     -- Sede
                e.condizione_sql,           -- Condizione SQL
                e.partizionamento,          -- Partizionamento
                e.partizione,               -- Partizione
                e.note_appello,             -- Note Appello
                e.posti,                    -- Posti
                e.codice_turno              -- Codice Turno
            FROM esami e
            JOIN insegnamenti i ON e.insegnamento = i.codice
            LEFT JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento 
                AND ic.anno_accademico = EXTRACT(YEAR FROM e.data_appello) - 1
            LEFT JOIN aule a ON e.aula = a.nome
            LEFT JOIN docenti d ON e.docente = d.username
            ORDER BY e.data_appello, e.insegnamento
        """)
        esami = cursor.fetchall()

        # Crea il file CSV in memoria
        output = io.StringIO()
        writer = csv.writer(output)

        # Prima riga del CSV
        writer.writerow([
            'Tipo appello',
            'Anno',
            'CDS',
            'AD',
            'Des. Appello',
            'Data Appello (gg/mm/yyyy)',
            'Data inizio iscr. (gg/mm/yyyy)',
            'Data Fine iscr. (gg/mm/yyyy)',
            'Ora appello (hh:mm)',
            'Verb.',
            'Def. App.',
            'Gest. Pren.',
            'Riservato',
            'Tipo Iscr.',
            'Tipo Esa.',
            'Edificio',
            'Aula',
            'Matricola Docente',
            'Sede',
            'Condizione SQL',
            'Partizionamento',
            'Partizione',
            'Note Appello',
            'Posti',
            'Codice Turno'
        ])

        # Dati esami con mappatura corretta dal database
        for esame in esami:
            (tipo_appello, anno_corso, cds, codice, titolo,
             data_appello, data_inizio_iscr, data_fine_iscr,
             ora_appello, verbalizzazione, def_appello,
             gest_prenotazione, riservato, tipo_iscr,
             tipo_esame, edificio, aula, matricola,
             sede, condizione_sql, partizionamento,
             partizione, note_appello, posti, codice_turno) = esame
            
            row = [
                tipo_appello or "",            # Tipo appello
                anno_corso or "",              # Anno
                cds or "",                     # CDS
                codice or "",                  # AD
                titolo or "",                  # Des. Appello
                data_appello,                  # Data Appello
                data_inizio_iscr,             # Data inizio iscrizione
                data_fine_iscr,               # Data fine iscrizione
                ora_appello,                  # Ora appello
                verbalizzazione or "",         # Verbalizzazione
                def_appello or "",            # Def. App.
                gest_prenotazione or "",      # Gest. Pren.
                "1" if riservato else "0",    # Riservato
                tipo_iscr or "",              # Tipo Iscr.
                tipo_esame or "",             # Tipo Esa.
                edificio or "",               # Edificio
                aula or "",                   # Aula
                matricola or "",              # Matricola Docente
                sede or "",                   # Sede
                condizione_sql or "",         # Condizione SQL
                partizionamento or "",        # Partizionamento
                partizione or "",             # Partizione
                note_appello or "",           # Note Appello
                posti or "",                  # Posti
                codice_turno or ""            # Codice Turno
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

@admin_bp.route('/save-cds-dates', methods=['POST'])
def save_cds_dates():
    if 'admin' not in request.cookies:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
    try:
        data = request.get_json()
        
        # Estrai i parametri dal JSON ricevuto
        codice_cds = data.get('codice_cds')
        anno_accademico = int(data.get('anno_accademico'))
        nome_corso = data.get('nome_corso')
        durata = int(data.get('durata'))
        
        # Date del primo semestre
        inizio_primo = data.get('inizio_primo')
        fine_primo = data.get('fine_primo')
        pausa_primo_inizio = data.get('pausa_primo_inizio') or None
        pausa_primo_fine = data.get('pausa_primo_fine') or None
        
        # Date del secondo semestre
        inizio_secondo = data.get('inizio_secondo')
        fine_secondo = data.get('fine_secondo')
        pausa_secondo_inizio = data.get('pausa_secondo_inizio') or None
        pausa_secondo_fine = data.get('pausa_secondo_fine') or None
        
        # Date delle sessioni d'esame
        anticipata_inizio = data.get('anticipata_inizio')
        anticipata_fine = data.get('anticipata_fine')
        estiva_inizio = data.get('estiva_inizio')
        estiva_fine = data.get('estiva_fine')
        autunnale_inizio = data.get('autunnale_inizio')
        autunnale_fine = data.get('autunnale_fine')
        invernale_inizio = data.get('invernale_inizio')
        invernale_fine = data.get('invernale_fine')
        
        # Verifica che tutti i campi obbligatori siano presenti
        required_fields = [
            codice_cds, anno_accademico, nome_corso, durata,
            inizio_primo, fine_primo, inizio_secondo, fine_secondo,
            anticipata_inizio, anticipata_fine, estiva_inizio, estiva_fine,
            autunnale_inizio, autunnale_fine, invernale_inizio, invernale_fine
        ]
        
        if any(field is None or field == "" for field in required_fields):
            return jsonify({'status': 'error', 'message': 'Tutti i campi obbligatori devono essere completati'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verifica se esiste già un record per questo corso e anno accademico
        cursor.execute(
            "SELECT 1 FROM cds WHERE codice = %s AND anno_accademico = %s",
            (codice_cds, anno_accademico)
        )
        exists = cursor.fetchone()
        
        if exists:
            # Aggiorna il record esistente
            cursor.execute("""
                UPDATE cds SET 
                nome_corso = %s,
                durata = %s,
                inizio_lezioni_primo_semestre = %s,
                fine_lezioni_primo_semestre = %s,
                inizio_lezioni_secondo_semestre = %s,
                fine_lezioni_secondo_semestre = %s,
                pausa_didattica_primo_inizio = %s,
                pausa_didattica_primo_fine = %s,
                pausa_didattica_secondo_inizio = %s,
                pausa_didattica_secondo_fine = %s,
                inizio_sessione_anticipata = %s,
                fine_sessione_anticipata = %s,
                inizio_sessione_estiva = %s,
                fine_sessione_estiva = %s,
                inizio_sessione_autunnale = %s,
                fine_sessione_autunnale = %s,
                inizio_sessione_invernale = %s,
                fine_sessione_invernale = %s
                WHERE codice = %s AND anno_accademico = %s
            """, (
                nome_corso, durata,
                inizio_primo, fine_primo,
                inizio_secondo, fine_secondo,
                pausa_primo_inizio, pausa_primo_fine,
                pausa_secondo_inizio, pausa_secondo_fine,
                anticipata_inizio, anticipata_fine,
                estiva_inizio, estiva_fine,
                autunnale_inizio, autunnale_fine,
                invernale_inizio, invernale_fine,
                codice_cds, anno_accademico
            ))
            message = f"Informazioni del corso {codice_cds} per l'anno accademico {anno_accademico} aggiornate con successo"
        else:
            # Inserisci un nuovo record
            cursor.execute("""
                INSERT INTO cds (
                    codice, anno_accademico, nome_corso, durata,
                    inizio_lezioni_primo_semestre, fine_lezioni_primo_semestre,
                    inizio_lezioni_secondo_semestre, fine_lezioni_secondo_semestre,
                    pausa_didattica_primo_inizio, pausa_didattica_primo_fine,
                    pausa_didattica_secondo_inizio, pausa_didattica_secondo_fine,
                    inizio_sessione_anticipata, fine_sessione_anticipata,
                    inizio_sessione_estiva, fine_sessione_estiva,
                    inizio_sessione_autunnale, fine_sessione_autunnale,
                    inizio_sessione_invernale, fine_sessione_invernale
                ) VALUES (
                    %s, %s, %s, %s, 
                    %s, %s, %s, %s, 
                    %s, %s, %s, %s, 
                    %s, %s, %s, %s, 
                    %s, %s, %s, %s
                )
            """, (
                codice_cds, anno_accademico, nome_corso, durata,
                inizio_primo, fine_primo,
                inizio_secondo, fine_secondo,
                pausa_primo_inizio, pausa_primo_fine,
                pausa_secondo_inizio, pausa_secondo_fine,
                anticipata_inizio, anticipata_fine,
                estiva_inizio, estiva_fine,
                autunnale_inizio, autunnale_fine,
                invernale_inizio, invernale_fine
            ))
            message = f"Nuovo corso {codice_cds} per l'anno accademico {anno_accademico} creato con successo"
        
        conn.commit()
        
        return jsonify({
            'status': 'success',
            'message': message
        })
        
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'status': 'error', 'message': f'Si è verificato un errore: {str(e)}'}), 500
    
    finally:
        if 'conn' in locals() and conn:
            cursor.close()
            conn.close()
