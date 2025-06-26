from flask import Blueprint, request, jsonify, session, send_file
from datetime import datetime, timedelta, date, time
import io
import logging
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from db import get_db_connection, release_connection
from auth import require_auth
from exams import controlla_vincoli, inserisci_esami

import_bp = Blueprint('import_bp', __name__)

@import_bp.route('/api/get-exam-template')
@require_auth
def get_exam_template():
    """Genera template Excel per inserimento esami."""
    username = request.args.get('docente')
    anno = request.args.get('anno')
    
    if not username:
        return jsonify({"error": "Username mancante"}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query per insegnamenti del docente con nomi CdS
        query = """
            SELECT DISTINCT i.codice, i.titolo, c.nome_corso, c.codice as cds_codice
            FROM insegnamenti i
            JOIN insegnamento_docente id ON i.id = id.insegnamento
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico
            WHERE id.docente = %s
        """
        
        params = [username]
        if anno:
            query += " AND id.annoaccademico = %s"
            params.append(anno)
            
        query += " ORDER BY c.nome_corso, i.titolo"
        cursor.execute(query, params)
        insegnamenti = cursor.fetchall()
        
        # Recupera aule
        cursor.execute("SELECT nome FROM aule WHERE nome != 'Studio docente DMI' ORDER BY nome")
        aule = [row[0] for row in cursor.fetchall()]
        aule.append("Studio docente DMI")  # Aggiungi in fondo
        
        cursor.close()
        release_connection(conn)
        
        if not insegnamenti:
            return jsonify({"error": "Nessun insegnamento trovato"}), 404
        
        # Crea Excel con struttura semplificata
        wb = Workbook()
        ws = wb.active
        ws.title = "Esami"
        
        # Headers aggiornati con formati specificati
        headers = [
            "CdS", 
            "Insegnamento", 
            "Apertura Appelli",
            "Data (DD-MM-YYYY)", 
            "Ora (HH:MM)", 
            "Durata (minuti)",
            "Aula", 
            "Inizio Iscrizione (DD-MM-YYYY)", 
            "Fine Iscrizione (DD-MM-YYYY)",
            "Verbalizzazione", 
            "Tipo Esame", 
            "Note"
        ]
        
        # Imposta headers con stile
        for col, header in enumerate(headers, 1):
            cell = ws.cell(1, col, header)
            cell.font = Font(bold=True, color="FFFFFF", name="Arial")
            cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
            cell.alignment = Alignment(horizontal="left", vertical="center")
            
        # Imposta larghezza colonne ottimizzate per contenuto
        column_widths = [35, 45, 18, 18, 12, 15, 20, 20, 20, 35, 18, 25]
        for col, width in enumerate(column_widths, 1):
            ws.column_dimensions[get_column_letter(col)].width = width
        
        # Aggiungi righe con valori precompilati appropriati
        num_rows_to_add = len(insegnamenti)
        
        for row_idx in range(2, num_rows_to_add + 2):
            ins_data = insegnamenti[row_idx - 2] if row_idx - 2 < len(insegnamenti) else None
            
            if ins_data:
                codice_ins, titolo_ins, nome_cds, cds_codice = ins_data
                
                # CdS Nome con codice tra parentesi (precompilato)
                cds_display = f"{nome_cds} ({cds_codice})"
                cell = ws.cell(row_idx, 1, cds_display)
                cell.font = Font(name="Arial")
                cell.alignment = Alignment(horizontal="left")
                
                # Insegnamento (precompilato)
                cell = ws.cell(row_idx, 2, titolo_ins)
                cell.font = Font(name="Arial")
                cell.alignment = Alignment(horizontal="left")
                
                # Apertura Appelli (precompilato con "Sì")
                cell = ws.cell(row_idx, 3, "Sì")
                cell.font = Font(name="Arial")
                cell.alignment = Alignment(horizontal="left")
                
                # Verbalizzazione (precompilato)
                cell = ws.cell(row_idx, 10, "Prova finale con pubblicazione")
                cell.font = Font(name="Arial")
                cell.alignment = Alignment(horizontal="left")
                
                # Nascondi colonne tecniche per elaborazione
                ws.cell(row_idx, 13, codice_ins)  # Codice insegnamento (nascosto)
                ws.cell(row_idx, 14, cds_codice)  # Codice CdS (nascosto)
            
            # Imposta stile per le celle vuote da compilare
            empty_columns = [4, 5, 6, 7, 8, 9, 11, 12]  # Data, Ora, Durata, Aula, Date iscrizione, Tipo Esame, Note
            for col in empty_columns:
                cell = ws.cell(row_idx, col)
                cell.font = Font(name="Arial")
                cell.alignment = Alignment(horizontal="left")
                cell.fill = PatternFill(fill_type=None)  # Sfondo trasparente
                
                # Imposta formati specifici per tipo di dato
                if col == 4 or col == 8 or col == 9:  # Colonne Data (formato italiano)
                    cell.number_format = 'DD-MM-YYYY'
                elif col == 5:  # Colonna Ora
                    cell.number_format = 'HH:MM'
                elif col == 6:  # Colonna Durata
                    cell.number_format = '0'  # Numero intero
        
        # Nascondi colonne tecniche
        ws.column_dimensions['M'].hidden = True  # Codice insegnamento
        ws.column_dimensions['N'].hidden = True  # Codice CdS
        
        # Aggiungi validazioni per facilitare la compilazione
        if num_rows_to_add > 0:
            last_row = num_rows_to_add + 1
            
            # Validazione Apertura Appelli
            apertura_values = "Sì,No"
            dv_apertura = DataValidation(type="list", formula1=f'"{apertura_values}"')
            dv_apertura.add(f"C2:C{last_row}")
            ws.add_data_validation(dv_apertura)
            
            # Validazione aule
            if aule:
                aule_list = ",".join(aule[:255])  # Limita per evitare errori Excel
                dv_aule = DataValidation(type="list", formula1=f'"{aule_list}"')
                dv_aule.add(f"G2:G{last_row}")
                ws.add_data_validation(dv_aule)
            
            # Validazione verbalizzazione (valori user-friendly)
            verb_values = "Prova finale,Prova finale con pubblicazione,Prova parziale,Prova parziale con pubblicazione"
            dv_verb = DataValidation(type="list", formula1=f'"{verb_values}"')
            dv_verb.add(f"J2:J{last_row}")
            ws.add_data_validation(dv_verb)
            
            # Validazione tipo esame
            tipo_values = "Scritto,Orale,Scritto e orale"
            dv_tipo = DataValidation(type="list", formula1=f'"{tipo_values}"')
            dv_tipo.add(f"K2:K{last_row}")
            ws.add_data_validation(dv_tipo)
        
        # Aggiungi istruzioni aggiornate in un foglio separato
        ws_istruzioni = wb.create_sheet("Istruzioni")
        istruzioni = [
            "ISTRUZIONI PER LA COMPILAZIONE DEL TEMPLATE ESAMI",
            "",
            "CAMPI OBBLIGATORI:",
            "• CdS e Insegnamento: precompilati automaticamente",
            "• Apertura Appelli: precompilato con Sì (modificabile)",
            "• Data: formato DD-MM-YYYY (esempio: 15-06-2025)",
            "• Ora: formato HH:MM (esempio: 09:00, 14:30)",
            "• Durata: solo il numero di minuti (esempio: 120)",
            "• Aula: selezionare dalla lista a tendina",
            "",
            "CAMPI OPZIONALI:",
            "• Date Iscrizione: se vuote, verranno calcolate automaticamente",
            "  (Inizio: 30 giorni prima dell'esame, Fine: 1 giorno prima)",
            "• Verbalizzazione: precompilato, modificabile dalla lista",
            "• Tipo Esame: Scritto, Orale o Scritto e orale",
            "• Note: campo libero per annotazioni",
            "",
            "SUGGERIMENTI:",
            "• Compilare una riga per ogni esame da inserire",
            "• Le validazioni guidano nella compilazione corretta",
            "• Studio docente DMI non ha limiti di posti",
            "• Gli esami con 'Apertura Appelli = No' non contano per il minimo annuale",
            "• Il formato data è quello italiano (DD-MM-YYYY)"
        ]
        
        for row, istruzione in enumerate(istruzioni, 1):
            cell = ws_istruzioni.cell(row, 1, istruzione)
            if row == 1:
                cell.font = Font(bold=True, size=14, name="Arial")
            elif istruzione.endswith(":"):
                cell.font = Font(bold=True, name="Arial")
            else:
                cell.font = Font(name="Arial")
            cell.alignment = Alignment(horizontal="left")
        
        ws_istruzioni.column_dimensions['A'].width = 80
        
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        return send_file(buffer, 
                        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        as_attachment=True, 
                        download_name=f"template_esami_{username}.xlsx")
        
    except Exception as e:
        logging.error(f"Errore template: {e}")
        return jsonify({"error": str(e)}), 500

@import_bp.route('/api/import-exams-from-file', methods=['POST'])
@require_auth
def import_exams_from_file():
    """Importa esami da Excel con mappatura automatica dei valori."""
    file = request.files.get('file')
    if not file or not file.filename.endswith('.xlsx'):
        return jsonify({"success": False, "message": "File XLSX richiesto"}), 400
    
    username = session.get('username')
    anno = request.form.get('anno_accademico')
    bypass = request.form.get('bypass_checks') == 'true'
    
    if not username or not anno:
        return jsonify({"success": False, "message": "Dati mancanti"}), 401
    
    try:
        # Mappature per conversione valori user-friendly -> valori tecnici
        verbalizzazione_map = {
            "Prova finale": "FSS",
            "Prova finale con pubblicazione": "FWP", 
            "Prova parziale": "PAR",
            "Prova parziale con pubblicazione": "PPP"
        }
        
        tipo_esame_map = {
            "Scritto": "S",
            "Orale": "O", 
            "Scritto e orale": "SO"
        }
        
        tipo_appello_map = {
            "Prova finale": "PF",
            "Prova finale con pubblicazione": "PF",
            "Prova parziale": "PP", 
            "Prova parziale con pubblicazione": "PP"
        }
        
        # Carica aule valide
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT nome FROM aule")
        aule_valide = {row[0] for row in cursor.fetchall()}
        cursor.close()
        release_connection(conn)
        
        # Processa Excel
        wb = load_workbook(io.BytesIO(file.read()))
        rows = list(wb.active.rows)[1:]  # Salta header
        
        esami = []
        errori = []
        
        for i, row in enumerate(rows, 2):
            values = [cell.value for cell in row]
            
            if not any(values[:2]):  # Salta righe vuote (CdS e Insegnamento)
                continue
                
            try:
                # Estrai valori dalla struttura riorganizzata
                cds_nome = values[0]
                insegnamento_nome = values[1] 
                apertura_appelli = values[2]
                data = values[3]
                ora = values[4]
                durata = values[5]
                aula = values[6]
                inizio_iscr = values[7]
                fine_iscr = values[8]
                verbalizzazione_friendly = values[9]
                tipo_esame_friendly = values[10]
                note = values[11]
                
                # Valori nascosti per elaborazione
                codice_insegnamento = values[12] if len(values) > 12 else None
                codice_cds = values[13] if len(values) > 13 else None
                
                if not all([cds_nome, insegnamento_nome, data, ora, aula]):
                    errori.append(f"Riga {i}: dati obbligatori mancanti")
                    continue
                
                if aula not in aule_valide:
                    errori.append(f"Riga {i}: aula '{aula}' non valida")
                    continue
                
                # Parse e validazione data (supporta sia DD-MM-YYYY che YYYY-MM-DD)
                if isinstance(data, (datetime, date)):
                    data_str = data.strftime('%Y-%m-%d')
                else:
                    try:
                        data_str_input = str(data)
                        # Prova prima formato italiano DD-MM-YYYY
                        if len(data_str_input) == 10 and '-' in data_str_input:
                            parts = data_str_input.split('-')
                            if len(parts[0]) == 2:  # Formato DD-MM-YYYY
                                data_obj = datetime.strptime(data_str_input, '%d-%m-%Y')
                            else:  # Formato YYYY-MM-DD
                                data_obj = datetime.strptime(data_str_input, '%Y-%m-%d')
                        else:
                            # Fallback per altri formati
                            data_obj = datetime.strptime(data_str_input, '%d-%m-%Y')
                        data_str = data_obj.strftime('%Y-%m-%d')
                    except:
                        errori.append(f"Riga {i}: formato data non valido (usare DD-MM-YYYY)")
                        continue
                
                # Parse ora
                if isinstance(ora, (time, datetime)):
                    ora_h, ora_m = ora.hour, ora.minute
                elif isinstance(ora, str) and ':' in ora:
                    try:
                        ora_h, ora_m = map(int, ora.split(':'))
                    except:
                        errori.append(f"Riga {i}: formato ora non valido (usare HH:MM)")
                        continue
                else:
                    errori.append(f"Riga {i}: formato ora non valido")
                    continue
                
                # Validazione durata
                if not durata:
                    durata = 120
                else:
                    try:
                        durata = int(durata)
                        if durata < 30 or durata > 720:
                            errori.append(f"Riga {i}: durata deve essere tra 30 e 720 minuti")
                            continue
                    except:
                        errori.append(f"Riga {i}: durata deve essere un numero")
                        continue
                
                # Conversione valori user-friendly
                verbalizzazione = verbalizzazione_map.get(verbalizzazione_friendly, "FSS")
                tipo_esame = tipo_esame_map.get(tipo_esame_friendly, "S") 
                tipo_appello = tipo_appello_map.get(verbalizzazione_friendly, "PF")
                
                # Apertura appelli
                mostra_calendario = str(apertura_appelli).lower() in ['sì', 'si', 'yes', 'true', '1']
                
                # Calcola date iscrizione se mancanti (gestisce formato italiano)
                data_obj = datetime.strptime(data_str, '%Y-%m-%d')
                
                if not inizio_iscr:
                    inizio_iscr = (data_obj - timedelta(days=30)).strftime('%Y-%m-%d')
                elif isinstance(inizio_iscr, (datetime, date)):
                    inizio_iscr = inizio_iscr.strftime('%Y-%m-%d')
                else:
                    try:
                        # Prova formato italiano
                        inizio_obj = datetime.strptime(str(inizio_iscr), '%d-%m-%Y')
                        inizio_iscr = inizio_obj.strftime('%Y-%m-%d')
                    except:
                        inizio_iscr = str(inizio_iscr)
                
                if not fine_iscr:
                    fine_iscr = (data_obj - timedelta(days=1)).strftime('%Y-%m-%d')
                elif isinstance(fine_iscr, (datetime, date)):
                    fine_iscr = fine_iscr.strftime('%Y-%m-%d')
                else:
                    try:
                        # Prova formato italiano
                        fine_obj = datetime.strptime(str(fine_iscr), '%d-%m-%Y')
                        fine_iscr = fine_obj.strftime('%Y-%m-%d')
                    except:
                        fine_iscr = str(fine_iscr)
                
                # Usa codice insegnamento se disponibile, altrimenti cerca per nome
                if not codice_insegnamento:
                    # Fallback: cerca insegnamento per nome (meno affidabile)
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute("SELECT codice FROM insegnamenti WHERE titolo LIKE %s LIMIT 1", 
                                 (f"%{insegnamento_nome}%",))
                    result = cursor.fetchone()
                    cursor.close()
                    release_connection(conn)
                    
                    if not result:
                        errori.append(f"Riga {i}: insegnamento '{insegnamento_nome}' non trovato")
                        continue
                    codice_insegnamento = result[0]
                
                esame = {
                    'insegnamenti': [codice_insegnamento],
                    'docente': username,
                    'anno_accademico': int(anno),
                    'sezioni_appelli': [{
                        'descrizione': f"Appello {insegnamento_nome}",
                        'data_appello': data_str,
                        'ora_h': str(ora_h).zfill(2),
                        'ora_m': str(ora_m).zfill(2),
                        'ora_appello': f"{ora_h:02d}:{ora_m:02d}",
                        'durata': str(durata),
                        'durata_appello': durata,
                        'aula': aula,
                        'inizio_iscrizione': inizio_iscr,
                        'fine_iscrizione': fine_iscr,
                        'verbalizzazione': verbalizzazione,
                        'tipo_esame': tipo_esame,
                        'note_appello': note or "",
                        'tipo_appello': tipo_appello,
                        'mostra_nel_calendario': mostra_calendario,
                        'tipo_iscrizione': "SOC" if tipo_esame == "SO" else tipo_esame,
                        'definizione_appello': 'STD',
                        'gestione_prenotazione': 'STD',
                        'riservato': False,
                        'posti': None,
                        'periodo': 1 if ora_h >= 14 else 0
                    }]
                }
                
                # Controlli opzionali
                if not bypass:
                    ok, msg = controlla_vincoli(esame)
                    if not ok:
                        errori.append(f"Riga {i}: {msg}")
                        continue
                
                esami.append(esame)
                
            except Exception as e:
                errori.append(f"Riga {i}: errore elaborazione - {str(e)}")
        
        if not esami:
            return jsonify({
                "success": False,
                "message": f"Nessun esame valido trovato. {len(errori)} errori rilevati.",
                "formatErrors": errori,
                "totalErrors": len(errori)
            }), 400
        
        # Inserisci esami
        successi = 0
        fallimenti = []
        
        for esame in esami:
            try:
                inserisci_esami(esame)
                successi += 1
            except Exception as e:
                # Trova il nome dell'insegnamento per un errore più chiaro
                try:
                    conn_temp = get_db_connection()
                    cursor_temp = conn_temp.cursor()
                    cursor_temp.execute("SELECT titolo FROM insegnamenti WHERE codice = %s", (esame['insegnamenti'][0],))
                    result = cursor_temp.fetchone()
                    titolo = result[0] if result else esame['insegnamenti'][0]
                    cursor_temp.close()
                    release_connection(conn_temp)
                except:
                    titolo = esame['insegnamenti'][0]
                
                fallimenti.append(f"Inserimento {titolo}: {str(e)}")
        
        # Prepara risposta con errori categorizzati
        message = f"{successi} esami inseriti con successo"
        if bypass:
            message += " (controlli bypassati)"
        
        total_errors = len(errori) + len(fallimenti)
        if total_errors > 0:
            message += f", {total_errors} errori rilevati"
        
        return jsonify({
            "success": successi > 0,
            "message": message,
            "importedCount": successi,
            "totalErrors": total_errors,
            "formatErrors": errori,
            "insertionErrors": fallimenti
        })
    
    except Exception as e:
        logging.error(f"Errore import: {e}")
        return jsonify({"success": False, "message": f"Errore durante l'importazione: {e}"}), 500