from flask import Blueprint, request, make_response, jsonify, session
from db import get_db_connection, release_connection
import io
import csv
from datetime import datetime, timedelta
import xlwt
import xlrd
from psycopg2.extras import DictCursor
import re
import requests
from auth import require_auth

admin_bp = Blueprint('admin', __name__, url_prefix='/api/oh-issa')

@admin_bp.route('/uploadFileUGOV', methods=['POST'])
def upload_ugov():
    if not session.get('permessi_admin'):
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()

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
      'anno_accademico': 0,                      # A - Anno Offerta
      'cod_cds': 6,                              # G - Cod. Corso di Studio
      'des_cds': 8,                              # I - Des. Corso di Studio
      'des_curriculum': 13,                      # N - Des. Curriculum
      'id_insegnamento': 14,                     # O - Id. Insegnamento
      'cod_insegnamento': 16,                    # P - Cod. Insegnamento
      'des_insegnamento': 17,                    # Q - Des. Insegnamento
      'anno_corso': 28,                          # AC - Anno Corso Insegnamento
      'des_periodo_insegnamento': 39,            # AN - Des. Periodo Insegnamento
      'des_raggruppamento_insegnamento': 63,     # BL - Des. Raggruppamento Insegnamento
      'id_unita_didattica': 65,                  # BN - Id. Unità Didattica
      'cod_unita_didattica': 66,                 # BO - Cod. Unità Didattica
      'des_unita_didattica': 67,                 # BP - Des. Unità Didattica
      'des_periodo_unita_didattica': 80,         # CC - Des. Periodo Unità Didattica
      'des_raggruppamento_unita_didattica': 100, # CW - Des. Raggruppamento Unità Didattica
      'matricola_docente': 105,                  # DB - Matricola Docente
      'cognome_docente': 106,                    # DC - Cognome Docente
      'nome_docente': 107,                       # DD - Nome Docente
      'username_docente': 108                    # DE - Username
    }
    
    # Verifica header per determinare gli indici corretti
    if sheet.nrows > 0:
      header = [str(sheet.cell_value(0, i)).strip().upper() for i in range(sheet.ncols)]
      
      # Mappa nomi colonne a indici
      header_map = {
        'ANNO OFFERTA': 'anno_accademico',
        'COD. CORSO DI STUDIO': 'cod_cds',
        'DES. CORSO DI STUDIO': 'des_cds',
        'DES. CURRICULUM': 'des_curriculum',
        'ID INSEGNAMENTO': 'id_insegnamento',
        'COD. INSEGNAMENTO': 'cod_insegnamento',
        'DES. INSEGNAMENTO': 'des_insegnamento',
        'ANNO CORSO': 'anno_corso',
        'DES. PERIODO INSEGNAMENTO': 'des_periodo_insegnamento',
        'DES. RAGGRUPPAMENTO INSEGNAMENTO': 'des_raggruppamento_insegnamento',
        'ID UNITÀ DIDATTICA': 'id_unita_didattica',
        'COD. UNITÀ DIDATTICA': 'cod_unita_didattica',
        'DES. UNITÀ DIDATTICA': 'des_unita_didattica',
        'DES. PERIODO UNITÀ DIDATTICA': 'des_periodo_unita_didattica',
        'DES. RAGGRUPPAMENTO UNITÀ DIDATTICA': 'des_raggruppamento_unita_didattica',
        'MATRICOLA DOCENTE': 'matricola_docente',
        'COGNOME DOCENTE': 'cognome_docente',
        'NOME DOCENTE': 'nome_docente',
        'USERNAME': 'username_docente'
      }
      
      # Aggiorna gli indici in base all'header reale
      for i, col_name in enumerate(header):
        for key, value in header_map.items():
          if key in col_name:
            colonna_indices[value] = i
            break
    
    # Dati per l'inserimento
    insegnamenti_data = []
    insegnamenti_cds_data = []
    cds_data = []
    utenti_data = []
    insegnamento_docente_data = []
    
    # Mappatura periodi a semestri
    periodo_to_semestre = {
      'Primo Semestre': 1,
      'Secondo Semestre': 2,
      'Annuale': 3
    }
    # Valore predefinito per annuale 
    default_semestre = 3  # 3 = annuale
    
    # Dizionario per mappare codici insegnamento ai loro ID
    codice_to_id = {}
    
    # Prima fase: raccogliamo la mappatura codice -> id
    for row_idx in range(1, sheet.nrows):
      try:
        cod_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['cod_insegnamento'])).strip()
        id_insegnamento_raw = sheet.cell_value(row_idx, colonna_indices['id_insegnamento'])
        id_insegnamento = str(id_insegnamento_raw).replace('.0', '') if id_insegnamento_raw else ""
        
        # Mappatura codice -> id solo per gli insegnamenti principali
        if cod_insegnamento and id_insegnamento:
            codice_to_id[cod_insegnamento] = id_insegnamento
            
      except Exception as e:
        continue
    
    # Fase finale: elaborazione delle righe e inserimento dei dati
    for row_idx in range(1, sheet.nrows):
      try:
        # Estrai il docente prima di tutto
        username_docente = str(sheet.cell_value(row_idx, colonna_indices['username_docente'])).strip()
        
        # Ignoriamo le righe senza docente
        if not username_docente:
          continue
        
        # Estrai i valori dalle colonne
        anno_accademico = int(float(sheet.cell_value(row_idx, colonna_indices['anno_accademico'])))
        
        # Estrai l'anno del corso
        try:
          anno_corso_raw = sheet.cell_value(row_idx, colonna_indices['anno_corso'])
          anno_corso = int(float(anno_corso_raw)) if anno_corso_raw else 1
        except:
          anno_corso = 1  # Valore predefinito se c'è un errore
        
        cod_cds = str(sheet.cell_value(row_idx, colonna_indices['cod_cds'])).strip()
        des_cds = str(sheet.cell_value(row_idx, colonna_indices['des_cds'])).strip()
        des_curriculum = str(sheet.cell_value(row_idx, colonna_indices['des_curriculum'])).strip()
        
        # Se il curriculum è vuoto, usiamo "CORSO GENERICO"
        if not des_curriculum:
          des_curriculum = "CORSO GENERICO"
        
        # Gestione degli ID e codici insegnamento
        cod_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['cod_insegnamento'])).strip()
        id_insegnamento_raw = sheet.cell_value(row_idx, colonna_indices['id_insegnamento'])
        id_insegnamento = str(id_insegnamento_raw).replace('.0', '') if id_insegnamento_raw else ""
        
        # Verifica se esiste un'unità didattica (modulo)
        id_unita_didattica_raw = sheet.cell_value(row_idx, colonna_indices['id_unita_didattica'])
        id_unita_didattica = str(id_unita_didattica_raw).replace('.0', '') if id_unita_didattica_raw else ""
        
        # Verifica se è mutuato (presenza di "MUTUAT" nelle colonne BL o CW)
        des_raggruppamento_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['des_raggruppamento_insegnamento'])).strip()
        des_raggruppamento_unita_didattica = str(sheet.cell_value(row_idx, colonna_indices['des_raggruppamento_unita_didattica'])).strip()
        
        is_mutuato = ("MUTUAT" in des_raggruppamento_insegnamento.upper() or 
                      "MUTUAT" in des_raggruppamento_unita_didattica.upper())
        
        # LOGICA SEMPLIFICATA:
        # 1. Se ha id_unita_didattica (colonna BN), è un modulo -> usa sempre l'insegnamento padre
        # 2. Se è mutuato -> ignora completamente questa riga
        # 3. Altrimenti usa l'insegnamento normale
        
        if is_mutuato:
          # Ignora completamente gli insegnamenti mutuati
          continue
        
        if id_unita_didattica:
          # È un modulo -> usa sempre l'insegnamento padre
          if not cod_insegnamento or not id_insegnamento:
            continue  # Non possiamo procedere senza l'insegnamento padre
          
          id_effettivo = id_insegnamento
          codice_effettivo = cod_insegnamento
        else:
          # È un insegnamento normale
          if not cod_insegnamento or not id_insegnamento:
            continue  # Non possiamo procedere senza l'insegnamento
            
          id_effettivo = id_insegnamento
          codice_effettivo = cod_insegnamento
        
        des_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['des_insegnamento'])).strip()
        descrizione_effettiva = des_insegnamento
        
        # Estrai periodo/semestre
        des_periodo = ""
        if id_unita_didattica:
            # Per i moduli, usa il periodo dell'unità didattica
            des_periodo_raw = sheet.cell_value(row_idx, colonna_indices['des_periodo_unita_didattica'])
        else:
            # Per gli insegnamenti normali, usa il periodo dell'insegnamento
            des_periodo_raw = sheet.cell_value(row_idx, colonna_indices['des_periodo_insegnamento'])
        des_periodo = str(des_periodo_raw).strip() if des_periodo_raw else ""
        semestre = periodo_to_semestre.get(des_periodo, default_semestre)
        
        # Estrai dati docente
        matricola_docente = str(sheet.cell_value(row_idx, colonna_indices['matricola_docente'])).strip()
        cognome_docente = str(sheet.cell_value(row_idx, colonna_indices['cognome_docente'])).strip()
        nome_docente = str(sheet.cell_value(row_idx, colonna_indices['nome_docente'])).strip()
        
        # Aggiungi CdS se non già presente
        cds_key = (cod_cds, anno_accademico, des_curriculum)
        if cds_key not in cds_set:
          cds_data.append((cod_cds, anno_accademico, des_cds, des_curriculum))
          cds_set.add(cds_key)
        
        # Aggiungi insegnamento se non già presente
        if id_effettivo not in insegnamenti_set:
          insegnamenti_data.append((id_effettivo, codice_effettivo, descrizione_effettiva))
          insegnamenti_set.add(id_effettivo)
        
        # Aggiungi insegnamento_cds se non già presente
        insegnamenti_cds_key = (id_effettivo, anno_accademico, cod_cds, des_curriculum)
        if insegnamenti_cds_key not in cds_set:
          insegnamenti_cds_data.append((
            id_effettivo, 
            anno_accademico, 
            cod_cds, 
            des_curriculum,
            anno_corso, 
            semestre
          ))
        
        # Aggiungi utente se non già presente
        if username_docente not in utenti_set:
          utenti_data.append((username_docente, matricola_docente, nome_docente, cognome_docente, False))
          utenti_set.add(username_docente)
        
        # Aggiungi insegnamento_docente
        insegnamento_docente_key = (id_effettivo, username_docente, anno_accademico)
        if insegnamento_docente_key not in insegnamento_docente_set:
          insegnamento_docente_data.append((id_effettivo, username_docente, anno_accademico))
          insegnamento_docente_set.add(insegnamento_docente_key)
          
      except Exception as e:
        continue
    
    # Inserisci dati nel database
    # 1. Cds
    for item in cds_data:
      try:
        cursor.execute("""
          INSERT INTO cds (codice, anno_accademico, nome_corso, curriculum)
          VALUES (%s, %s, %s, %s)
          ON CONFLICT (codice, anno_accademico, curriculum) DO UPDATE 
          SET nome_corso = EXCLUDED.nome_corso
        """, item)
      except Exception as e:
        continue
    
    # 2. Insegnamenti
    for item in insegnamenti_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamenti (id, codice, titolo)
          VALUES (%s, %s, %s)
          ON CONFLICT (id) DO UPDATE 
          SET codice = EXCLUDED.codice,
              titolo = EXCLUDED.titolo
        """, item)
      except Exception as e:
        continue
    
    # 3. Insegnamenti_cds
    for item in insegnamenti_cds_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamenti_cds 
          (insegnamento, anno_accademico, cds, curriculum, anno_corso, semestre)
          VALUES (%s, %s, %s, %s, %s, %s)
          ON CONFLICT (insegnamento, anno_accademico, cds, curriculum) DO UPDATE 
          SET anno_corso = EXCLUDED.anno_corso,
              semestre = EXCLUDED.semestre
        """, item)
      except Exception as e:
        continue
    
    # 4. Utenti
    for item in utenti_data:
      try:
        cursor.execute("""
          INSERT INTO utenti (username, matricola, nome, cognome, permessi_admin)
          VALUES (%s, %s, %s, %s, %s)
          ON CONFLICT (username) DO UPDATE 
          SET matricola = EXCLUDED.matricola,
              nome = EXCLUDED.nome,
              cognome = EXCLUDED.cognome
        """, item)
      except Exception as e:
        continue
    
    # 5. Insegnamento_docente
    for item in insegnamento_docente_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamento_docente (insegnamento, docente, annoaccademico)
          VALUES (%s, %s, %s)
          ON CONFLICT (insegnamento, docente, annoaccademico) DO NOTHING
        """, item)
      except Exception as e:
        continue
    
    # Commit delle modifiche
    conn.commit()
    cursor.close()
    release_connection(conn)

    return jsonify({
        'status': 'success',
        'message': 'Importazione completata con successo.',
        'details': f"""
        Importati:
        - {len(cds_data)} corsi di studio
        - {len(insegnamenti_data)} insegnamenti
        - {len(insegnamenti_cds_data)} assegnazioni insegnamento-CDS
        - {len(utenti_data)} docenti
        - {len(insegnamento_docente_data)} assegnazioni docente-insegnamento
        """
    })

@admin_bp.route('/downloadFileESSE3')
def download_esse3():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  anno = request.args.get('anno')
  if not anno:
    return jsonify({'error': 'Anno accademico non specificato'}), 400
    
  try:
    anno = int(anno)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
      SELECT 
        e.tipo_appello,           -- Tipo appello
        e.anno_accademico,        -- Anno
        e.cds,                    -- CDS
        i.codice,                 -- AD (codice insegnamento, non ID)
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
        a.nome,                   -- Nome Aula
        u.matricola,              -- Matricola Docente
        a.sede,                   -- Sede
        e.condizione_sql,         -- Condizione SQL
        e.partizionamento,        -- Partizionamento
        e.partizione,             -- Partizione
        e.note_appello,           -- Note Appello
        e.posti,                  -- Posti
        e.codice_turno            -- Codice Turno
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.id
      LEFT JOIN aule a ON e.aula = a.nome
      LEFT JOIN utenti u ON e.docente = u.username
      WHERE e.anno_accademico = %s
      ORDER BY e.data_appello, e.insegnamento
    """, (anno,))
    esami = cursor.fetchall()

    # Crea il file Excel in memoria
    workbook = xlwt.Workbook()
    worksheet = workbook.add_sheet('Esami')

    # Formattazione per le date
    date_format = xlwt.XFStyle()
    date_format.num_format_str = 'DD/MM/YYYY'
    
    time_format = xlwt.XFStyle()
    time_format.num_format_str = 'HH:MM'

    # Formattazione per il grassetto
    bold_format = xlwt.XFStyle()
    bold_font = xlwt.Font()
    bold_font.bold = True
    bold_format.font = bold_font

    # Riga 1: HEADER nella cella A1
    worksheet.write(0, 0, 'HEADER')

    # Riga 2: Valori Header
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

    # Scrivi le intestazioni nella riga 2
    for col, header in enumerate(headers):
      worksheet.write(1, col, header, bold_format)

    # Riga 3: DETAIL nella cella A3
    worksheet.write(2, 0, 'DETAIL')

    # Riga 4: Codici template ESSE3
    template_codes = [
      '!tipo_app_cod!',
      '!aa_cal_id!',
      '!cds_cod!',
      '!ad_cod!',
      '!des_app!',
      '!data_app!',
      '!data_inizio_iscr!',
      '!data_fine_iscr!',
      '!ora_app!',
      '!tipo_iscr!',
      '!tgest_app!',
      '!tdef_app!',
      '!tgest_pren!',
      '!riservato_flg!',
      '!tipo_iscr_cod_prev!',
      '!tipo_esa_prev!',
      '!edificio_cod!',
      '!aula_cod!',
      '!matricola_doc!',
      '!sede_id!',
      '!cond_cod!',
      '!fat_part_cod!',
      '!dom_part_cod!',
      '!errore_imp!',
      '!note!',
      '!numero_max!',
      '!templ_turno_cod!',
      '!note_sist_log!'
    ]

    # Scrivi i codici template nella riga 4
    for col, code in enumerate(template_codes):
      worksheet.write(3, col, code)

    # Righe (1, 3 e 4) e colonne (J, X e AB) nascoste per conformità con file export ESSE3
    worksheet.row(0).hidden = True
    worksheet.row(2).hidden = True
    worksheet.row(3).hidden = True
    worksheet.col(9).hidden = True
    worksheet.col(23).hidden = True
    worksheet.col(27).hidden = True

    # Scrivi i dati (inizia dalla riga 5, indice 4)
    for row_idx, esame in enumerate(esami, start=4):
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

    # Genera il nome del file con la data odierna
    data_oggi = datetime.now().strftime('%Y%m%d')
    filename = f'opla_esse3_{data_oggi}.xls'

    # Prepara la risposta
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = f'attachment; filename={filename}'
    response.headers['Content-type'] = 'application/vnd.ms-excel'
    
    return response

  except Exception as e:
    return jsonify({'status': 'error', 'message': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

@admin_bp.route('/downloadFileEA')
def download_ea():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  anno = request.args.get('anno')
  if not anno:
    return jsonify({'error': 'Anno accademico non specificato'}), 400
    
  try:
    anno = int(anno)
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
        i.codice AS insegnamento_codice,
        e.anno_accademico,
        e.docente,
        u.nome AS docente_nome,
        u.cognome AS docente_cognome,
        e.note_appello
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.id
      LEFT JOIN aule a ON e.aula = a.nome
      LEFT JOIN utenti u ON e.docente = u.username
      WHERE e.anno_accademico = %s
      ORDER BY e.data_appello, e.insegnamento
    """, (anno,))
    
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
       aula_codice, aula_nome, insegnamento_codice, anno_accademico,
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
      worksheet.write(row_idx, col, insegnamento_codice or ""); col += 1
      # Colonna R: Anno accademico
      worksheet.write(row_idx, col, anno_accademico or ""); col += 1
      # Colonna S: Codice raggruppamento
      worksheet.write(row_idx, col, "P02E04"); col += 1
      # Colonna T: Nome raggruppamento
      worksheet.write(row_idx, col, "Matematica e Informatica"); col += 1
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

    # Genera il nome del file con la data odierna
    data_oggi = datetime.now().strftime('%Y%m%d')
    filename = f'opla_easyacademy_{data_oggi}.xls'

    # Prepara la risposta
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = f'attachment; filename={filename}'
    response.headers['Content-type'] = 'application/vnd.ms-excel'
    
    return response

  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

@admin_bp.route('/save-cds-dates', methods=['POST'])
def save_cds_dates():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
  
  conn = None
  cursor = None
  
  try:
    data = request.get_json()
    
    # Estrai i parametri dal JSON ricevuto
    codice_cds = data.get('codice_cds')
    
    if not codice_cds:
      return jsonify({'status': 'error', 'message': 'Codice CdS mancante'}), 400
    
    # Gestisci la conversione dell'anno accademico
    try:
      anno_accademico = int(data.get('anno_accademico'))
    except (ValueError, TypeError) as e:
      return jsonify({'status': 'error', 'message': f'Anno accademico non valido: {data.get("anno_accademico")}. Errore: {str(e)}'}), 400
      
    nome_corso = data.get('nome_corso')
    if not nome_corso:
      return jsonify({'status': 'error', 'message': 'Nome corso mancante'}), 400
    
    # Target esami per il CdS
    target_esami = data.get('target_esami') or None
    
    # Date di sessioni d'esame
    anticipata_inizio = data.get('anticipata_inizio') or None
    anticipata_fine = data.get('anticipata_fine') or None
    estiva_inizio = data.get('estiva_inizio') or None
    estiva_fine = data.get('estiva_fine') or None
    autunnale_inizio = data.get('autunnale_inizio') or None
    autunnale_fine = data.get('autunnale_fine') or None
    invernale_inizio = data.get('invernale_inizio') or None
    invernale_fine = data.get('invernale_fine') or None
    
    # Limiti esami per ogni sessione
    anticipata_esami_primo = data.get('anticipata_esami_primo') or None
    estiva_esami_primo = data.get('estiva_esami_primo') or None
    estiva_esami_secondo = data.get('estiva_esami_secondo') or None
    autunnale_esami_primo = data.get('autunnale_esami_primo') or None
    autunnale_esami_secondo = data.get('autunnale_esami_secondo') or None
    invernale_esami_primo = data.get('invernale_esami_primo') or None
    invernale_esami_secondo = data.get('invernale_esami_secondo') or None
    
    # Verifica che i periodi d'esame abbiano date di inizio e fine
    period_pairs = [
      (anticipata_inizio, anticipata_fine, 'Sessione anticipata'),
      (estiva_inizio, estiva_fine, 'Sessione estiva'),
      (autunnale_inizio, autunnale_fine, 'Sessione autunnale'),
      (invernale_inizio, invernale_fine, 'Sessione invernale')
    ]
    
    for start, end, name in period_pairs:
      if (start and not end) or (not start and end):
        return jsonify({'status': 'error', 'message': f'Date di inizio e fine per {name} devono essere entrambe specificate o entrambe omesse'}), 400
    
    # Connessione al database
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Semplifichiamo usando sempre "CORSO GENERICO" come curriculum
    curriculum = "CORSO GENERICO"
    
    # Verifica se esistono record per questo corso e anno accademico
    cursor.execute(
      "SELECT COUNT(*) FROM cds WHERE codice = %s AND anno_accademico = %s AND curriculum = %s",
      (codice_cds, anno_accademico, curriculum)
    )
    count = cursor.fetchone()[0]
    exists = count > 0
    
    # Upsert per il record CDS (INSERT o UPDATE)
    if exists:
      cursor.execute("""
        UPDATE cds SET 
          nome_corso = %s,
          target_esami = %s
        WHERE codice = %s AND anno_accademico = %s AND curriculum = %s
      """, (
        nome_corso, 
        target_esami,
        codice_cds, anno_accademico, curriculum
      ))
      message = f"Date del corso {codice_cds} per l'anno accademico {anno_accademico} aggiornate con successo"
    else:
      cursor.execute("""
        INSERT INTO cds (
          codice, anno_accademico, nome_corso, curriculum, target_esami
        ) VALUES (
          %s, %s, %s, %s, %s
        )
      """, (
        codice_cds, anno_accademico, nome_corso, curriculum, target_esami
      ))
      message = f"Nuovo corso {codice_cds} per l'anno accademico {anno_accademico} creato con successo"
    
    # Elimina tutte le sessioni esistenti per questo CDS e anno accademico
    cursor.execute("""
      DELETE FROM sessioni 
      WHERE cds = %s AND anno_accademico = %s AND curriculum = %s
    """, (codice_cds, anno_accademico, curriculum))
    
    # Prepara le sessioni da inserire con i relativi limiti esami
    sessioni = []
    
    # Aggiungi le sessioni d'esame
    if anticipata_inizio and anticipata_fine:
      sessioni.append(('anticipata', anticipata_inizio, anticipata_fine, anticipata_esami_primo, None))
      
      # Gestisci la sessione invernale dell'anno precedente
      try:
        anno_precedente = anno_accademico - 1
        
        # Semplifichiamo il controllo: verifichiamo solo se esiste un record CDS per l'anno precedente
        cursor.execute(
          "SELECT COUNT(*) FROM cds WHERE codice = %s AND anno_accademico = %s AND curriculum = %s",
          (codice_cds, anno_precedente, curriculum)
        )
        exists_prev_year = cursor.fetchone()[0] > 0
        
        if not exists_prev_year:
          # Se non esiste, creiamo un record base
          cursor.execute("""
            INSERT INTO cds (
              codice, anno_accademico, nome_corso, curriculum
            ) VALUES (
              %s, %s, %s, %s
            )
          """, (
            codice_cds, anno_precedente, nome_corso, curriculum
          ))
        
        # In entrambi i casi, eliminiamo eventuali periodi invernali esistenti
        cursor.execute("""
          DELETE FROM sessioni 
          WHERE cds = %s AND anno_accademico = %s AND curriculum = %s AND tipo_sessione = 'invernale'
        """, (codice_cds, anno_precedente, curriculum))
        
        # E inseriamo la nuova sessione invernale per l'anno precedente
        cursor.execute("""
          INSERT INTO sessioni (cds, anno_accademico, curriculum, tipo_sessione, inizio, fine, esami_primo_semestre, esami_secondo_semestre)
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (codice_cds, anno_precedente, curriculum, 'invernale', anticipata_inizio, anticipata_fine, anticipata_esami_primo, None))
        
      except Exception as e:
        # Non interrompiamo il flusso principale se questa parte fallisce
        pass
    
    # Aggiungi le altre sessioni
    if estiva_inizio and estiva_fine:
      sessioni.append(('estiva', estiva_inizio, estiva_fine, estiva_esami_primo, estiva_esami_secondo))
    if autunnale_inizio and autunnale_fine:
      sessioni.append(('autunnale', autunnale_inizio, autunnale_fine, autunnale_esami_primo, autunnale_esami_secondo))
    if invernale_inizio and invernale_fine:
      sessioni.append(('invernale', invernale_inizio, invernale_fine, invernale_esami_primo, invernale_esami_secondo))
    
    # Inserisci le sessioni d'esame
    for tipo_sessione, inizio, fine, esami_primo, esami_secondo in sessioni:
      cursor.execute("""
        INSERT INTO sessioni (cds, anno_accademico, curriculum, tipo_sessione, inizio, fine, esami_primo_semestre, esami_secondo_semestre)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
      """, (codice_cds, anno_accademico, curriculum, tipo_sessione, inizio, fine, esami_primo, esami_secondo))
    
    # Commit delle modifiche
    conn.commit()
    
    return jsonify({
      'status': 'success',
      'message': message
    })
    
  except Exception as e:
    import traceback
    
    if conn:
      conn.rollback()
    
    return jsonify({'status': 'error', 'message': f'Si è verificato un errore: {str(e)}'}), 500
  
  finally:
    # Chiudi le risorse
    if cursor:
      cursor.close()
    if conn:
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
      SELECT DISTINCT ON (codice) codice, nome_corso, anno_accademico
      FROM cds
      WHERE anno_accademico = %s
      ORDER BY codice, nome_corso
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
    # Filtra solo gli esami con mostra_nel_calendario = TRUE
    cursor.execute("""
      SELECT i.id, i.codice, i.titolo, ic.anno_corso, ic.semestre,
           COALESCE(e.data_appello, NULL) as data_appello,
           EXTRACT(MONTH FROM e.data_appello) as mese,
           EXTRACT(YEAR FROM e.data_appello) as anno,
           EXTRACT(DAY FROM e.data_appello) as giorno
      FROM insegnamenti i
      JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
      LEFT JOIN esami e ON i.id = e.insegnamento
                        AND e.data_appello >= %s
                        AND e.mostra_nel_calendario = TRUE
      WHERE ic.cds = %s AND ic.anno_accademico = %s
      ORDER BY ic.anno_corso, i.titolo
    """, (f"{anno_accademico}-01-01", cds_code, anno_accademico))
    
    insegnamenti_raw = cursor.fetchall()
    
    # Raggruppa gli insegnamenti per evitare duplicazioni
    insegnamenti = []
    esami_per_insegnamento = {}
    
    for row in insegnamenti_raw:
      id_insegnamento = row['id']
      if id_insegnamento not in esami_per_insegnamento:
        insegnamenti.append({
          'id': id_insegnamento,
          'codice': row['codice'],
          'titolo': row['titolo'],
          'anno_corso': row['anno_corso'],
          'semestre': row['semestre'],
          'esami': []
        })
        esami_per_insegnamento[id_insegnamento] = insegnamenti[-1]['esami']
      
      # Aggiungi l'esame se c'è una data
      if row['data_appello']:
        esami_per_insegnamento[id_insegnamento].append({
          'data': row['data_appello'].strftime('%Y-%m-%d'),
          'mese': int(row['mese']),
          'anno': int(row['anno']),
          'giorno': int(row['giorno'])
        })
    
    # Ottieni le sessioni di esame per questo CdS
    cursor.execute("""
      SELECT tipo_sessione, inizio, fine
      FROM sessioni
      WHERE cds = %s AND anno_accademico = %s
      ORDER BY inizio
    """, (cds_code, anno_accademico))
    
    sessioni = cursor.fetchall()
    
    # Calcola i mesi con esami per il calendario
    mesi_sessioni = {}
    nomi_mesi = {
      "01": "GEN", "02": "FEB", "03": "MAR", 
      "04": "APR", "05": "MAG", "06": "GIU",
      "07": "LUG", "08": "AGO", "09": "SETT",
      "10": "OTT", "11": "NOV", "12": "DIC"
    }
    
    # Processa ogni sessione per aggiungere i mesi
    for sessione in sessioni:
      tipo_sessione, inizio, fine = sessione
      mesi_sessioni = add_months_to_periods(mesi_sessioni, inizio, fine, nomi_mesi)
    
    return jsonify({
      'nome_corso': cds_info['nome_corso'],
      'insegnamenti': insegnamenti,
      'periodi': list(mesi_sessioni.values())
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
        codice, anno_accademico, nome_corso, target_esami
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
    
    # Query per ottenere le sessioni d'esame dell'anno corrente
    cursor.execute("""
      SELECT tipo_sessione, inizio, fine, esami_primo_semestre, esami_secondo_semestre
      FROM sessioni
      WHERE cds = %s AND anno_accademico = %s
    """, (codice, anno_accademico))
    
    sessioni_data = {}
    
    # Mappa per convertire i tipi di sessione dal database ai nomi dei campi nella risposta
    tipo_sessione_field_map = {
      'anticipata': ('anticipata_inizio', 'anticipata_fine', 'anticipata_esami_primo', 'anticipata_esami_secondo'),
      'estiva': ('estiva_inizio', 'estiva_fine', 'estiva_esami_primo', 'estiva_esami_secondo'),
      'autunnale': ('autunnale_inizio', 'autunnale_fine', 'autunnale_esami_primo', 'autunnale_esami_secondo'),
      'invernale': ('invernale_inizio', 'invernale_fine', 'invernale_esami_primo', 'invernale_esami_secondo')
    }
    
    # Processa i risultati delle sessioni d'esame
    for tipo_sessione, inizio, fine, esami_primo, esami_secondo in cursor.fetchall():
      if tipo_sessione in tipo_sessione_field_map:
        inizio_field, fine_field, esami_primo_field, esami_secondo_field = tipo_sessione_field_map[tipo_sessione]
        sessioni_data[inizio_field] = inizio.isoformat() if inizio else None
        sessioni_data[fine_field] = fine.isoformat() if fine else None
        sessioni_data[esami_primo_field] = esami_primo
        sessioni_data[esami_secondo_field] = esami_secondo
    
    # Se non c'è una sessione anticipata, cerca la sessione invernale dell'anno precedente
    if 'anticipata_inizio' not in sessioni_data or not sessioni_data['anticipata_inizio']:
      try:
        anno_precedente = anno_accademico - 1
        cursor.execute("""
          SELECT inizio, fine, esami_primo_semestre, esami_secondo_semestre
          FROM sessioni
          WHERE cds = %s AND anno_accademico = %s AND tipo_sessione = 'invernale'
        """, (codice, anno_precedente))
        
        prev_winter = cursor.fetchone()
        if prev_winter:
          inizio, fine, esami_primo, esami_secondo = prev_winter
          sessioni_data['anticipata_inizio'] = inizio.isoformat() if inizio else None
          sessioni_data['anticipata_fine'] = fine.isoformat() if fine else None
          sessioni_data['anticipata_esami_primo'] = esami_primo
          sessioni_data['anticipata_esami_secondo'] = esami_secondo
      except Exception as e:
        pass
    
    # Combina i dati del CdS con le sessioni d'esame
    cds_data.update(sessioni_data)
    
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
@admin_bp.route('/get-anni-accademici')
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
  if not session.get('permessi_admin'):
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
  if not session.get('permessi_admin'):
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
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  try:
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    # Recupera tutti gli utenti
    cursor.execute("""
      SELECT username, matricola, nome, cognome, permessi_admin
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
  if not session.get('permessi_admin'):
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
  if not session.get('permessi_admin'):
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

@admin_bp.route('/checkProgrammazioneDidattica')
def check_programmazione_didattica():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  anno = request.args.get('anno')
  
  if not anno:
    return jsonify({"error": "Anno accademico non specificato"}), 400
    
  try:
    anno = int(anno)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verifica se esistono insegnamenti_cds per l'anno specificato
    cursor.execute("""
      SELECT COUNT(*) 
      FROM insegnamenti_cds 
      WHERE anno_accademico = %s
    """, (anno,))
    
    count = cursor.fetchone()[0]
    has_programmazione = count > 0
    
    return jsonify({
      'has_programmazione': has_programmazione,
      'count': count
    })
    
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)