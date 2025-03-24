from flask import Blueprint, request, make_response, jsonify
from db import get_db_connection, release_connection
import io
import csv
from datetime import datetime, timedelta
import xlwt
import xlrd
from psycopg2.extras import DictCursor
import re
import requests

admin_bp = Blueprint('admin', __name__, url_prefix='/oh-issa/api')


@admin_bp.route('/uploadFileUGOV', methods=['POST'])
def upload_ugov():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
  
  conn = None
  try:
    if 'file' not in request.files:
      return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400
    
    file = request.files['file']
    if file.filename == '':
      return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400
      
    if not file.filename.endswith(('.xls', '.xlsx')):
      return jsonify({'status': 'error', 'message': 'Formato file non supportato. Usare file Excel (.xls, .xlsx)'}), 400
    
    # Leggi il file Excel
    workbook = xlrd.open_workbook(file_contents=file.read())
    sheet = workbook.sheet_by_index(0)  # Assumiamo che i dati siano nel primo foglio
    
    # Dizionari per tenere traccia degli elementi già elaborati
    insegnamenti_set = set()
    cds_set = set()
    utenti_set = set()
    insegnamento_docente_set = set()
    
    # Mappa indici colonne (potrebbero variare)
    colonna_indices = {
      'anno_accademico': 0,       # A
      'cod_cds': 6,               # G
      'des_cds': 8,               # I
      'anno_reg_did': 11,         # L
      'des_curriculum': 13,       # N
      'cod_insegnamento': 15,     # P
      'des_insegnamento': 16,     # Q
      'cod_unita_didattica': 28,  # AC
      'des_periodo': 46,          # AU
      'matricola_docente': 67,    # BP
      'cognome_docente': 68,      # BQ
      'nome_docente': 69,         # BR
      'username_docente': 70,     # BS
      'mutuato_da_z': 25,         # Z
      'mutuato_da_bk': 62         # BK
    }
    
    # Verifica header per determinare gli indici corretti
    if sheet.nrows > 0:
      header = [str(sheet.cell_value(0, i)).strip().upper() for i in range(sheet.ncols)]
      
      # Mappa nomi colonne a indici
      header_map = {
        'ANNO OFFERTA': 'anno_accademico',
        'ANNO REGOLAMENTO DIDATTICO': 'anno_reg_did',
        'COD. CORSO DI STUDIO': 'cod_cds',
        'DES. CORSO DI STUDIO': 'des_cds',
        'DES. CURRICULUM': 'des_curriculum',
        'COD. INSEGNAMENTO': 'cod_insegnamento',
        'DES. INSEGNAMENTO': 'des_insegnamento',
        'COD. UNITÀ DIDATTICA': 'cod_unita_didattica',
        'DES. PERIODO UNITÀ DIDATTICA': 'des_periodo',
        'MATRICOLA DOCENTE': 'matricola_docente',
        'COGNOME DOCENTE': 'cognome_docente',
        'NOME DOCENTE': 'nome_docente',
        'USERNAME': 'username_docente',
        'MUTUATA DA': 'mutuato_da_z'
      }
      
      # Aggiorna gli indici in base all'header reale
      for i, col_name in enumerate(header):
        for key, value in header_map.items():
          if key in col_name:
            colonna_indices[value] = i
            break
        # Cerca anche per BK in base alle corrispondenze nel nome della colonna
        if ('MUTUA' in col_name or 'CONDIV' in col_name) and i >= 60:
          colonna_indices['mutuato_da_bk'] = i
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Dati per l'inserimento
    insegnamenti_data = []
    insegnamenti_cds_data = []
    cds_data = []
    utenti_data = []
    insegnamento_docente_data = []
    
    # Mappatura periodi a semestri
    periodo_to_semestre = {
      'Primo Semestre': 1,
      'Secondo Semestre': 2
    }
    # Valore predefinito per annuale (quando des_periodo è null o non riconosciuto)
    default_semestre = 3  # 3 = annuale
    
    # Funzione per estrarre il codice insegnamento dalla stringa di mutuazione
    def estrai_codice_mutuato(text):
      if not text:
        return None
        
      # Pattern per riconoscere il codice dell'insegnamento (es. A002080)
      match = re.search(r'(?:Af\s+)?([A-Z][0-9]{6})', str(text))
      if match:
        return match.group(1)
      return None
    
    # Processa le righe (salta l'header)
    for row_idx in range(1, sheet.nrows):
      try:
        # Estrai i valori dalle colonne
        anno_accademico = int(float(sheet.cell_value(row_idx, colonna_indices['anno_accademico'])))
        
        # L'anno del corso dell'insegnamento non è nel file excel, quindi lo calcolo come differenza tra anno_accademico e anno_reg_did + 1, lo so è brutto ma non c'è alternativa
        try:
          anno_reg_did = int(float(sheet.cell_value(row_idx, colonna_indices['anno_reg_did'])))
          anno_corso = anno_accademico - anno_reg_did + 1
          # Verifica che l'anno corso sia valido
          if anno_corso < 1 or anno_corso > 3:  # Assumo max 3 anni
            anno_corso = 1  # Valore predefinito in caso di calcolo errato
        except:
          anno_corso = 1  # Valore predefinito se c'è un errore
        
        cod_cds = str(sheet.cell_value(row_idx, colonna_indices['cod_cds'])).strip()
        des_cds = str(sheet.cell_value(row_idx, colonna_indices['des_cds'])).strip()
        des_curriculum = str(sheet.cell_value(row_idx, colonna_indices['des_curriculum'])).strip()
        
        # Usa cod_unita_didattica se disponibile, altrimenti cod_insegnamento
        cod_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['cod_unita_didattica'])).strip()
        if not cod_insegnamento:
          cod_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['cod_insegnamento'])).strip()
        
        des_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['des_insegnamento'])).strip()
        
        # Estrai periodo e converti in semestre
        des_periodo_raw = sheet.cell_value(row_idx, colonna_indices['des_periodo'])
        # Gestiamo il caso in cui il valore sia vuoto o null
        des_periodo = str(des_periodo_raw).strip() if des_periodo_raw else ""
        semestre = periodo_to_semestre.get(des_periodo, default_semestre)
        
        # Estrai dati docente
        matricola_docente = str(sheet.cell_value(row_idx, colonna_indices['matricola_docente'])).strip()
        cognome_docente = str(sheet.cell_value(row_idx, colonna_indices['cognome_docente'])).strip()
        nome_docente = str(sheet.cell_value(row_idx, colonna_indices['nome_docente'])).strip()
        username_docente = str(sheet.cell_value(row_idx, colonna_indices['username_docente'])).strip()
        
        # Estrai informazioni sulla mutuazione dalle colonne Z e BK
        mutuato_da_z = estrai_codice_mutuato(sheet.cell_value(row_idx, colonna_indices['mutuato_da_z']))
        mutuato_da_bk = estrai_codice_mutuato(sheet.cell_value(row_idx, colonna_indices['mutuato_da_bk']))
        
        # Usa il primo codice mutuazione disponibile
        mutuato_da = mutuato_da_z or mutuato_da_bk
        
        # Verifica che i dati essenziali siano presenti
        if not cod_insegnamento or not des_insegnamento or not cod_cds or not des_cds:
          continue
        
        # Aggiungi insegnamento se non già presente
        if cod_insegnamento not in insegnamenti_set:
          insegnamenti_data.append((cod_insegnamento, des_insegnamento))
          insegnamenti_set.add(cod_insegnamento)
        
        # Aggiungi CdS se non già presente
        cds_key = (cod_cds, anno_accademico, des_curriculum)
        if cds_key not in cds_set:
          cds_data.append((cod_cds, anno_accademico, des_cds, des_curriculum))
          cds_set.add(cds_key)
        
        # Aggiungi insegnamento_cds
        insegnamenti_cds_key = (cod_insegnamento, anno_accademico, cod_cds)
        if insegnamenti_cds_key not in insegnamenti_cds_data:
          insegnamenti_cds_data.append((cod_insegnamento, anno_accademico, cod_cds, anno_corso, semestre, mutuato_da))
        
        # Aggiungi utente se non già presente e se abbiamo un username
        if username_docente and username_docente not in utenti_set:
          utenti_data.append((username_docente, matricola_docente, nome_docente, cognome_docente, True, False))
          utenti_set.add(username_docente)
        
        # Aggiungi insegnamento_docente se non già presente e se abbiamo un username
        if username_docente:
          insegnamento_docente_key = (cod_insegnamento, username_docente, anno_accademico)
          if insegnamento_docente_key not in insegnamento_docente_set:
            insegnamento_docente_data.append((cod_insegnamento, username_docente, anno_accademico))
            insegnamento_docente_set.add(insegnamento_docente_key)
      
      except Exception as row_error:
        print(f"Errore nell'elaborazione della riga {row_idx}: {str(row_error)}")
        continue
    
    # Inserisci dati nel database
    # 1. Cds
    for item in cds_data:
      try:
        cursor.execute("""
          INSERT INTO cds (codice, anno_accademico, nome_corso, curriculum)
          VALUES (%s, %s, %s, %s)
          ON CONFLICT (codice, anno_accademico) DO UPDATE 
          SET nome_corso = EXCLUDED.nome_corso
        """, item)
      except Exception as e:
        print(f"Errore nell'inserimento CDS {item}: {str(e)}")
    
    # 2. Insegnamenti
    for item in insegnamenti_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamenti (codice, titolo)
          VALUES (%s, %s)
          ON CONFLICT (codice) DO UPDATE 
          SET titolo = EXCLUDED.titolo
        """, item)
      except Exception as e:
        print(f"Errore nell'inserimento insegnamento {item}: {str(e)}")
    
    # 3. Insegnamenti_cds
    for item in insegnamenti_cds_data:
      try:
        # Verifica se esiste l'insegnamento mutuato e crea un placeholder se necessario
        mutuato_da = item[5]  # L'indice 5 contiene mutuato_da nell'array
        if mutuato_da and mutuato_da not in insegnamenti_set:
          # Se l'insegnamento mutuato non esiste nel database, crealo come placeholder
          cursor.execute("""
            INSERT INTO insegnamenti (codice, titolo)
            VALUES (%s, %s)
            ON CONFLICT (codice) DO NOTHING
          """, (mutuato_da, f"Placeholder per insegnamento mutuato {mutuato_da}"))
          insegnamenti_set.add(mutuato_da)
          print(f"Creato placeholder per insegnamento mutuato {mutuato_da}")
        
        cursor.execute("""
          INSERT INTO insegnamenti_cds 
          (insegnamento, anno_accademico, cds, anno_corso, semestre, mutuato_da)
          VALUES (%s, %s, %s, %s, %s, %s)
          ON CONFLICT (insegnamento, anno_accademico, cds) DO UPDATE 
          SET anno_corso = EXCLUDED.anno_corso,
            semestre = EXCLUDED.semestre,
            mutuato_da = EXCLUDED.mutuato_da
        """, item)
      except Exception as e:
        print(f"Errore nell'inserimento insegnamento_cds {item}: {str(e)}")
    
    # 4. Utenti
    for item in utenti_data:
      try:
        cursor.execute("""
          INSERT INTO utenti (username, matricola, nome, cognome, permessi_docente, permessi_admin)
          VALUES (%s, %s, %s, %s, %s, %s)
          ON CONFLICT (username) DO UPDATE 
          SET matricola = EXCLUDED.matricola,
            nome = EXCLUDED.nome,
            cognome = EXCLUDED.cognome,
            permessi_docente = EXCLUDED.permessi_docente
        """, item)
      except Exception as e:
        print(f"Errore nell'inserimento utente {item}: {str(e)}")
    
    # 5. Insegnamento_docente
    for item in insegnamento_docente_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamento_docente (insegnamento, docente, annoaccademico)
          VALUES (%s, %s, %s)
          ON CONFLICT (insegnamento, docente, annoaccademico) DO NOTHING
        """, item)
      except Exception as e:
        print(f"Errore nell'inserimento insegnamento_docente {item}: {str(e)}")
    
    # Commit delle modifiche
    conn.commit()
    
    # Statistiche sull'importazione
    stats = {
      'cds': len(cds_data),
      'insegnamenti': len(insegnamenti_data),
      'insegnamenti_cds': len(insegnamenti_cds_data),
      'utenti': len(utenti_data),
      'insegnamento_docente': len(insegnamento_docente_data)
    }
    
    return jsonify({
      'status': 'success',
      'message': f'Importazione completata con successo.',
      'details': f"""
        Importati:
        - {stats['cds']} corsi di studio
        - {stats['insegnamenti']} insegnamenti
        - {stats['insegnamenti_cds']} assegnazioni insegnamento-CDS
        - {stats['utenti']} docenti
        - {stats['insegnamento_docente']} assegnazioni docente-insegnamento
      """
    })
  
  except Exception as e:
    if conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': f'Errore durante l\'importazione: {str(e)}'}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if conn:
      release_connection(conn)

@admin_bp.route('/downloadFileESSE3')
def download_esse3():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
      SELECT 
        e.tipo_appello,           -- Tipo appello
        ic.anno_accademico,       -- Anno
        ic.cds,                   -- CDS
        i.codice,                 -- AD
        e.descrizione,            -- Des. Appello
        e.data_appello,           -- Data Appello
        e.data_inizio_iscrizione, -- Data inizio iscrizione
        e.data_fine_iscrizione,   -- Data fine iscrizione
        e.ora_appello,            -- Ora appello
        e.verbalizzazione,        -- Verbalizzazione
        e.definizione_appello,    -- Def. App.
        e.gestione_prenotazione,  -- Gest. Pren.
        e.riservato,              -- Riservato
        e.tipo_iscrizione,        -- Tipo Iscr.
        e.tipo_esame,             -- Tipo Esa.
        a.edificio,               -- Edificio
        a.nome,                   -- Nome Aula (modificato da e.aula)
        d.matricola,              -- Matricola Docente
        a.sede,                   -- Sede
        e.condizione_sql,         -- Condizione SQL
        e.partizionamento,        -- Partizionamento
        e.partizione,             -- Partizione
        e.note_appello,           -- Note Appello
        e.posti,                  -- Posti
        e.codice_turno            -- Codice Turno
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.codice
      LEFT JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento 
        AND ic.anno_accademico = EXTRACT(YEAR FROM e.data_appello) - 1
      LEFT JOIN aule a ON e.aula = a.codice
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
      worksheet.write(row_idx, col, tipo_esame or ""); col += 1
      worksheet.write(row_idx, col, tipo_iscr or ""); col += 1
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

@admin_bp.route('/save-cds-dates', methods=['POST'])
def save_cds_dates():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
  
  try:
    data = request.get_json()
    
    # Log dei dati ricevuti per debug
    print("Dati ricevuti nel backend:", data)
    
    # Estrai i parametri dal JSON ricevuto
    codice_cds = data.get('codice_cds')
    print("Codice CdS estratto:", codice_cds)
    
    if not codice_cds:
      return jsonify({'status': 'error', 'message': 'Codice CdS mancante'}), 400
    
    # Gestisci correttamente la conversione dell'anno accademico
    anno_acc_raw = data.get('anno_accademico')
    print("Anno accademico ricevuto:", anno_acc_raw, "tipo:", type(anno_acc_raw))
    
    if anno_acc_raw is None:
      return jsonify({'status': 'error', 'message': 'Anno accademico mancante'}), 400
    
    try:
      anno_accademico = int(anno_acc_raw)
    except (ValueError, TypeError) as e:
      return jsonify({'status': 'error', 'message': f'Anno accademico non valido: {anno_acc_raw}. Errore: {str(e)}'}), 400
      
    nome_corso = data.get('nome_corso')
    if not nome_corso:
      return jsonify({'status': 'error', 'message': 'Nome corso mancante'}), 400
    
    # Date del primo semestre
    inizio_primo = data.get('inizio_primo')
    fine_primo = data.get('fine_primo')
    
    # Date del secondo semestre
    inizio_secondo = data.get('inizio_secondo')
    fine_secondo = data.get('fine_secondo')
    
    # Date di pausa didattica
    pausa_primo_inizio = data.get('pausa_primo_inizio') if data.get('pausa_primo_inizio') != "" else None
    pausa_primo_fine = data.get('pausa_primo_fine') if data.get('pausa_primo_fine') != "" else None
    pausa_secondo_inizio = data.get('pausa_secondo_inizio') if data.get('pausa_secondo_inizio') != "" else None
    pausa_secondo_fine = data.get('pausa_secondo_fine') if data.get('pausa_secondo_fine') != "" else None
    
    # Date delle sessioni d'esame
    anticipata_inizio = data.get('anticipata_inizio') if data.get('anticipata_inizio') != "" else None
    anticipata_fine = data.get('anticipata_fine') if data.get('anticipata_fine') != "" else None
    estiva_inizio = data.get('estiva_inizio') if data.get('estiva_inizio') != "" else None
    estiva_fine = data.get('estiva_fine') if data.get('estiva_fine') != "" else None
    autunnale_inizio = data.get('autunnale_inizio') if data.get('autunnale_inizio') != "" else None
    autunnale_fine = data.get('autunnale_fine') if data.get('autunnale_fine') != "" else None
    invernale_inizio = data.get('invernale_inizio') if data.get('invernale_inizio') != "" else None
    invernale_fine = data.get('invernale_fine') if data.get('invernale_fine') != "" else None
    
    # Verifica che tutti i campi obbligatori siano presenti per la tabella CDS
    if not codice_cds or not anno_accademico or not nome_corso or not inizio_primo or not fine_primo or not inizio_secondo or not fine_secondo:
      return jsonify({'status': 'error', 'message': 'Tutti i campi obbligatori per il CDS devono essere completati'}), 400
    
    # Verifica che i periodi d'esame abbiano date di inizio e fine
    period_pairs = [
      (anticipata_inizio, anticipata_fine, 'Sessione anticipata'),
      (estiva_inizio, estiva_fine, 'Sessione estiva'),
      (autunnale_inizio, autunnale_fine, 'Sessione autunnale'),
      (invernale_inizio, invernale_fine, 'Sessione invernale'),
      (pausa_primo_inizio, pausa_primo_fine, 'Pausa primo semestre'),
      (pausa_secondo_inizio, pausa_secondo_fine, 'Pausa secondo semestre')
    ]
    
    for start, end, name in period_pairs:
      if (start and not end) or (not start and end):
        return jsonify({'status': 'error', 'message': f'Date di inizio e fine per {name} devono essere entrambe specificate o entrambe omesse'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifica se esiste già un record per questo corso e anno accademico
    cursor.execute(
      "SELECT nome_corso FROM cds WHERE codice = %s AND anno_accademico = %s",
      (codice_cds, anno_accademico)
    )
    existing_record = cursor.fetchone()
    
    if existing_record:
      # In caso di record esistente, verifica che il nome del corso sia lo stesso
      # per impedire la modifica di dati che non siano le date
      if existing_record[0] != nome_corso:
        return jsonify({
          'status': 'error', 
          'message': 'Non è possibile modificare il nome del corso, solo le date sono modificabili'
        }), 400
      
      # Aggiorna il record esistente nella tabella cds con solo le date
      cursor.execute("""
        UPDATE cds SET 
        inizio_lezioni_primo_semestre = %s,
        fine_lezioni_primo_semestre = %s,
        inizio_lezioni_secondo_semestre = %s,
        fine_lezioni_secondo_semestre = %s
        WHERE codice = %s AND anno_accademico = %s
      """, (
        inizio_primo, fine_primo,
        inizio_secondo, fine_secondo,
        codice_cds, anno_accademico
      ))
      message = f"Date del corso {codice_cds} per l'anno accademico {anno_accademico} aggiornate con successo"
    else:
      # Inserisci un nuovo record nella tabella cds
      cursor.execute("""
        INSERT INTO cds (
          codice, anno_accademico, nome_corso,
          inizio_lezioni_primo_semestre, fine_lezioni_primo_semestre,
          inizio_lezioni_secondo_semestre, fine_lezioni_secondo_semestre
        ) VALUES (
          %s, %s, %s, 
          %s, %s, %s, %s
        )
      """, (
        codice_cds, anno_accademico, nome_corso,
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
    
    # Aggiungi la sessione anticipata se presente
    if anticipata_inizio and anticipata_fine:
      periodi.append(('ANTICIPATA', anticipata_inizio, anticipata_fine, 3))
      
      # Se la sessione anticipata è fornita, copiala anche come sessione invernale dell'anno precedente
      try:
        # Controlla se esiste già il record per l'anno accademico precedente
        anno_precedente = anno_accademico - 1
        cursor.execute(
          "SELECT 1 FROM cds WHERE codice = %s AND anno_accademico = %s",
          (codice_cds, anno_precedente)
        )
        exists_previous_year = cursor.fetchone() is not None
        
        if not exists_previous_year:
          # Crea un record minimo per l'anno precedente se non esiste
          cursor.execute("""
            INSERT INTO cds (
              codice, anno_accademico, nome_corso
            ) VALUES (
              %s, %s, %s
            ) ON CONFLICT DO NOTHING
          """, (
            codice_cds, anno_precedente, nome_corso
          ))
        
        # Elimina eventuali periodi invernali esistenti per l'anno precedente
        cursor.execute("""
          DELETE FROM periodi_esame 
          WHERE cds = %s AND anno_accademico = %s AND tipo_periodo = 'INVERNALE'
        """, (codice_cds, anno_precedente))
        
        # Inserisci la sessione anticipata come invernale dell'anno precedente
        cursor.execute("""
          INSERT INTO periodi_esame (cds, anno_accademico, tipo_periodo, inizio, fine, max_esami)
          VALUES (%s, %s, 'INVERNALE', %s, %s, %s)
        """, (codice_cds, anno_precedente, anticipata_inizio, anticipata_fine, 3))
        
        print(f"Aggiunta sessione invernale per l'anno precedente {anno_precedente}")
      except Exception as e:
        print(f"Errore nell'aggiungere la sessione invernale per l'anno precedente: {str(e)}")
      
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

# API per ottenere i corsi di studio filtrati per un anno accademico specifico
@admin_bp.route('/getCdSByAnno')
def get_cds_by_anno():
  anno = request.args.get('anno')
  
  if not anno:
    return jsonify({"error": "Anno accademico non specificato"}), 400
    
  try:
    anno = int(anno)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
      SELECT codice, nome_corso, anno_accademico
      FROM cds
      WHERE anno_accademico = %s
      ORDER BY nome_corso
    """, (anno,))
    
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
  try:
    cds_code = request.args.get('cds')
    anno_accademico = request.args.get('anno')
    
    if not cds_code or not anno_accademico:
      return jsonify({'error': 'Parametri mancanti'})
    
    # Connessione al database
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    # Ottieni i dettagli del corso di studi
    cursor.execute("""
      SELECT nome_corso
      FROM cds
      WHERE codice = %s AND anno_accademico = %s
    """, (cds_code, anno_accademico))
    
    cds_info = cursor.fetchone()
    if not cds_info:
      return jsonify({'error': 'Corso di studi non trovato'})
    
    # Ottieni tutti gli insegnamenti per il CdS e anno accademico specificati
    cursor.execute("""
      SELECT i.codice, i.titolo, ic.anno_corso, ic.semestre,
           COALESCE(e.data_appello, NULL) as data_appello,
           EXTRACT(MONTH FROM e.data_appello) as mese,
           EXTRACT(YEAR FROM e.data_appello) as anno,
           EXTRACT(DAY FROM e.data_appello) as giorno
      FROM insegnamenti i
      JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento
      LEFT JOIN esami e ON i.codice = e.insegnamento AND e.data_appello >= %s
      WHERE ic.cds = %s AND ic.anno_accademico = %s
      ORDER BY ic.anno_corso, i.titolo
    """, (f"{anno_accademico}-01-01", cds_code, anno_accademico))
    
    insegnamenti_raw = cursor.fetchall()
    
    # Raggruppa gli insegnamenti per evitare duplicazioni
    insegnamenti = []
    esami_per_insegnamento = {}
    
    for row in insegnamenti_raw:
      codice = row['codice']
      if codice not in esami_per_insegnamento:
        insegnamenti.append({
          'codice': codice,
          'titolo': row['titolo'],
          'anno_corso': row['anno_corso'],
          'semestre': row['semestre'],
          'esami': []
        })
        esami_per_insegnamento[codice] = insegnamenti[-1]['esami']
      
      # Aggiungi l'esame se c'è una data
      if row['data_appello']:
        esami_per_insegnamento[codice].append({
          'data': row['data_appello'].strftime('%Y-%m-%d'),
          'mese': int(row['mese']),
          'anno': int(row['anno']),
          'giorno': int(row['giorno'])
        })
    
    # Ottieni i periodi di esame per questo CdS
    cursor.execute("""
      SELECT tipo_periodo, inizio, fine
      FROM periodi_esame
      WHERE cds = %s AND anno_accademico = %s
      ORDER BY inizio
    """, (cds_code, anno_accademico))
    
    periodi = cursor.fetchall()
    
    # Calcola i mesi con esami per il calendario
    mesi_periodi = {}
    nomi_mesi = {
      "01": "GEN", "02": "FEB", "03": "MAR", 
      "04": "APR", "05": "MAG", "06": "GIU",
      "07": "LUG", "08": "AGO", "09": "SETT",
      "10": "OTT", "11": "NOV", "12": "DIC"
    }
    
    # Processa ogni periodo per aggiungere i mesi
    for periodo in periodi:
      tipo_periodo, inizio, fine = periodo
      mesi_periodi = add_months_to_periods(mesi_periodi, inizio, fine, nomi_mesi)
    
    return jsonify({
      'nome_corso': cds_info['nome_corso'],
      'insegnamenti': insegnamenti,
      'periodi': list(mesi_periodi.values())
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
  
  return periodi_map

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
        codice, anno_accademico, nome_corso,
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
    
    # Query per ottenere i periodi d'esame dell'anno corrente
    cursor.execute("""
      SELECT tipo_periodo, inizio, fine, max_esami
      FROM periodi_esame
      WHERE cds = %s AND anno_accademico = %s
    """, (codice, anno_accademico))
    
    periodi_data = {}
    
    # Mappa per convertire i tipi di periodo dal database ai nomi dei campi nella risposta
    tipo_periodo_field_map = {
      'ANTICIPATA': ('anticipata_inizio', 'anticipata_fine'),
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
    
    # Se non c'è una sessione anticipata, cerca la sessione invernale dell'anno precedente
    if 'anticipata_inizio' not in periodi_data or not periodi_data['anticipata_inizio']:
      try:
        anno_precedente = anno_accademico - 1
        cursor.execute("""
          SELECT inizio, fine
          FROM periodi_esame
          WHERE cds = %s AND anno_accademico = %s AND tipo_periodo = 'INVERNALE'
        """, (codice, anno_precedente))
        
        prev_winter = cursor.fetchone()
        if prev_winter:
          inizio, fine = prev_winter
          periodi_data['anticipata_inizio'] = inizio.isoformat() if inizio else None
          periodi_data['anticipata_fine'] = fine.isoformat() if fine else None
          print(f"Recuperata sessione invernale dell'anno precedente {anno_precedente} come sessione anticipata")
      except Exception as e:
        print(f"Errore nel recupero della sessione invernale dell'anno precedente: {str(e)}")
    
    # Combina i dati del CdS con i periodi d'esame
    cds_data.update(periodi_data)
    
    # Converti le date in stringhe
    from datetime import date
    for key, value in cds_data.items():
      if isinstance(value, date):
        cds_data[key] = value.isoformat()
        
    return jsonify(cds_data)
    
  except Exception as e:
    import traceback
    print(traceback.format_exc())
    return jsonify({'error': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per ottenere gli anni accademici disponibili
@admin_bp.route('/getAnniAccademici')
def get_anni_accademici():
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Recupera tutti gli anni accademici unici dal database
    cursor.execute("""
      SELECT DISTINCT anno_accademico 
      FROM cds 
      ORDER BY anno_accademico DESC
    """)
    
    # Estrae gli anni dalla query e li converte in una lista
    anni = [row[0] for row in cursor.fetchall()]
    
    # Se non ci sono anni nel database, restituisci l'anno corrente
    if not anni:
      current_year = datetime.now().year
      # Se siamo nel secondo semestre, mostro anche l'anno prossimo
      if datetime.now().month > 9:
        anni = [current_year, current_year + 1]
      else:
        anni = [current_year]
    
    return jsonify(anni)
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

@admin_bp.route('/uploadAule', methods=['POST'])
def upload_aule():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
  
  try:
    data = request.get_json()
    
    if not data or 'aule' not in data or not isinstance(data['aule'], list):
      return jsonify({'status': 'error', 'message': 'Formato dati non valido'}), 400
    
    aule = data['aule']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    inserted_count = 0
    updated_count = 0
    
    for aula in aule:
      # Verifica che tutti i campi richiesti siano presenti
      if not all(key in aula for key in ['codice', 'nome', 'sede', 'edificio', 'posti']):
        continue
        
      try:
        # Converte il numero di posti in intero
        posti = int(aula['posti']) if aula['posti'] else 0
        
        # Verifica se l'aula esiste già
        cursor.execute("SELECT nome FROM aule WHERE nome = %s", (aula['nome'],))
        exists = cursor.fetchone()
        
        if exists:
          # Aggiorna l'aula esistente
          cursor.execute("""
            UPDATE aule 
            SET nome = %s, sede = %s, edificio = %s, posti = %s s 
            WHERE nome = %s
          """, (aula['codice'], aula['sede'], aula['edificio'], posti, aula['nome']))
          updated_count += 1
        else:
          # Inserisci nuova aula
          cursor.execute("""
            INSERT INTO aule (nome, codice, sede, edificio, posti)
            VALUES (%s, %s, %s, %s, %s)
          """, (aula['nome'], aula['codice'], aula['sede'], aula['edificio'], posti))
          inserted_count += 1
      except Exception as e:
        print(f"Errore durante l'inserimento dell'aula {aula['nome']}: {str(e)}")
    
    conn.commit()
    
    return jsonify({
      'status': 'success',
      'message': f'Caricamento aule completato con successo.',
      'details': f"""
        Aule elaborate:
        - {inserted_count} nuove aule inserite
        - {updated_count} aule aggiornate
        - {len(aule)} totali
      """
    })
    
  except Exception as e:
    if 'conn' in locals() and conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': f"Errore durante l'importazione delle aule: {str(e)}"}), 500
  
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

@admin_bp.route('/loadAuleEasyAcademy', methods=['POST'])
def load_aule_easy_academy():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
  
  try:
    # Chiamata all'API di EasyAcademy
    response = requests.get('https://easyacademy.unipg.it/agendaweb/combo.php?sw=rooms_&only_json=1')
    
    if not response.ok:
      return jsonify({
        'status': 'error', 
        'message': f'Errore nella risposta dal server EasyAcademy: {response.status_code}'
      }), 500
      
    data = response.json()
    
    # Verifica che i dati abbiano la struttura attesa
    if not data or 'elenco_aule' not in data or 'P02E04' not in data['elenco_aule']:
      return jsonify({
        'status': 'error',
        'message': 'Formato dati non valido o aule DMI non trovate nella risposta'
      }), 500
    
    # Estrai le aule del DMI
    aule_dmi = data['elenco_aule']['P02E04']
    aule_data = []
    
    # Prepara i dati delle aule
    for aula in aule_dmi:
      aule_data.append({
        'codice': aula['valore'],
        'nome': aula['label'],
        'sede': 'Perugia',
        'edificio': 'DIPARTIMENTO DI MATEMATICA E INFORMATICA',
        'posti': aula['capacity'] if 'capacity' in aula else 0
      })
      
    # Aggiungi lo studio docente
    aule_data.append({
      'codice': 'STDOCENTE', # Codice studio docente
      'nome': 'Studio docente DMI',
      'sede': 'Perugia',
      'edificio': 'DIPARTIMENTO DI MATEMATICA E INFORMATICA',
      'posti': 9999
    })
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    inserted_count = 0
    updated_count = 0
    
    # Elaborazione delle aule
    for aula in aule_data:
      try:
        # Converte il numero di posti in intero
        posti = int(aula['posti']) if aula['posti'] else 0
        
        # Verifica se l'aula esiste già
        cursor.execute("SELECT nome FROM aule WHERE nome = %s", (aula['nome'],))
        exists = cursor.fetchone()
        
        if exists:
          # Aggiorna l'aula esistente
          cursor.execute("""
            UPDATE aule 
            SET codice = %s, sede = %s, edificio = %s, posti = %s 
            WHERE nome = %s
          """, (aula['codice'], aula['sede'], aula['edificio'], posti, aula['nome']))
          updated_count += 1
        else:
          # Inserisci nuova aula
          cursor.execute("""
            INSERT INTO aule (nome, codice, sede, edificio, posti)
            VALUES (%s, %s, %s, %s, %s)
          """, (aula['nome'], aula['codice'], aula['sede'], aula['edificio'], posti))
          inserted_count += 1
      except Exception as e:
        print(f"Errore durante l'inserimento dell'aula {aula['nome']}: {str(e)}")
    
    conn.commit()
    
    return jsonify({
      'status': 'success',
      'message': f'Caricamento aule completato con successo.',
      'details': f"""
        Aule elaborate:
        - {inserted_count} nuove aule inserite
        - {updated_count} aule aggiornate
        - {len(aule_data)} totali (incluso Studio docente DMI)
      """
    })
    
  except requests.RequestException as e:
    return jsonify({
      'status': 'error',
      'message': f'Errore nella comunicazione con EasyAcademy: {str(e)}'
    }), 500
  except Exception as e:
    if 'conn' in locals() and conn:
      conn.rollback()
    return jsonify({
      'status': 'error',
      'message': f"Errore durante l'importazione delle aule: {str(e)}"
    }), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per ottenere la lista degli utenti
@admin_bp.route('/getUsers')
def get_users():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    # Recupera tutti gli utenti
    cursor.execute("""
      SELECT username, matricola, nome, cognome, permessi_docente, permessi_admin
      FROM utenti
      ORDER BY username
    """)
    
    users = []
    for row in cursor.fetchall():
      users.append({
        'username': row['username'],
        'matricola': row['matricola'],
        'nome': row['nome'],
        'cognome': row['cognome'],
        'permessi_docente': row['permessi_docente'],
        'permessi_admin': row['permessi_admin']
      })
      
    return jsonify(users)
    
  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per aggiornare i permessi di amministratore di un utente
@admin_bp.route('/updateUserAdmin', methods=['POST'])
def update_user_admin():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    data = request.get_json()
    username = data.get('username')
    permessi_admin = data.get('permessi_admin')
    
    if username is None or permessi_admin is None:
      return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
      
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifica se l'utente esiste
    cursor.execute("SELECT 1 FROM utenti WHERE username = %s", (username,))
    if not cursor.fetchone():
      return jsonify({'status': 'error', 'message': f'Utente {username} non trovato'}), 404
      
    # Aggiorna i permessi admin dell'utente
    cursor.execute("""
      UPDATE utenti 
      SET permessi_admin = %s
      WHERE username = %s
    """, (permessi_admin, username))
    
    conn.commit()
    
    return jsonify({
      'status': 'success',
      'message': f'Permessi amministratore aggiornati per {username}'
    })
    
  except Exception as e:
    if 'conn' in locals() and conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per eliminare un utente
@admin_bp.route('/deleteUser', methods=['POST'])
def delete_user():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    data = request.get_json()
    username = data.get('username')
    
    if not username:
      return jsonify({'status': 'error', 'message': 'Username mancante'}), 400
      
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifica se l'utente esiste
    cursor.execute("SELECT 1 FROM utenti WHERE username = %s", (username,))
    if not cursor.fetchone():
      return jsonify({'status': 'error', 'message': f'Utente {username} non trovato'}), 404
      
    # Elimina l'utente
    cursor.execute("DELETE FROM utenti WHERE username = %s", (username,))
    conn.commit()
    
    return jsonify({
      'status': 'success',
      'message': f'Utente {username} eliminato con successo'
    })
    
  except Exception as e:
    if 'conn' in locals() and conn:
      conn.rollback()
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

@admin_bp.route('/downloadFileEA')
def download_ea():
  if 'admin' not in request.cookies:
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    conn = get_db_connection()
    cursor = conn.cursor()

    # Recupera dati degli esami con informazioni correlate sulle aule, insegnamenti e docenti
    cursor.execute("""
      SELECT 
        e.id,
        e.descrizione,
        e.data_appello,
        e.ora_appello,
        e.durata_appello,
        a.codice AS aula_codice,
        a.nome AS aula_nome,
        e.insegnamento,
        ic.anno_accademico,
        e.docente,
        u.nome AS docente_nome,
        u.cognome AS docente_cognome,
        e.note_appello
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.codice
      LEFT JOIN aule a ON e.aula = a.nome
      LEFT JOIN utenti u ON e.docente = u.username
      LEFT JOIN insegnamenti_cds ic ON i.codice = ic.insegnamento 
        AND EXTRACT(YEAR FROM e.data_appello) - 1 = ic.anno_accademico
      ORDER BY e.data_appello, e.insegnamento
    """)
    
    esami = cursor.fetchall()

    # Crea il file Excel in memoria
    workbook = xlwt.Workbook()
    worksheet = workbook.add_sheet('Prenotazioni')

    # Formattazione per le date
    date_format = xlwt.XFStyle()
    date_format.num_format_str = 'DD-MM-YYYY, HH:MM'
    
    # Data attuale per il suffisso del codice prenotazione
    data_attuale = datetime.now().strftime('%Y%m%d')

    # Intestazioni
    headers = [
      'Codice prenotazione', 'Breve descrizione', 'Descrizione completa', 'Tipo prenotazione',
      'Status', 'Prenotazione da', 'Prenotazione a', 'Durata totale da', 'Durata totale a',
      'Tipo ripetizione', 'Codice aula', 'Nome aula', 'Codice sede', 'Sede',
      'Aula virtuale', 'Etichetta aula virtuale', 'Codice insegnamento', 'Anno accademico',
      'Codice raggruppamento', 'Nome raggruppamento', 'Codice utente utilizzatore',
      'Nome utente utilizzatore', 'Cognome utente utilizzatore', 'Note', 'Note interne'
    ]

    # Scrivi le intestazioni
    for col, header in enumerate(headers):
      worksheet.write(0, col, header)

    # Scrivi i dati
    for row_idx, esame in enumerate(esami, start=1):
      (id_esame, descrizione, data_appello, ora_appello, durata_appello, 
       aula_codice, aula_nome, insegnamento, anno_accademico,
       docente, docente_nome, docente_cognome, note_appello) = esame

      # Calcola l'orario di fine esame
      if ora_appello and durata_appello:
        # Converti ora_appello da time a datetime
        inizio_datetime = datetime.combine(data_appello, ora_appello)
        # Aggiungi la durata (in minuti)
        fine_datetime = inizio_datetime + timedelta(minutes=durata_appello)
      else:
        inizio_datetime = None
        fine_datetime = None

      col = 0
      # Colonna A: Codice prenotazione
      worksheet.write(row_idx, col, f"opla_{data_attuale}_{id_esame}"); col += 1
      # Colonna B: Breve descrizione
      worksheet.write(row_idx, col, descrizione or ""); col += 1
      # Colonna C: Descrizione completa
      worksheet.write(row_idx, col, ""); col += 1
      # Colonna D: Tipo prenotazione
      worksheet.write(row_idx, col, "Esame"); col += 1
      # Colonna E: Status
      worksheet.write(row_idx, col, "Confermata"); col += 1
      
      # Colonna F: Prenotazione da
      if inizio_datetime:
        worksheet.write(row_idx, col, inizio_datetime, date_format)
      else:
        worksheet.write(row_idx, col, "")
      col += 1
      
      # Colonna G: Prenotazione a
      if fine_datetime:
        worksheet.write(row_idx, col, fine_datetime, date_format)
      else:
        worksheet.write(row_idx, col, "")
      col += 1
      
      # Colonna H: Durata totale da (stesso valore di Prenotazione da)
      if inizio_datetime:
        worksheet.write(row_idx, col, inizio_datetime, date_format)
      else:
        worksheet.write(row_idx, col, "")
      col += 1
      
      # Colonna I: Durata totale a (stesso valore di Prenotazione a)
      if fine_datetime:
        worksheet.write(row_idx, col, fine_datetime, date_format)
      else:
        worksheet.write(row_idx, col, "")
      col += 1
      
      # Colonna J: Tipo ripetizione
      worksheet.write(row_idx, col, "una volta"); col += 1

      if aula_codice == 'STDOCENTE':
        worksheet.write(row_idx, col, ""); col += 1
        worksheet.write(row_idx, col, ""); col += 1
        worksheet.write(row_idx, col, ""); col += 1
        worksheet.write(row_idx, col, ""); col += 1
      else:
        worksheet.write(row_idx, col, aula_codice); col += 1                # Colonna K: Codice aula
        worksheet.write(row_idx, col, aula_nome); col += 1                  # Colonna L: Nome aula
        worksheet.write(row_idx, col, "P02E04"); col += 1                   # Colonna M: Codice sede
        worksheet.write(row_idx, col, "Matematica e Informatica"); col += 1 # Colonna N: Sede

      # Colonna O: Aula virtuale
      if aula_codice == 'STDOCENTE':
        worksheet.write(row_idx, col, "1"); col += 1
      else:
        worksheet.write(row_idx, col, ""); col += 1

      # Colonna P: Etichetta aula virtuale
      if aula_codice == 'STDOCENTE':
        worksheet.write(row_idx, col, "Studio docente DMI"); col += 1
      else:
        worksheet.write(row_idx, col, ""); col += 1

      # Colonna Q: Codice insegnamento
      worksheet.write(row_idx, col, insegnamento or ""); col += 1
      # Colonna R: Anno accademico
      worksheet.write(row_idx, col, anno_accademico or ""); col += 1
      # Colonna S: Codice raggruppamento
      worksheet.write(row_idx, col, ""); col += 1 # Chiedere a Bistarelli
      # Colonna T: Nome raggruppamento
      worksheet.write(row_idx, col, ""); col += 1 # Chiedere a Bistarelli
      # Colonna U: Codice utente utilizzatore
      worksheet.write(row_idx, col, docente or ""); col += 1
      # Colonna V: Nome utente utilizzatore
      worksheet.write(row_idx, col, docente_nome or ""); col += 1
      # Colonna W: Cognome utente utilizzatore
      worksheet.write(row_idx, col, docente_cognome or ""); col += 1
      # Colonna X: Note
      worksheet.write(row_idx, col, note_appello or ""); col += 1
      # Colonna Y: Note interne
      worksheet.write(row_idx, col, ""); col += 1

    # Salva il workbook in memoria
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)

    # Prepara la risposta
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = 'attachment; filename=Prenotazioni.xls'
    response.headers['Content-type'] = 'application/vnd.ms-excel'
    
    return response

  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)