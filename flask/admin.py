from flask import Blueprint, request, make_response, jsonify
from db import get_db_connection, release_connection
import io
import csv
from datetime import datetime, timedelta
import xlwt

admin_bp = Blueprint('admin', __name__, url_prefix='/oh-issa/api')

@admin_bp.route('/downloadFileESSE3')
def download_csv():
    if 'admin' not in request.cookies:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
        
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
            LEFT JOIN utenti d ON e.docente = d.username
            ORDER BY e.data_appello, e.insegnamento
        """)
        esami = cursor.fetchall()

        # Crea il file Excel in memoria
        workbook = xlwt.Workbook()
        worksheet = workbook.add_sheet('Esami')

        # Formattazione per le date
        date_format = xlwt.XFStyle()
        date_format.num_format_str = 'DD/MM/YYYY'
        
        time_format = xlwt.XFStyle()
        time_format.num_format_str = 'HH:MM'

        # Intestazioni
        headers = [
            'Tipo appello',
            'Anno',
            'CDS',
            'AD',
            'Des. Appello',
            'Data Appello (gg/mm/yyyy)',
            'Data inizio iscr. (gg/mm/yyyy)',
            'Data Fine iscr. (gg/mm/yyyy)',
            'Ora appello (hh:mm)',
            'Tipo Iscr', # Colonna J del file, non usata
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
            'Errore Import', # Colonna X del file, non usata
            'Note Appello',
            'Posti',
            'Codice Turno',
            'Note Sist Log' # Colonna AB del file, non usata
        ]

        # Scrivi le intestazioni
        for col, header in enumerate(headers):
            worksheet.write(0, col, header)

        # Scrivi i dati
        for row_idx, esame in enumerate(esami, start=1):
            (tipo_appello, anno_corso, cds, codice, titolo,
             data_appello, data_inizio_iscr, data_fine_iscr,
             ora_appello, verbalizzazione, def_appello,
             gest_prenotazione, riservato, tipo_iscr,
             tipo_esame, edificio, aula, matricola,
             sede, condizione_sql, partizionamento,
             partizione, note_appello, posti, codice_turno) = esame

            col = 0
            worksheet.write(row_idx, col, tipo_appello or ""); col += 1
            worksheet.write(row_idx, col, anno_corso or ""); col += 1
            worksheet.write(row_idx, col, cds or ""); col += 1
            worksheet.write(row_idx, col, codice or ""); col += 1
            worksheet.write(row_idx, col, titolo or ""); col += 1
            worksheet.write(row_idx, col, data_appello, date_format); col += 1
            worksheet.write(row_idx, col, data_inizio_iscr, date_format); col += 1
            worksheet.write(row_idx, col, data_fine_iscr, date_format); col += 1
            worksheet.write(row_idx, col, ora_appello, time_format if ora_appello else ""); col += 1
            worksheet.write(row_idx, col, ""); col += 1 # Colonna J del file, non usata
            worksheet.write(row_idx, col, verbalizzazione or ""); col += 1
            worksheet.write(row_idx, col, def_appello or ""); col += 1
            worksheet.write(row_idx, col, gest_prenotazione or ""); col += 1
            worksheet.write(row_idx, col, "1" if riservato else "0"); col += 1
            worksheet.write(row_idx, col, tipo_iscr or ""); col += 1
            worksheet.write(row_idx, col, tipo_esame or ""); col += 1
            worksheet.write(row_idx, col, edificio or ""); col += 1
            worksheet.write(row_idx, col, aula or ""); col += 1
            worksheet.write(row_idx, col, matricola or ""); col += 1
            worksheet.write(row_idx, col, sede or ""); col += 1
            worksheet.write(row_idx, col, condizione_sql or ""); col += 1
            worksheet.write(row_idx, col, partizionamento or ""); col += 1
            worksheet.write(row_idx, col, partizione or ""); col += 1
            worksheet.write(row_idx, col, ""); col += 1 # Colonna X del file, non usata
            worksheet.write(row_idx, col, note_appello or ""); col += 1
            worksheet.write(row_idx, col, posti or ""); col += 1
            worksheet.write(row_idx, col, codice_turno or ""); col += 1
            worksheet.write(row_idx, col, "") # Colonna AB del file, non usata

        # Salva il workbook in memoria
        output = io.BytesIO()
        workbook.save(output)
        output.seek(0)

        # Prepara la risposta
        response = make_response(output.getvalue())
        response.headers['Content-Disposition'] = 'attachment; filename=esami.xls'
        response.headers['Content-type'] = 'application/vnd.ms-excel'
        
        return response

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@admin_bp.route('/upload-teachings', methods=['POST'])
def upload_teachings():
    if 'admin' not in request.cookies:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
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
        if 'cursor' in locals() and cursor:
            cursor.close()
        if conn:
            release_connection(conn)

@admin_bp.route('/upload-teachers', methods=['POST'])
def upload_teachers():
    if 'admin' not in request.cookies:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
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
        cursor.execute("DELETE FROM utenti")
        
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
                    INSERT INTO utenti (codicefiscale, matricola, email, nome, cognome)
                    VALUES (%s, %s, %s, %s, %s)
                """, (codicefiscale, matricola, email, nome, cognome))
                inserted_count += 1
        
        conn.commit()
        return jsonify({
            'status': 'success', 
            'message': f'Caricamento completato con successo. {inserted_count} utenti importati.'
        })
    
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if conn:
            release_connection(conn)

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
        
        # Date del secondo semestre
        inizio_secondo = data.get('inizio_secondo')
        fine_secondo = data.get('fine_secondo')
        
        # Date di pausa didattica
        pausa_primo_inizio = data.get('pausa_primo_inizio') or None
        pausa_primo_fine = data.get('pausa_primo_fine') or None
        pausa_secondo_inizio = data.get('pausa_secondo_inizio') or None
        pausa_secondo_fine = data.get('pausa_secondo_fine') or None
        
        # Date delle sessioni d'esame
        estiva_inizio = data.get('estiva_inizio')
        estiva_fine = data.get('estiva_fine')
        autunnale_inizio = data.get('autunnale_inizio')
        autunnale_fine = data.get('autunnale_fine')
        invernale_inizio = data.get('invernale_inizio')
        invernale_fine = data.get('invernale_fine')
        
        # Verifica che tutti i campi obbligatori siano presenti per la tabella CDS
        required_fields_cds = [
            codice_cds, anno_accademico, nome_corso, durata,
            inizio_primo, fine_primo, inizio_secondo, fine_secondo
        ]
        
        if any(field is None or field == "" for field in required_fields_cds):
            return jsonify({'status': 'error', 'message': 'Tutti i campi obbligatori per il CDS devono essere completati'}), 400
        
        # Verifica che i periodi d'esame abbiano date di inizio e fine
        period_pairs = [
            (estiva_inizio, estiva_fine, 'Sessione estiva'),
            (autunnale_inizio, autunnale_fine, 'Sessione autunnale'),
            (invernale_inizio, invernale_fine, 'Sessione invernale')
        ]
        
        for start, end, name in period_pairs:
            if (start and not end) or (not start and end):
                return jsonify({'status': 'error', 'message': f'Date di inizio e fine per {name} devono essere entrambe specificate'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verifica se esiste già un record per questo corso e anno accademico
        cursor.execute(
            "SELECT 1 FROM cds WHERE codice = %s AND anno_accademico = %s",
            (codice_cds, anno_accademico)
        )
        exists = cursor.fetchone()
        
        if exists:
            # Aggiorna il record esistente nella tabella cds
            cursor.execute("""
                UPDATE cds SET 
                nome_corso = %s,
                durata = %s,
                inizio_lezioni_primo_semestre = %s,
                fine_lezioni_primo_semestre = %s,
                inizio_lezioni_secondo_semestre = %s,
                fine_lezioni_secondo_semestre = %s
                WHERE codice = %s AND anno_accademico = %s
            """, (
                nome_corso, durata,
                inizio_primo, fine_primo,
                inizio_secondo, fine_secondo,
                codice_cds, anno_accademico
            ))
            message = f"Informazioni del corso {codice_cds} per l'anno accademico {anno_accademico} aggiornate con successo"
        else:
            # Inserisci un nuovo record nella tabella cds
            cursor.execute("""
                INSERT INTO cds (
                    codice, anno_accademico, nome_corso, durata,
                    inizio_lezioni_primo_semestre, fine_lezioni_primo_semestre,
                    inizio_lezioni_secondo_semestre, fine_lezioni_secondo_semestre
                ) VALUES (
                    %s, %s, %s, %s, 
                    %s, %s, %s, %s
                )
            """, (
                codice_cds, anno_accademico, nome_corso, durata,
                inizio_primo, fine_primo,
                inizio_secondo, fine_secondo
            ))
            message = f"Nuovo corso {codice_cds} per l'anno accademico {anno_accademico} creato con successo"
        
        # Aggiorna o inserisci i periodi d'esame
        # Prima, elimina tutti i periodi esistenti per questo CDS e anno accademico
        cursor.execute("""
            DELETE FROM periodi_esame 
            WHERE cds = %s AND anno_accademico = %s
        """, (codice_cds, anno_accademico))
        
        # Definizione dei periodi da inserire
        periodi = []
        
        # Aggiungi la sessione estiva se presente
        if estiva_inizio and estiva_fine:
            periodi.append(('ESTIVA', estiva_inizio, estiva_fine, 3))
            
        # Aggiungi la sessione autunnale se presente
        if autunnale_inizio and autunnale_fine:
            periodi.append(('AUTUNNALE', autunnale_inizio, autunnale_fine, 2))
            
        # Aggiungi la sessione invernale se presente
        if invernale_inizio and invernale_fine:
            periodi.append(('INVERNALE', invernale_inizio, invernale_fine, 3))
            
        # Aggiungi le pause didattiche se presenti
        if pausa_primo_inizio and pausa_primo_fine:
            periodi.append(('PAUSA_AUTUNNALE', pausa_primo_inizio, pausa_primo_fine, 1))
            
        if pausa_secondo_inizio and pausa_secondo_fine:
            periodi.append(('PAUSA_PRIMAVERILE', pausa_secondo_inizio, pausa_secondo_fine, 1))
            
        # Inserisci i periodi d'esame
        for tipo_periodo, inizio, fine, max_esami in periodi:
            cursor.execute("""
                INSERT INTO periodi_esame (cds, anno_accademico, tipo_periodo, inizio, fine, max_esami)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (codice_cds, anno_accademico, tipo_periodo, inizio, fine, max_esami))
        
        conn.commit()
        
        return jsonify({
            'status': 'success',
            'message': message
        })
        
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.rollback()
        return jsonify({'status': 'error', 'message': f'Si è verificato un errore: {str(e)}'}), 500
    
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere l'elenco dei corsi di studio (con duplicati per anno accademico)
@admin_bp.route('/getCdS')
def get_cds():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Recupera tutti i corsi di studio, inclusi quelli con stesso codice ma anni diversi
        cursor.execute("""
            SELECT c.codice, c.nome_corso, c.anno_accademico
            FROM cds c
            ORDER BY c.nome_corso, c.anno_accademico DESC
        """)
        
        cds_list = [{"codice": row[0], "nome_corso": row[1], "anno_accademico": row[2]} for row in cursor.fetchall()]
        return jsonify(cds_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# Nuova API per ottenere l'elenco dei corsi di studio senza duplicati (per il calendario)
@admin_bp.route('/getCdSDistinct')
def get_cds_distinct():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Recupera i corsi di studio solo con l'anno accademico più recente per ogni codice
        cursor.execute("""
            WITH ranked_cds AS (
                SELECT 
                    c.codice, 
                    c.nome_corso, 
                    c.anno_accademico,
                    ROW_NUMBER() OVER (PARTITION BY c.codice ORDER BY c.anno_accademico DESC) as rn
                FROM cds c
            )
            SELECT codice, nome_corso, anno_accademico
            FROM ranked_cds
            WHERE rn = 1
            ORDER BY nome_corso
        """)
        
        cds_list = [{"codice": row[0], "nome_corso": row[1], "anno_accademico": row[2]} for row in cursor.fetchall()]
        return jsonify(cds_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere i dati del calendario esami
@admin_bp.route('/getCalendarioEsami')
def get_calendario_esami():
    cds = request.args.get('cds')
    anno = request.args.get('anno')
    
    if not cds or not anno:
        return jsonify({"error": "Parametri mancanti"}), 400
    
    try:
        anno = int(anno)
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ottieni la durata del corso
        cursor.execute("SELECT durata FROM cds WHERE codice = %s AND anno_accademico = %s", (cds, anno))
        durata_result = cursor.fetchone()
        if not durata_result:
            return jsonify({"error": "Corso di studi non trovato"}), 404
            
        durata = durata_result[0]
        
        # Ottieni le date delle sessioni d'esame e delle pause didattiche dalla nuova tabella periodi_esame
        cursor.execute("""
            SELECT tipo_periodo, inizio, fine, max_esami
            FROM periodi_esame 
            WHERE cds = %s AND anno_accademico = %s
            ORDER BY inizio
        """, (cds, anno))
        
        periodi_results = cursor.fetchall()
        
        # Mappa per convertire i tipi di periodo dal database ai nomi visualizzati
        tipo_periodo_map = {
            'ESTIVA': 'Sessione Estiva',
            'AUTUNNALE': 'Sessione Autunnale',
            'INVERNALE': 'Sessione Invernale',
            'PAUSA_AUTUNNALE': 'Pausa Didattica Primo Semestre',
            'PAUSA_PRIMAVERILE': 'Pausa Didattica Secondo Semestre'
        }
        
        # Crea una lista di tutte le sessioni e pause didattiche
        sessioni = []
        periodi_map = {}
        
        # Dizionario per mappare numeri di mese ai nomi abbreviati
        mesi_nomi = {
            '01': 'GEN', '02': 'FEB', '03': 'MAR', '04': 'APR',
            '05': 'MAG', '06': 'GIU', '07': 'LUG', '08': 'AGO',
            '09': 'SET', '10': 'OTT', '11': 'NOV', '12': 'DIC'
        }
        
        for tipo_periodo, inizio, fine, max_esami in periodi_results:
            # Aggiungi alla lista delle sessioni
            nome_sessione = tipo_periodo_map.get(tipo_periodo, tipo_periodo)
            sessioni.append({
                "nome": nome_sessione,
                "inizio": inizio.isoformat(),
                "fine": fine.isoformat()
            })
            
            # Aggiungi i mesi di questo periodo ai periodi
            add_months_to_periods(periodi_map, inizio, fine, mesi_nomi)
        
        # Ottieni tutti gli insegnamenti per questo CdS con i relativi esami
        cursor.execute("""
            WITH insegnamenti_cds AS (
                SELECT 
                    i.codice, 
                    i.titolo, 
                    ic.anno_corso, 
                    ic.semestre
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento
                WHERE ic.cds = %s AND ic.anno_accademico = %s
            )
            SELECT 
                ic.codice, 
                ic.titolo, 
                ic.anno_corso, 
                ic.semestre,
                e.data_appello,
                EXTRACT(DAY FROM e.data_appello) as giorno,
                to_char(e.data_appello, 'MM') as mese,
                to_char(e.data_appello, 'YYYY') as anno,
                e.durata_appello
            FROM insegnamenti_cds ic
            LEFT JOIN esami e ON ic.codice = e.insegnamento
            ORDER BY ic.anno_corso, ic.semestre, ic.titolo
        """, (cds, anno))
        
        # Crea una struttura dati per organizzare gli insegnamenti e i loro esami
        insegnamenti = []
        insegnamenti_map = {}
        
        for row in cursor.fetchall():
            codice, titolo, anno_corso, semestre, data_appello, giorno, mese_numero, anno_str, durata_appello = row
            
            # Crea o recupera l'insegnamento
            if codice not in insegnamenti_map:
                insegnamento = {
                    "codice": codice,
                    "titolo": titolo,
                    "anno_corso": anno_corso,
                    "semestre": semestre,
                    "esami": []
                }
                insegnamenti_map[codice] = insegnamento
                insegnamenti.append(insegnamento)
            else:
                insegnamento = insegnamenti_map[codice]
            
            # Aggiungi l'esame se esiste
            if data_appello:
                # Crea un nome di periodo standardizzato
                nome_mese = mesi_nomi.get(mese_numero, f"M{mese_numero}")
                periodo_nome = f"{nome_mese} {anno_str}"
                
                # Aggiungi l'esame alla lista degli esami dell'insegnamento
                insegnamento["esami"].append({
                    "data": data_appello.isoformat(),
                    "giorno": int(giorno),
                    "periodo": periodo_nome,
                    "mese": int(mese_numero),
                    "anno": int(anno_str),
                    "durata": durata_appello
                })
        
        # Aggiungi periodi da tutti gli esami (nel caso non fossero già inclusi)
        for insegnamento in insegnamenti:
            for esame in insegnamento.get("esami", []):
                key = f"{esame['mese']:02d}-{esame['anno']}"
                if key not in periodi_map:
                    nome_mese = mesi_nomi.get(f"{esame['mese']:02d}", f"Mese {esame['mese']}")
                    periodi_map[key] = {
                        "nome": f"{nome_mese} {esame['anno']}",
                        "mese": esame['mese'],
                        "anno": esame['anno']
                    }
        
        # Converte il dizionario in lista e ordina i periodi per data
        periodi = list(periodi_map.values())
        periodi.sort(key=lambda x: (x["anno"], x["mese"]))
        
        # Costruisci e restituisci la risposta
        return jsonify({
            "durata": durata,
            "sessioni": sessioni,
            "periodi": periodi,
            "insegnamenti": insegnamenti
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# Funzione helper che usa un dizionario per tracciare periodi unici in modo efficiente
def add_months_to_periods(periodi_map, start_date, end_date, mesi_nomi):
    current = datetime(start_date.year, start_date.month, 1)
    end = datetime(end_date.year, end_date.month, 1)
    
    while current <= end:
        # Crea una chiave standardizzata (MM-YYYY)
        key = f"{current.month:02d}-{current.year}"
        
        # Se questo periodo non è già nella mappa, aggiungilo
        if key not in periodi_map:
            nome_mese = mesi_nomi.get(f"{current.month:02d}", f"M{current.month}")
            periodi_map[key] = {
                "nome": f"{nome_mese} {current.year}",
                "mese": current.month,
                "anno": current.year
            }
            
        # Passa al mese successivo
        month = current.month + 1
        year = current.year
        if month > 12:
            month = 1
            year += 1
        current = datetime(year, month, 1)

# API per ottenere i dettagli di un corso di studio
@admin_bp.route('/getCdsDetails')
def get_cds_details():
    if 'admin' not in request.cookies:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
        
    codice = request.args.get('codice')
    anno = request.args.get('anno')
    
    if not codice:
        return jsonify({'error': 'Codice CdS mancante'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query per ottenere le informazioni di base del CdS
        query_cds = """
            SELECT 
                codice, anno_accademico, nome_corso, durata,
                inizio_lezioni_primo_semestre, fine_lezioni_primo_semestre,
                inizio_lezioni_secondo_semestre, fine_lezioni_secondo_semestre
            FROM cds 
            WHERE codice = %s
        """
        params = [codice]
        
        # Se è specificato un anno, filtriamo per quell'anno specifico
        if anno:
            query_cds += " AND anno_accademico = %s"
            params.append(int(anno))
        else:
            # Altrimenti prendiamo il record più recente
            query_cds += " ORDER BY anno_accademico DESC LIMIT 1"
            
        cursor.execute(query_cds, params)
        
        result_cds = cursor.fetchone()
        if not result_cds:
            return jsonify({'error': 'Corso di studio non trovato'}), 404
            
        # Converti in un dizionario
        columns_cds = [col[0] for col in cursor.description]
        cds_data = dict(zip(columns_cds, result_cds))
        
        # Otteniamo l'anno accademico per recuperare i periodi d'esame
        anno_accademico = cds_data['anno_accademico']
        
        # Query per ottenere i periodi d'esame
        cursor.execute("""
            SELECT tipo_periodo, inizio, fine, max_esami
            FROM periodi_esame
            WHERE cds = %s AND anno_accademico = %s
        """, (codice, anno_accademico))
        
        periodi_data = {}
        
        # Mappa per convertire i tipi di periodo dal database ai nomi dei campi nella risposta
        tipo_periodo_field_map = {
            'ESTIVA': ('estiva_inizio', 'estiva_fine'),
            'AUTUNNALE': ('autunnale_inizio', 'autunnale_fine'),
            'INVERNALE': ('invernale_inizio', 'invernale_fine'),
            'PAUSA_AUTUNNALE': ('pausa_primo_inizio', 'pausa_primo_fine'),
            'PAUSA_PRIMAVERILE': ('pausa_secondo_inizio', 'pausa_secondo_fine')
        }
        
        # Processa i risultati dei periodi d'esame
        for tipo_periodo, inizio, fine, max_esami in cursor.fetchall():
            if tipo_periodo in tipo_periodo_field_map:
                inizio_field, fine_field = tipo_periodo_field_map[tipo_periodo]
                periodi_data[inizio_field] = inizio.isoformat() if inizio else None
                periodi_data[fine_field] = fine.isoformat() if fine else None
        
        # Combina i dati del CdS con i periodi d'esame
        cds_data.update(periodi_data)
        
        # Converti le date in stringhe
        for key, value in cds_data.items():
            if isinstance(value, datetime.date):
                cds_data[key] = value.isoformat()
                
        return jsonify(cds_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)