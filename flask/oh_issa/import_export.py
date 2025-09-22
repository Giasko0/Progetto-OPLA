from flask import Blueprint, request, make_response, jsonify, session
from db import get_db_connection, release_connection
import io
from datetime import datetime, timedelta
import xlwt
import xlrd
from auth import require_auth

import_export_bp = Blueprint('import_export', __name__, url_prefix='/api/oh-issa')

@import_export_bp.route('/upload-file-ugov', methods=['POST'])
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
      
    if not file.filename.endswith('.xls'):
      return jsonify({'status': 'error', 'message': 'Formato file non supportato. Usare file Excel (.xls, .xlsx)'}), 400
    
    # Leggi il file Excel
    workbook = xlrd.open_workbook(file_contents=file.read())
    sheet = workbook.sheet_by_index(0)  # Foglio "Insegnamenti e coperture"
    
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
      'cod_curriculum': 12,                      # M - Cod. Curriculum
      'des_curriculum': 13,                      # N - Des. Curriculum
      'id_insegnamento': 14,                     # O - Id. Insegnamento
      'cod_insegnamento': 15,                    # P - Cod. Insegnamento
      'des_insegnamento': 16,                    # Q - Des. Insegnamento
      'anno_corso': 28,                          # AC - Anno Corso Insegnamento
      'cfu_insegnamento': 29,                    # AD - Peso Insegnamento
      'des_periodo_insegnamento': 39,            # AN - Des. Periodo Insegnamento
      'matricola_titolare': 55,                  # BD - Matricola Resp. Did. Insegnamento
      'af_master_insegnamento': 60,              # BI - AF Master Insegnamento
      'des_raggruppamento_insegnamento': 63,     # BL - Des. Raggruppamento Insegnamento
      'id_unita_didattica': 65,                  # BN - Id. Unità Didattica
      'cod_unita_didattica': 66,                 # BO - Cod. Unità Didattica
      'des_unita_didattica': 67,                 # BP - Des. Unità Didattica
      'af_master_unita_didattica': 99,           # CT - AF Master Unità Didattica
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
        'COD. CURRICULUM': 'cod_curriculum',
        'DES. CURRICULUM': 'des_curriculum',
        'ID INSEGNAMENTO': 'id_insegnamento',
        'COD. INSEGNAMENTO': 'cod_insegnamento',
        'DES. INSEGNAMENTO': 'des_insegnamento',
        'ANNO CORSO': 'anno_corso',
        'PESO INSEGNAMENTO': 'cfu_insegnamento',
        'DES. PERIODO INSEGNAMENTO': 'des_periodo_insegnamento',
        'MATRICOLA RESP. DID. INSEGNAMENTO': 'matricola_titolare',
        'AF MASTER INSEGNAMENTO': 'af_master_insegnamento',
        'DES. RAGGRUPPAMENTO INSEGNAMENTO': 'des_raggruppamento_insegnamento',
        'ID UNITÀ DIDATTICA': 'id_unita_didattica',
        'COD. UNITÀ DIDATTICA': 'cod_unita_didattica',
        'DES. UNITÀ DIDATTICA': 'des_unita_didattica',
        'AF MASTER UNITÀ DIDATTICA': 'af_master_unita_didattica',
        'DES. RAGGRUPPAMENTO UNITÀ DIDATTICA': 'des_raggruppamento_unita_didattica',
        'MATRICOLA DOCENTE': 'matricola_docente',
        'COGNOME DOCENTE': 'cognome_docente',
        'NOME DOCENTE': 'nome_docente',
        'USERNAME': 'username_docente'
      }
      
      # Aggiorna gli indici in base all'header reale
      for i, col_name in enumerate(header):
        for key, value in header_map.items():
          if key == col_name:
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
    default_semestre = 3  # 3 = annuale
    
    # Funzione helper per estrarre informazioni master da stringa di raggruppamento
    def estrai_info_master(raggruppamento_str):
        import re
        if not raggruppamento_str:
            return None
        
        # Cerca pattern completo "Mutua da: Af CODICE Cds CDS_CODE Reg ANNO Pds CURRICULUM"
        match = re.search(r'Mutua\s+da:\s+Af\s+([A-Z0-9]+)\s+Cds\s+([A-Z0-9]+)(?:\s+Reg\s+\d+)?\s+Pds\s+([A-Z0-9]+)', raggruppamento_str, re.IGNORECASE)
        if match:
            return {
                'codice': match.group(1),
                'cds': match.group(2), 
                'curriculum': match.group(3)
            }
        return None
    
    # Prima fase: raccogliamo tutti i dati dal file
    righe_dati = []
    for row_idx in range(1, sheet.nrows):
        try:
            # Estrai il docente
            username_docente = str(sheet.cell_value(row_idx, colonna_indices['username_docente'])).strip()
            if not username_docente:
                continue
                
            # Estrai tutti i dati della riga
            riga_dati = {
                'anno_accademico': int(float(sheet.cell_value(row_idx, colonna_indices['anno_accademico']))),
                'cod_cds': str(sheet.cell_value(row_idx, colonna_indices['cod_cds'])).strip(),
                'des_cds': str(sheet.cell_value(row_idx, colonna_indices['des_cds'])).strip(),
                'cod_curriculum': str(sheet.cell_value(row_idx, colonna_indices['cod_curriculum'])).strip(),
                'des_curriculum': str(sheet.cell_value(row_idx, colonna_indices['des_curriculum'])).strip(),
                'id_insegnamento': str(sheet.cell_value(row_idx, colonna_indices['id_insegnamento'])).replace('.0', '').strip(),
                'cod_insegnamento': str(sheet.cell_value(row_idx, colonna_indices['cod_insegnamento'])).strip(),
                'des_insegnamento': str(sheet.cell_value(row_idx, colonna_indices['des_insegnamento'])).strip(),
                'id_unita_didattica': str(sheet.cell_value(row_idx, colonna_indices['id_unita_didattica'])).replace('.0', '').strip() or None,
                'cod_unita_didattica': str(sheet.cell_value(row_idx, colonna_indices['cod_unita_didattica'])).strip() or None,
                'des_unita_didattica': str(sheet.cell_value(row_idx, colonna_indices['des_unita_didattica'])).strip() or None,
                'af_master_insegnamento': bool(sheet.cell_value(row_idx, colonna_indices['af_master_insegnamento'])),
                'af_master_unita_didattica': bool(sheet.cell_value(row_idx, colonna_indices['af_master_unita_didattica'])) if colonna_indices.get('id_unita_didattica') else False,
                'des_raggruppamento_insegnamento': str(sheet.cell_value(row_idx, colonna_indices['des_raggruppamento_insegnamento'])).strip(),
                'des_raggruppamento_unita_didattica': str(sheet.cell_value(row_idx, colonna_indices['des_raggruppamento_unita_didattica'])).strip(),
                'anno_corso': int(float(sheet.cell_value(row_idx, colonna_indices['anno_corso']) or 1)),
                'cfu_insegnamento': int(float(sheet.cell_value(row_idx, colonna_indices['cfu_insegnamento']) or 0)),
                'des_periodo_insegnamento': str(sheet.cell_value(row_idx, colonna_indices['des_periodo_insegnamento'])).strip(),
                'matricola_titolare': str(sheet.cell_value(row_idx, colonna_indices['matricola_titolare'])).strip(),
                'matricola_docente': str(sheet.cell_value(row_idx, colonna_indices['matricola_docente'])).strip(),
                'cognome_docente': str(sheet.cell_value(row_idx, colonna_indices['cognome_docente'])).strip(),
                'nome_docente': str(sheet.cell_value(row_idx, colonna_indices['nome_docente'])).strip(),
                'username_docente': username_docente
            }
            righe_dati.append(riga_dati)
        except Exception as e:
            continue
    
    # Crea mappature per trovare l'ID master dal codice + CdS + curriculum
    def trova_id_master(info_master, righe_dati, anno_accademico):
        """Trova l'ID dell'insegnamento master basandosi su codice, CdS, curriculum e anno"""
        if not info_master:
            return None
            
        # Prima cerca negli insegnamenti (colonna P)
        for riga in righe_dati:
            if (riga['cod_insegnamento'] == info_master['codice'] and
                riga['cod_cds'] == info_master['cds'] and 
                riga['cod_curriculum'] == info_master['curriculum'] and
                riga['anno_accademico'] == anno_accademico):
                return riga['id_insegnamento']
        
        # Poi cerca nei moduli (colonna BO) e restituisce l'ID del padre
        for riga in righe_dati:
            if (riga['cod_unita_didattica'] == info_master['codice'] and
                riga['cod_cds'] == info_master['cds'] and 
                riga['cod_curriculum'] == info_master['curriculum'] and
                riga['anno_accademico'] == anno_accademico):
                return riga['id_insegnamento']  # Restituisce l'ID del padre del modulo
        
        return None
    
    # Crea mappature codice → ID per poter trovare l'ID master dal codice
    codice_to_id_insegnamenti = {}
    codice_to_id_moduli = {}
    
    for riga in righe_dati:
        # Mappa codici insegnamenti → ID
        if riga['cod_insegnamento'] and riga['id_insegnamento']:
            codice_to_id_insegnamenti[riga['cod_insegnamento']] = riga['id_insegnamento']
        
        # Mappa codici moduli → ID (e anche il padre)
        if riga['cod_unita_didattica'] and riga['id_unita_didattica']:
            codice_to_id_moduli[riga['cod_unita_didattica']] = {
                'id_modulo': riga['id_unita_didattica'],
                'id_padre': riga['id_insegnamento']
            }
    
    # Seconda fase: applica la logica dei 6 casi
    for riga in righe_dati:
        try:
            # Determina se è un modulo o un insegnamento
            is_modulo = riga['id_unita_didattica'] is not None
            
            # Variabili che vengono sempre settate allo stesso valore
            cfu_effettivi = riga['cfu_insegnamento']  # Usa sempre la colonna AD
            periodo_effettivo = riga['des_periodo_insegnamento']  # Usa sempre il periodo dell'insegnamento
            
            # Flag per determinare se il docente deve inserire esami per questo insegnamento
            # Inizializzato a False, verrà settato a True nei casi appropriati
            inserire_esami = False
            
            # Logica per determinare ID e descrizione effettivi
            if is_modulo:
                # CASI 3-4: Gestione moduli
                if riga['af_master_unita_didattica']:
                    # CASO 3: Modulo è master -> carica il padre
                    id_effettivo = riga['id_insegnamento']
                    des_effettiva = riga['des_insegnamento']
                    master_id = None
                    # CASO 3: Modulo master -> il docente deve inserire esami (no mutuazione)
                    inserire_esami = True
                else:
                    # CASI 4: Modulo NON è master
                    info_master = estrai_info_master(riga['des_raggruppamento_unita_didattica'])
                    
                    if info_master:
                        # Trova l'ID del master usando codice + CdS + curriculum
                        master_id_found = trova_id_master(info_master, righe_dati, riga['anno_accademico'])
                        
                        if master_id_found:
                            id_effettivo = master_id_found
                            master_id = master_id_found  # Il master è l'insegnamento trovato
                            # CASO 4: Modulo che mutua -> il docente NON deve inserire esami (mutuazione)
                            inserire_esami = False
                            
                            # Trova i dettagli del master
                            master_row = next((r for r in righe_dati if r['id_insegnamento'] == master_id_found), None)
                            if master_row:
                                des_effettiva = master_row['des_insegnamento']
                                # Aggiungi anche l'insegnamento master alla lista
                                if master_id_found not in insegnamenti_set:
                                    insegnamenti_data.append((master_id_found, master_row['cod_insegnamento'], master_row['des_insegnamento']))
                                    insegnamenti_set.add(master_id_found)
                            else:
                                continue
                        else:
                            continue
                    else:
                        continue
            else:
                # CASI 1-2: Gestione insegnamenti
                if riga['af_master_insegnamento']:
                    # CASO 1: Insegnamento è master -> caricalo sempre
                    id_effettivo = riga['id_insegnamento']
                    des_effettiva = riga['des_insegnamento']
                    master_id = None
                    # CASO 1: Insegnamento master -> il docente deve inserire esami (no mutuazione)
                    inserire_esami = True
                else:
                    # CASO 2: Insegnamento NON è master
                    info_master = estrai_info_master(riga['des_raggruppamento_insegnamento'])
                    
                    if info_master:
                        # Trova l'ID del master usando codice + CdS + curriculum
                        master_id_found = trova_id_master(info_master, righe_dati, riga['anno_accademico'])
                        
                        if master_id_found:
                            # SOTTOCASO 2: Inserisci sia figlio che master
                            id_effettivo = riga['id_insegnamento']
                            des_effettiva = riga['des_insegnamento']
                            master_id = master_id_found  # Il master è l'insegnamento trovato
                            
                            # CASO 2: Verifica se mutua da un modulo
                            # Se il master è un modulo (presente in cod_unita_didattica), allora è caso speciale
                            master_e_modulo = any(r['cod_unita_didattica'] == info_master['codice'] and
                                                r['cod_cds'] == info_master['cds'] and
                                                r['cod_curriculum'] == info_master['curriculum'] and
                                                r['anno_accademico'] == riga['anno_accademico'] 
                                                for r in righe_dati)
                            
                            if master_e_modulo:
                                # CASO 2 SPECIALE: Insegnamento che mutua da un modulo
                                # Verifica il semestre: se è secondo semestre, NON deve inserire esami
                                semestre_corrente = periodo_to_semestre.get(periodo_effettivo, default_semestre)
                                
                                if semestre_corrente == 2:  # Secondo semestre
                                    # CASO 2 SPECIALE - SECONDO SEMESTRE: Insegnamento che mutua da un modulo nel secondo semestre ->
                                    # il docente NON deve inserire esami (evita duplicazione con primo semestre)
                                    inserire_esami = False
                                else:
                                    # CASO 2 SPECIALE - PRIMO SEMESTRE/ANNUALE: Insegnamento che mutua da un modulo ->
                                    # il docente DEVE inserire esami (sia figlio che padre del modulo vengono caricati)
                                    inserire_esami = True
                            else:
                                # CASO 2 NORMALE: Insegnamento che mutua da un altro insegnamento ->
                                # il docente NON deve inserire esami (mutuazione normale)
                                inserire_esami = False
                            
                            # Assicurati che anche l'insegnamento master sia nella lista
                            master_row = next((r for r in righe_dati if r['id_insegnamento'] == master_id_found), None)
                            if master_row and master_id_found not in insegnamenti_set:
                                insegnamenti_data.append((master_id_found, master_row['cod_insegnamento'], master_row['des_insegnamento']))
                                insegnamenti_set.add(master_id_found)
                        else:
                            continue
                    else:
                        continue
            
            # Dati comuni
            semestre = periodo_to_semestre.get(periodo_effettivo, default_semestre)
            matricola_titolare = riga['matricola_titolare'] or riga['matricola_docente']
            
            # Aggiungi CdS se non già presente
            cds_key = (riga['cod_cds'], riga['anno_accademico'], riga['cod_curriculum'])
            if cds_key not in cds_set:
                cds_data.append((riga['cod_cds'], riga['anno_accademico'], riga['des_cds'], 
                               riga['cod_curriculum'], riga['des_curriculum']))
                cds_set.add(cds_key)
            
            # Aggiungi insegnamento se non già presente
            if id_effettivo not in insegnamenti_set:
                cod_effettivo = next((r['cod_insegnamento'] for r in righe_dati if r['id_insegnamento'] == id_effettivo), '')
                insegnamenti_data.append((id_effettivo, cod_effettivo, des_effettiva))
                insegnamenti_set.add(id_effettivo)
            
            # Aggiungi insegnamento_cds
            insegnamenti_cds_key = (id_effettivo, riga['anno_accademico'], riga['cod_cds'], riga['cod_curriculum'])
            if insegnamenti_cds_key not in cds_set:
                insegnamenti_cds_data.append((
                    id_effettivo, 
                    riga['anno_accademico'], 
                    riga['cod_cds'], 
                    riga['cod_curriculum'],
                    riga['anno_corso'], 
                    semestre,
                    cfu_effettivi,
                    master_id,
                    matricola_titolare,
                    inserire_esami
                ))
                cds_set.add(insegnamenti_cds_key)
            
            # Aggiungi utente se non già presente
            if riga['username_docente'] not in utenti_set:
                utenti_data.append((riga['username_docente'], riga['matricola_docente'], 
                                  riga['nome_docente'], riga['cognome_docente'], False))
                utenti_set.add(riga['username_docente'])
            
            # Aggiungi insegnamento_docente
            insegnamento_docente_key = (id_effettivo, riga['username_docente'], riga['anno_accademico'])
            if insegnamento_docente_key not in insegnamento_docente_set:
                insegnamento_docente_data.append((id_effettivo, riga['username_docente'], riga['anno_accademico']))
                insegnamento_docente_set.add(insegnamento_docente_key)
                
        except Exception as e:
            continue
    
    # Terza fase: Assicurati che tutti i master ID referenziati esistano nella lista insegnamenti
    for item in insegnamenti_cds_data:
        master_id = item[7]  # Campo master è il 7° elemento
        if master_id and master_id not in insegnamenti_set:
            # Cerca il master nelle righe dati
            master_row = next((r for r in righe_dati if r['id_insegnamento'] == master_id), None)
            if master_row:
                insegnamenti_data.append((master_id, master_row['cod_insegnamento'], master_row['des_insegnamento']))
                insegnamenti_set.add(master_id)
            else:
                # Se non troviamo il master, imposta il campo master a NULL
                item_list = list(item)
                item_list[7] = None
                idx = insegnamenti_cds_data.index(item)
                insegnamenti_cds_data[idx] = tuple(item_list)

    # Inserisci dati nel database
    # 0. Configurazioni globali (inserisce l'anno accademico se non esiste)
    if cds_data:  # Solo se ci sono dati da importare
      anno_accademico_import = cds_data[0][1]  # Prende l'anno dal primo CdS
      try:
        cursor.execute("""
          INSERT INTO configurazioni_globali (anno_accademico, target_esami_default)
          VALUES (%s, NULL)
          ON CONFLICT (anno_accademico) DO NOTHING
        """, (anno_accademico_import,))
      except Exception as e:
        pass
    
    # 1. Cds
    for item in cds_data:
      try:
        cursor.execute("""
          INSERT INTO cds (codice, anno_accademico, nome_corso, curriculum_codice, curriculum_nome)
          VALUES (%s, %s, %s, %s, %s)
          ON CONFLICT (codice, anno_accademico, curriculum_codice) DO UPDATE 
          SET nome_corso = EXCLUDED.nome_corso,
              curriculum_nome = EXCLUDED.curriculum_nome
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
    
    # 3. Utenti
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
    
    # 4. Insegnamenti_cds
    for item in insegnamenti_cds_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamenti_cds 
          (insegnamento, anno_accademico, cds, curriculum_codice, anno_corso, semestre, cfu, master, titolare, inserire_esami)
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
          ON CONFLICT (insegnamento, anno_accademico, cds, curriculum_codice) DO UPDATE 
          SET anno_corso = EXCLUDED.anno_corso,
              semestre = EXCLUDED.semestre,
              cfu = EXCLUDED.cfu,
              master = EXCLUDED.master,
              titolare = EXCLUDED.titolare,
              inserire_esami = EXCLUDED.inserire_esami
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
        - {len(insegnamenti_cds_data)} assegnazioni insegnamento-CdS
        - {len(utenti_data)} docenti
        - {len(insegnamento_docente_data)} assegnazioni docente-insegnamento
        """
    })

@import_export_bp.route('/download-file-esse3')
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
        a.codice_esse3,           -- Codice Aula ESSE3
        ut.matricola,             -- Matricola Titolare
        a.sede,                   -- Sede
        e.condizione_sql,         -- Condizione SQL
        e.partizionamento,        -- Partizionamento
        e.partizione,             -- Partizione
        e.note_appello,           -- Note Appello
        e.posti,                  -- Posti
        e.codice_turno            -- Codice Turno
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.id
      JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento 
                                AND e.anno_accademico = ic.anno_accademico
                                AND e.cds = ic.cds
                                AND e.curriculum_codice = ic.curriculum_codice
      LEFT JOIN utenti ut ON ic.titolare = ut.matricola  -- Matricola del titolare
      LEFT JOIN aule a ON e.aula = a.nome
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
      'CdS',
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

@import_export_bp.route('/download-file-easyacademy')
def download_ea():
  if not session.get('permessi_admin'):
    return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
  anno = request.args.get('anno')
  details = request.args.get('details', 'true').lower() == 'true'
  
  if not anno:
    return jsonify({'error': 'Anno accademico non specificato'}), 400
    
  try:
    anno = int(anno)
    conn = get_db_connection()
    cursor = conn.cursor()

    # Recupera dati degli esami
    cursor.execute("""
      SELECT 
        e.id,
        e.descrizione,
        e.data_appello,
        e.ora_appello,
        e.durata_appello,
        a.codice_easyacademy AS aula_codice,
        a.nome AS aula_nome,
        i.id AS insegnamento_id,
        i.titolo AS insegnamento_titolo,
        e.anno_accademico,
        e.docente,
        u.nome AS docente_nome,
        u.cognome AS docente_cognome,
        u.matricola AS docente_matricola,
        e.note_appello
      FROM esami e
      JOIN insegnamenti i ON e.insegnamento = i.id
      LEFT JOIN aule a ON e.aula = a.nome
      LEFT JOIN utenti u ON e.docente = u.username
      WHERE e.anno_accademico = %s
      ORDER BY e.data_appello, e.docente, e.ora_appello
    """, (anno,))
    
    esami = cursor.fetchall()

    # Raggruppa gli esami per docente e data
    gruppi_esami = {}
    for esame in esami:
      (id_esame, descrizione, data_appello, ora_appello, durata_appello, 
       aula_codice, aula_nome, insegnamento_id, insegnamento_titolo, anno_accademico,
       docente, docente_nome, docente_cognome, docente_matricola, note_appello) = esame
      
      # Chiave per raggruppamento
      chiave = (docente, data_appello, ora_appello)
      
      if chiave not in gruppi_esami:
        gruppi_esami[chiave] = {
          'ids': [],
          'descrizioni': [],
          'insegnamento_ids': [],
          'insegnamento_titoli': [],
          'anni_accademici': [],
          'docenti_cognomi': [],
          'data_appello': data_appello,
          'ora_appello': ora_appello,
          'durata_appello': durata_appello,
          'aula_codice': aula_codice,
          'aula_nome': aula_nome,
          'docente': docente,
          'docente_nome': docente_nome,
          'docente_cognome': docente_cognome,
          'docente_matricola': docente_matricola,
          'note_appello': note_appello
        }
      
      # Aggiungi i dati al gruppo
      gruppi_esami[chiave]['ids'].append(str(id_esame))
      gruppi_esami[chiave]['descrizioni'].append(descrizione or "")
      gruppi_esami[chiave]['insegnamento_ids'].append(insegnamento_id)
      gruppi_esami[chiave]['insegnamento_titoli'].append(insegnamento_titolo)
      gruppi_esami[chiave]['anni_accademici'].append(str(anno_accademico))
      if docente_cognome and docente_cognome not in gruppi_esami[chiave]['docenti_cognomi']:
        gruppi_esami[chiave]['docenti_cognomi'].append(docente_cognome)

    # Crea il file Excel in memoria
    workbook = xlwt.Workbook()
    worksheet = workbook.add_sheet('Prenotazioni')

    # Data attuale per il codice prenotazione
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

    # Scrivi i dati raggruppati
    row_idx = 1
    for gruppo in gruppi_esami.values():
      data_appello = gruppo['data_appello']
      ora_appello = gruppo['ora_appello']
      durata_appello = gruppo['durata_appello']
      
      # Calcola l'orario di fine esame
      if ora_appello and durata_appello:
        inizio_datetime = datetime.combine(data_appello, ora_appello)
        fine_datetime = inizio_datetime + timedelta(minutes=durata_appello)
        
        # Formato testo per le date
        inizio_str = inizio_datetime.strftime('%d-%m-%Y, %H:%M')
        fine_str = fine_datetime.strftime('%d-%m-%Y, %H:%M')
      else:
        inizio_str = ""
        fine_str = ""

      # Concatena gli ID degli insegnamenti
      insegnamenti_concatenati = "/".join(gruppo['insegnamento_ids'])
      
      # Anni accademici nell'ordine corrispondente agli insegnamenti
      anni_concatenati = "/".join(gruppo['anni_accademici'])
      
      # Breve descrizione
      insegnamenti_str = ", ".join(gruppo['insegnamento_titoli'])
      cognomi_str = ", ".join([f"Prof. {cognome}" for cognome in gruppo['docenti_cognomi']])
      breve_descrizione = f"{insegnamenti_str} - {cognomi_str}"
      
      # Descrizione completa
      descrizione_completa = gruppo['descrizioni'][0] if gruppo['descrizioni'] and gruppo['descrizioni'][0] else gruppo['insegnamento_titoli'][0] if gruppo['insegnamento_titoli'] else ''

      col = 0
      # Colonna A: Codice prenotazione
      worksheet.write(row_idx, col, f"opla_{data_attuale}_{row_idx:03d}"); col += 1
      # Colonna B: Breve descrizione
      worksheet.write(row_idx, col, breve_descrizione); col += 1
      # Colonna C: Descrizione completa
      worksheet.write(row_idx, col, descrizione_completa); col += 1
      # Colonna D: Tipo prenotazione
      worksheet.write(row_idx, col, "Esame"); col += 1
      # Colonna E: Status
      worksheet.write(row_idx, col, "Confermata"); col += 1
      
      # Colonna F: Prenotazione da
      worksheet.write(row_idx, col, inizio_str); col += 1
      # Colonna G: Prenotazione a
      worksheet.write(row_idx, col, fine_str); col += 1
      # Colonna H: Durata totale da
      worksheet.write(row_idx, col, inizio_str); col += 1
      # Colonna I: Durata totale a
      worksheet.write(row_idx, col, fine_str); col += 1
      
      # Colonna J: Tipo ripetizione
      worksheet.write(row_idx, col, "una volta"); col += 1

      if gruppo['aula_codice'] == 'STDOCENTE':
        # Colonna K: Codice aula
        worksheet.write(row_idx, col, ""); col += 1
        # Colonna L: Nome aula
        worksheet.write(row_idx, col, ""); col += 1
        # Colonna M: Codice sede
        worksheet.write(row_idx, col, ""); col += 1
        # Colonna N: Sede
        worksheet.write(row_idx, col, ""); col += 1
      else:
        # Colonna K: Codice aula
        worksheet.write(row_idx, col, gruppo['aula_codice']); col += 1
        # Colonna L: Nome aula
        worksheet.write(row_idx, col, gruppo['aula_nome']); col += 1
        # Colonna M: Codice sede
        worksheet.write(row_idx, col, "P02E04"); col += 1
        # Colonna N: Sede
        worksheet.write(row_idx, col, "Matematica e Informatica"); col += 1

      # Colonna O: Aula virtuale
      if gruppo['aula_codice'] == 'STDOCENTE':
        worksheet.write(row_idx, col, "1"); col += 1
      else:
        worksheet.write(row_idx, col, ""); col += 1

      # Colonna P: Etichetta aula virtuale
      if gruppo['aula_codice'] == 'STDOCENTE':
        worksheet.write(row_idx, col, "Studio docente DMI"); col += 1
      else:
        worksheet.write(row_idx, col, ""); col += 1

      if details:
        # Colonna Q: Codice insegnamento
        worksheet.write(row_idx, col, insegnamenti_concatenati); col += 1
        # Colonna R: Anno accademico
        worksheet.write(row_idx, col, anni_concatenati); col += 1
        # Colonna S: Codice raggruppamento
        worksheet.write(row_idx, col, "DMI"); col += 1
        # Colonna T: Nome raggruppamento
        worksheet.write(row_idx, col, "Dipartimento di Matematica e Informatica"); col += 1
        # Colonna U: Codice utente utilizzatore
        worksheet.write(row_idx, col, gruppo['docente_matricola'] or ""); col += 1
        # Colonna V: Nome utente utilizzatore
        worksheet.write(row_idx, col, gruppo['docente_nome'] or ""); col += 1
        # Colonna W: Cognome utente utilizzatore
        worksheet.write(row_idx, col, gruppo['docente_cognome'] or ""); col += 1
        # Colonna X: Note
        worksheet.write(row_idx, col, gruppo['note_appello'] or ""); col += 1
        # Colonna Y: Note interne
        worksheet.write(row_idx, col, ""); col += 1
      else:
        # Salta le colonne Q e R (codice insegnamento e anno accademico)
        worksheet.write(row_idx, col, ""); col += 1  # Q vuota
        worksheet.write(row_idx, col, ""); col += 1  # R vuota
        # Colonna S: Codice raggruppamento
        worksheet.write(row_idx, col, "DMI"); col += 1
        # Colonna T: Nome raggruppamento
        worksheet.write(row_idx, col, "Dipartimento di Matematica e Informatica"); col += 1
        # Salta le colonne U, V e W (dati docente)
        worksheet.write(row_idx, col, ""); col += 1  # U vuota
        worksheet.write(row_idx, col, ""); col += 1  # V vuota
        worksheet.write(row_idx, col, ""); col += 1  # W vuota
        # Colonna X: Note
        worksheet.write(row_idx, col, gruppo['note_appello'] or ""); col += 1
        # Colonna Y: Note interne
        worksheet.write(row_idx, col, ""); col += 1
      
      row_idx += 1

    # Salva il workbook in memoria
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)

    # Genera il nome del file con la data odierna
    data_oggi = datetime.now().strftime('%Y%m%d')
    suffix = "_dettagliato" if details else "_semplificato"
    filename = f'opla_easyacademy{suffix}_{data_oggi}.xls'

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

@import_export_bp.route('/check-programmazione-didattica')
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