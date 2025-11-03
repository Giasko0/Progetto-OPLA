from flask import Blueprint, request, make_response, jsonify, session, send_file
from db import get_db_connection, release_connection
import io
from datetime import datetime, timedelta
import xlwt
import xlrd
from auth import require_auth

import_export_bp = Blueprint('import_export', __name__, url_prefix='/api/oh-issa')

# Mapping periodo → semestre (case-insensitive), default 3=Annuale
_PERIODI_TO_SEMESTRE = {'PRIMO SEMESTRE': 1, 'SECONDO SEMESTRE': 2, 'ANNUALE': 3}
def map_semestre_from_periodo(periodo):
    return _PERIODI_TO_SEMESTRE.get(str(periodo).strip().upper(), 3)

def _get_header_indices(sheet):
    # Indici base (posizioni tipiche)
    idx = {
        'anno_accademico': 0,                      # A - Anno Offerta
        'cod_cds': 6,                              # G - Cod. Corso di Studio
        'des_cds': 8,                              # I - Des. C.d.S.
        'cod_curriculum': 12,                      # M - Cod. Curriculum
        'des_curriculum': 13,                      # N - Des. Curriculum
        'id_insegnamento': 14,                     # O - Id. Insegnamento
        'cod_insegnamento': 15,                    # P - Cod. Insegnamento
        'des_insegnamento': 16,                    # Q - Des. Insegnamento
        'cod_taf_insegnamento': 18,                # S - Cod. TAF Insegnamento
        'id_ambito_insegnamento': 20,              # U - Id. Ambito Insegnamento
        'anno_corso': 28,                          # AC - Anno Corso
        'cfu_insegnamento': 29,                    # AD - CFU
        'des_periodo_insegnamento': 39,            # AN - Periodo Insegnamento
        'matricola_titolare': 55,                  # BD - Matricola Resp. Did.
        'af_master_insegnamento': 60,              # BI - AF Master Insegnamento
        'des_raggruppamento_insegnamento': 63,     # BL - Des. Raggruppamento Ins.
        'id_unita_didattica': 65,                  # BN - Id. Unità Didattica
        'cod_unita_didattica': 66,                 # BO - Cod. Unità Didattica
        'des_unita_didattica': 67,                 # BP - Des. Unità Didattica
        'des_periodo_unita_didattica': 84,         # CC - Des. Periodo UD (se presente)
        'af_master_unita_didattica': 99,           # CT - AF Master UD
        'des_raggruppamento_unita_didattica': 100, # CW - Des. Raggruppamento UD
        'matricola_docente': 105,                  # DB - Matricola Docente
        'cognome_docente': 106,                    # DC - Cognome Docente
        'nome_docente': 107,                       # DD - Nome Docente
        'username_docente': 108                    # DE - Username
    }
    # Header dinamico
    if sheet.nrows > 0:
        header = [str(sheet.cell_value(0, i)).strip().upper() for i in range(sheet.ncols)]
        header_map = {
            'ANNO OFFERTA': 'anno_accademico',
            'COD. CORSO DI STUDIO': 'cod_cds',
            'DES. CORSO DI STUDIO': 'des_cds',
            'COD. CURRICULUM': 'cod_curriculum',
            'DES. CURRICULUM': 'des_curriculum',
            'ID INSEGNAMENTO': 'id_insegnamento',
            'COD. INSEGNAMENTO': 'cod_insegnamento',
            'DES. INSEGNAMENTO': 'des_insegnamento',
            'COD. TAF INSEGNAMENTO': 'cod_taf_insegnamento',
            'ID. AMBITO INSEGNAMENTO': 'id_ambito_insegnamento',
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
            'USERNAME': 'username_docente',
            "DES. PERIODO UNITÀ DIDATTICA": 'des_periodo_unita_didattica',
            "DES. PERIODO UNITA DIDATTICA": 'des_periodo_unita_didattica',
            "DES. PERIODO UNITA' DIDATTICA": 'des_periodo_unita_didattica'
        }
        for i, col_name in enumerate(header):
            mapped = header_map.get(col_name)
            if mapped:
                idx[mapped] = i
    return idx

def _cell(sheet, row, col, default=''):
    try:
        val = sheet.cell_value(row, col)
        return default if val in (None, '') else val
    except Exception:
        return default

def _should_import_row(sheet, row_idx, idx):
    # Logica: accetta S in {A,B,C,NULL} oppure S=F e U=70285
    cod_taf_raw = _cell(sheet, row_idx, idx.get('cod_taf_insegnamento', 18), None)
    cod_taf = str(cod_taf_raw).strip().upper() if cod_taf_raw else ''
    if cod_taf in ('', 'A', 'B', 'C'):
        return True
    if cod_taf == 'F':
        id_ambito_raw = _cell(sheet, row_idx, idx.get('id_ambito_insegnamento', 20), '')
        id_ambito = str(id_ambito_raw).strip()
        return id_ambito == '70285'
    return False

def _parse_row(sheet, row_idx, idx):
    return {
        'anno_accademico': int(float(_cell(sheet, row_idx, idx['anno_accademico'], 0))),
        'cod_cds': str(_cell(sheet, row_idx, idx['cod_cds'], '???CDS???')).strip(),
        'des_cds': str(_cell(sheet, row_idx, idx['des_cds'], '???NOME_CDS???')).strip(),
        'cod_curriculum': str(_cell(sheet, row_idx, idx['cod_curriculum'], 'GEN')).strip(),
        'des_curriculum': str(_cell(sheet, row_idx, idx['des_curriculum'], 'CORSO GENERICO')).strip(),
        'id_insegnamento': str(_cell(sheet, row_idx, idx['id_insegnamento'], '???ID???')).replace('.0', '').strip(),
        'cod_insegnamento': str(_cell(sheet, row_idx, idx['cod_insegnamento'], '???COD???')).strip(),
        'des_insegnamento': str(_cell(sheet, row_idx, idx['des_insegnamento'], '???NOME_INSEGNAMENTO???')).strip(),
        'id_unita_didattica': (str(_cell(sheet, row_idx, idx.get('id_unita_didattica', -1), '')).replace('.0', '').strip() or None),
        'cod_unita_didattica': (str(_cell(sheet, row_idx, idx.get('cod_unita_didattica', -1), '')).strip() or None),
        'des_unita_didattica': (str(_cell(sheet, row_idx, idx.get('des_unita_didattica', -1), '')).strip() or None),
        'af_master_insegnamento': bool(_cell(sheet, row_idx, idx.get('af_master_insegnamento', -1), 0)),
        'af_master_unita_didattica': bool(_cell(sheet, row_idx, idx.get('af_master_unita_didattica', -1), 0)) if idx.get('af_master_unita_didattica') is not None else False,
        'des_raggruppamento_insegnamento': str(_cell(sheet, row_idx, idx.get('des_raggruppamento_insegnamento', -1), '')).strip(),
        'des_raggruppamento_unita_didattica': str(_cell(sheet, row_idx, idx.get('des_raggruppamento_unita_didattica', -1), '')).strip(),
        'anno_corso': int(float(_cell(sheet, row_idx, idx['anno_corso'], 1))),
        'cfu_insegnamento': int(float(_cell(sheet, row_idx, idx['cfu_insegnamento'], 6))),
        'des_periodo_insegnamento': str(_cell(sheet, row_idx, idx['des_periodo_insegnamento'], 'Annuale')).strip(),
        'des_periodo_unita_didattica': (str(_cell(sheet, row_idx, idx.get('des_periodo_unita_didattica', -1), '')).strip()
                                         if idx.get('des_periodo_unita_didattica') is not None else None),
        'matricola_titolare': str(_cell(sheet, row_idx, idx['matricola_titolare'], '')).strip(),
        'matricola_docente': str(_cell(sheet, row_idx, idx['matricola_docente'], '')).strip(),
        'cognome_docente': str(_cell(sheet, row_idx, idx['cognome_docente'], '???COGNOME???')).strip(),
        'nome_docente': str(_cell(sheet, row_idx, idx['nome_docente'], '???NOME???')).strip(),
        'username_docente': str(_cell(sheet, row_idx, idx['username_docente'], '')).strip() or None
    }

def estrai_info_master(raggruppamento_str):
    import re
    if not raggruppamento_str:
        return None
    match = re.search(r'Mutua\s+da:\s+Af\s+([A-Z0-9]+)\s+Cds\s+([A-Z0-9]+)(?:\s+Reg\s+\d+)?\s+Pds\s+([A-Z0-9]+)', raggruppamento_str, re.IGNORECASE)
    if match:
        return {'codice': match.group(1), 'cds': match.group(2), 'curriculum': match.group(3)}
    return None

def trova_id_master(info_master, righe_dati, anno_accademico):
    if not info_master:
        return None
    for r in righe_dati:
        if (r['cod_insegnamento'] == info_master['codice'] and
            r['cod_cds'] == info_master['cds'] and
            r['cod_curriculum'] == info_master['curriculum'] and
            r['anno_accademico'] == anno_accademico):
            return r['id_insegnamento']
    for r in righe_dati:
        if (r['cod_unita_didattica'] == info_master['codice'] and
            r['cod_cds'] == info_master['cds'] and
            r['cod_curriculum'] == info_master['curriculum'] and
            r['anno_accademico'] == anno_accademico):
            return r['id_insegnamento']
    return None

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
      return jsonify({'status': 'error', 'message': 'Formato file non supportato'}), 400
    
    # Leggi il file Excel
    workbook = xlrd.open_workbook(file_contents=file.read())
    sheet = workbook.sheet_by_index(0)  # Foglio "Insegnamenti e coperture"
    
    colonna_indices = _get_header_indices(sheet)

    # Dati per l'inserimento
    insegnamenti_data = []
    insegnamenti_cds_data = []
    cds_data = []
    utenti_data = []
    insegnamento_docente_data = []
    # Insiemi per deduplicazione
    insegnamenti_set = set()
    cds_set = set()
    utenti_set = set()
    insegnamento_docente_set = set()
    insegnamenti_cds_set = set()

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
        'COD. TAF INSEGNAMENTO': 'cod_taf_insegnamento',
        'ID. AMBITO INSEGNAMENTO': 'id_ambito_insegnamento',
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
    
    # Prima fase: raccogliamo tutti i dati dal file
    righe_dati = []
    righe_saltate = 0

    for row_idx in range(1, sheet.nrows):
        try:
            if not _should_import_row(sheet, row_idx, colonna_indices):
                righe_saltate += 1
                continue
            riga_dati = _parse_row(sheet, row_idx, colonna_indices)
            righe_dati.append(riga_dati)
        except Exception:
            righe_saltate += 1
            continue
    
    # Crea mappature per trovare l'ID master dal codice + CdS + curriculum
    def trova_id_master(info_master, righe, anno):
        """Trova l'ID dell'insegnamento master basandosi su codice, CdS, curriculum e anno"""
        if not info_master:
            return None
            
        # Prima cerca negli insegnamenti (colonna P)
        for riga in righe:
            if (riga['cod_insegnamento'] == info_master['codice'] and
                riga['cod_cds'] == info_master['cds'] and 
                riga['cod_curriculum'] == info_master['curriculum'] and
                riga['anno_accademico'] == anno):
                return riga['id_insegnamento']
        
        # Poi cerca nei moduli (colonna BO) e restituisce l'ID del padre
        for riga in righe:
            if (riga['cod_unita_didattica'] == info_master['codice'] and
                riga['cod_cds'] == info_master['cds'] and 
                riga['cod_curriculum'] == info_master['curriculum'] and
                riga['anno_accademico'] == anno):
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
            
            # L'ID che verrà salvato nel DB è SEMPRE id_insegnamento (padre)
            # id_unita_didattica viene usato solo per i controlli
            id_da_salvare = riga['id_insegnamento']
            
            # Logica per determinare master e descrizione effettivi
            if is_modulo:
                # CASI 3-4: Gestione moduli
                if riga['af_master_unita_didattica']:
                    # CASO 3: Modulo è master -> carica il padre
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
                                semestre_corrente = map_semestre_from_periodo(periodo_effettivo)
                                
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
            
            semestre = map_semestre_from_periodo(periodo_effettivo)
            matricola_titolare = riga['matricola_titolare'] or riga['matricola_docente']
            
            # Se la matricola è stringa vuota, imposta a None per rispettare il vincolo FK
            if matricola_titolare == '':
                matricola_titolare = None
            
            # Aggiungi CdS se non già presente
            cds_key = (riga['cod_cds'], riga['anno_accademico'], riga['cod_curriculum'])
            if cds_key not in cds_set:
                cds_data.append((riga['cod_cds'], riga['anno_accademico'], riga['des_cds'], 
                               riga['cod_curriculum'], riga['des_curriculum']))
                cds_set.add(cds_key)
            
            # Aggiungi insegnamento padre se non già presente
            if id_da_salvare not in insegnamenti_set:
                insegnamenti_data.append((id_da_salvare, riga['cod_insegnamento'], des_effettiva))
                insegnamenti_set.add(id_da_salvare)
            
            # Aggiungi insegnamento_cds
            insegnamenti_cds_key = (id_da_salvare, riga['anno_accademico'], riga['cod_cds'], riga['cod_curriculum'])
            if insegnamenti_cds_key not in insegnamenti_cds_set:
                insegnamenti_cds_data.append((
                    id_da_salvare,
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
                insegnamenti_cds_set.add(insegnamenti_cds_key)
            
            # Aggiungi utente se non già presente (solo se c'è un docente)
            if riga['username_docente'] and riga['username_docente'] not in utenti_set:
                utenti_data.append((riga['username_docente'], riga['matricola_docente'], 
                                  riga['nome_docente'], riga['cognome_docente'], False))
                utenti_set.add(riga['username_docente'])
            
            # Aggiungi insegnamento_docente (solo se c'è un docente)
            if riga['username_docente']:
                insegnamento_docente_key = (id_da_salvare, riga['username_docente'], riga['anno_accademico'])
                if insegnamento_docente_key not in insegnamento_docente_set:
                    insegnamento_docente_data.append((id_da_salvare, riga['username_docente'], riga['anno_accademico']))
                    insegnamento_docente_set.add(insegnamento_docente_key)
                
        except Exception:
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
      except Exception:
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
      except Exception:
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
      except Exception:
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
      except Exception:
        continue
    
    # 5. Insegnamento_docente
    for item in insegnamento_docente_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamento_docente (insegnamento, docente, annoaccademico)
          VALUES (%s, %s, %s)
          ON CONFLICT (insegnamento, docente, annoaccademico) DO NOTHING
        """, item)
      except Exception:
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

@import_export_bp.route('/preview-ugov', methods=['POST'])
def preview_ugov():
    if not session.get('permessi_admin'):
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401

    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'Nessun file selezionato'}), 400

    if not file.filename.endswith('.xls'):
        return jsonify({'status': 'error', 'message': 'Formato file non supportato. Usare file Excel (.xls, .xlsx)'}), 400

    try:
        workbook = xlrd.open_workbook(file_contents=file.read())
        sheet = workbook.sheet_by_index(0)

        colonna_indices = _get_header_indices(sheet)
        
        righe_dati = []
        righe_saltate = 0
        for row_idx in range(1, sheet.nrows):
            try:
                if not _should_import_row(sheet, row_idx, colonna_indices):
                    righe_saltate += 1
                    continue
                riga = _parse_row(sheet, row_idx, colonna_indices)
                righe_dati.append(riga)
            except Exception:
                righe_saltate += 1
                continue

        # Indici veloci
        codice_to_modulo_row = {}
        for r in righe_dati:
            if r['cod_unita_didattica']:
                key = (r['cod_unita_didattica'], r['cod_cds'], r['cod_curriculum'], r['anno_accademico'])
                codice_to_modulo_row[key] = r

        # Contenitori per report
        insegnamenti_dict = {}
        insegnamenti_senza_docente = []  # NUOVO: lista insegnamenti senza docente
        mutuati_normali = []
        mutuati_modulo1 = []
        mutuati_modulo2 = []
        moduli = []
        
        # Set per evitare duplicati dovuti a codocenza
        insegnamenti_processati = set()
        mutuati_processati = set()
        moduli_processati = set()

        # Trova master id
        def trova_id_master(info_master, righe, anno):
            if not info_master:
                return None
            for r in righe:
                if (r['cod_insegnamento'] == info_master['codice'] and
                    r['cod_cds'] == info_master['cds'] and
                    r['cod_curriculum'] == info_master['curriculum'] and
                    r['anno_accademico'] == anno):
                    return r['id_insegnamento']
            for r in righe:
                if (r['cod_unita_didattica'] == info_master['codice'] and
                    r['cod_cds'] == info_master['cds'] and
                    r['cod_curriculum'] == info_master['curriculum'] and
                    r['anno_accademico'] == anno):
                    return r['id_insegnamento']
            return None

        # Elabora
        for r in righe_dati:
            try:
                is_modulo = r['id_unita_didattica'] is not None
                periodo_effettivo = r['des_periodo_insegnamento']
                semestre_corrente = map_semestre_from_periodo(periodo_effettivo)

                if is_modulo:
                    if r['af_master_unita_didattica']:
                        modulo_key = (r['id_unita_didattica'], r['id_insegnamento'], r['anno_accademico'], r['cod_cds'], r['cod_curriculum'])
                        if modulo_key in moduli_processati:
                            continue
                        moduli_processati.add(modulo_key)

                        insegnamenti_dict[r['id_insegnamento']] = (r['cod_insegnamento'], r['des_insegnamento'])
                        modulo_semestre = map_semestre_from_periodo(r.get('des_periodo_unita_didattica') or '')
                        modulo_info = {
                            'tipo': 'modulo master',
                            'modulo_id': r['id_unita_didattica'],
                            'modulo_cod': r['cod_unita_didattica'],
                            'modulo_desc': r['des_unita_didattica'],
                            'modulo_numero': 1 if modulo_semestre == 1 else 2 if modulo_semestre == 2 else None,
                            'padre_id': r['id_insegnamento'],
                            'padre_cod': r['cod_insegnamento'],
                            'padre_desc': r['des_insegnamento'],
                            'salvataggio': f"insegnamenti_cds(insegnamento={r['id_insegnamento']}, master=NULL, inserire_esami=True, semestre={semestre_corrente})"
                        }
                        if not r['username_docente']:
                            modulo_info['senza_docente'] = True
                        moduli.append(modulo_info)
                    else:
                        info_master = estrai_info_master(r['des_raggruppamento_unita_didattica'])
                        if not info_master:
                            continue
                        master_id = trova_id_master(info_master, righe_dati, r['anno_accademico'])
                        if not master_id:
                            continue
                        
                        modulo_key = (r['id_unita_didattica'], master_id, r['anno_accademico'], r['cod_cds'], r['cod_curriculum'])
                        if modulo_key in moduli_processati:
                            continue
                        moduli_processati.add(modulo_key)
                        
                        insegnamenti_dict[master_id] = next(
                            ((rr['cod_insegnamento'], rr['des_insegnamento']) for rr in righe_dati if rr['id_insegnamento'] == master_id),
                            ('', '')
                        )
                        modulo_key_lookup = (info_master['codice'], info_master['cds'], info_master['curriculum'], r['anno_accademico'])
                        modulo_row = codice_to_modulo_row.get(modulo_key_lookup)
                        modulo_semestre = map_semestre_from_periodo((modulo_row.get('des_periodo_unita_didattica') or '') if modulo_row else '')
                        modulo_info = {
                            'tipo': 'modulo mutuato',
                            'modulo_id': r['id_unita_didattica'],
                            'modulo_cod': r['cod_unita_didattica'],
                            'modulo_desc': r['des_unita_didattica'],
                            'modulo_numero': 1 if modulo_semestre == 1 else 2 if modulo_semestre == 2 else None,
                            'padre_id': master_id,
                            'padre_cod': next((rr['cod_insegnamento'] for rr in righe_dati if rr['id_insegnamento'] == master_id), ''),
                            'padre_desc': next((rr['des_insegnamento'] for rr in righe_dati if rr['id_insegnamento'] == master_id), ''),
                            'salvataggio': f"insegnamenti_cds(insegnamento={master_id}, master={master_id}, inserire_esami=False, semestre={semestre_corrente})"
                        }
                        if not r['username_docente']:
                            modulo_info['senza_docente'] = True
                        moduli.append(modulo_info)
                else:
                    if r['af_master_insegnamento']:
                        ins_key = (r['id_insegnamento'], r['anno_accademico'], r['cod_cds'], r['cod_curriculum'])
                        if ins_key not in insegnamenti_processati:
                            insegnamenti_dict[r['id_insegnamento']] = (r['cod_insegnamento'], r['des_insegnamento'])
                            insegnamenti_processati.add(ins_key)
                            if not r['username_docente']:
                                insegnamenti_senza_docente.append({
                                    'id': r['id_insegnamento'],
                                    'codice': r['cod_insegnamento'],
                                    'titolo': r['des_insegnamento'],
                                    'cds': r['cod_cds'],
                                    'curriculum': r['cod_curriculum']
                                })
                    else:
                        info_master = estrai_info_master(r['des_raggruppamento_insegnamento'])
                        if not info_master:
                            continue
                        master_id = trova_id_master(info_master, righe_dati, r['anno_accademico'])
                        if not master_id:
                            continue
                        
                        mutuato_key = (r['id_insegnamento'], master_id, r['anno_accademico'], r['cod_cds'], r['cod_curriculum'])
                        if mutuato_key in mutuati_processati:
                            continue
                        mutuati_processati.add(mutuato_key)
                        
                        insegnamenti_dict[r['id_insegnamento']] = (r['cod_insegnamento'], r['des_insegnamento'])
                        master_row = next((rr for rr in righe_dati if rr['id_insegnamento'] == master_id), None)
                        if master_row:
                            insegnamenti_dict[master_id] = (master_row['cod_insegnamento'], master_row['des_insegnamento'])

                        modulo_key = (info_master['codice'], info_master['cds'], info_master['curriculum'], r['anno_accademico'])
                        modulo_row = codice_to_modulo_row.get(modulo_key)
                        master_tipo = 'modulo' if modulo_row else 'padre'
                        modulo_semestre = map_semestre_from_periodo((modulo_row.get('des_periodo_unita_didattica') or '') if modulo_row else '')
                        modulo_numero = 1 if modulo_semestre == 1 else 2 if modulo_semestre == 2 else None

                        if master_tipo == 'modulo':
                          inserire_esami = False if semestre_corrente == 2 else True
                        else:
                          inserire_esami = False

                        entry = {
                          'figlio_id': r['id_insegnamento'],
                          'figlio_cod': r['cod_insegnamento'],
                          'figlio_desc': r['des_insegnamento'],
                          'master_id': master_id,
                          'master_cod': master_row['cod_insegnamento'] if master_row else '',
                          'master_desc': master_row['des_insegnamento'] if master_row else '',
                          'master_tipo': master_tipo,
                          'modulo_numero': modulo_numero,
                          'semestre': semestre_corrente,
                          'inserire_esami': inserire_esami
                        }
                        if not r['username_docente']:
                            entry['senza_docente'] = True
                            insegnamenti_senza_docente.append({
                                'id': r['id_insegnamento'],
                                'codice': r['cod_insegnamento'],
                                'titolo': r['des_insegnamento'],
                                'cds': r['cod_cds'],
                                'curriculum': r['cod_curriculum']
                            })
                        if master_tipo == 'padre':
                          mutuati_normali.append(entry)
                        elif modulo_numero == 1:
                          mutuati_modulo1.append(entry)
                        elif modulo_numero == 2:
                          mutuati_modulo2.append(entry)
                        else:
                          mutuati_normali.append(entry)
            except Exception:
                continue

        # Genera testo del report
        lines = []
        lines.append("=" * 80)
        lines.append("PANORAMICA INSEGNAMENTI U-GOV")
        lines.append("=" * 80)
        lines.append(f"Righe processate: {len(righe_dati)}")
        lines.append(f"Righe saltate: {righe_saltate}")
        lines.append("")

        # Sezione 1: Insegnamenti normali
        lines.append("INSEGNAMENTI NORMALI (anche quelli che mutuano)")
        lines.append("-" * 80)
        for iid, (cod, tit) in sorted(insegnamenti_dict.items(), key=lambda x: (x[1][0], x[0])):
            lines.append(f"  {iid} - {cod} - {tit}")
        lines.append("")

        # Sezione 2: Insegnamenti mutuati (divisi per tipo)
        lines.append("INSEGNAMENTI MUTUATI")
        lines.append("-" * 80)
        
        # Mutuati da insegnamento normale
        lines.append("")
        lines.append("► Mutuati da Insegnamento Normale:")
        if not mutuati_normali:
            lines.append("  Nessuno")
        else:
            for m in sorted(mutuati_normali, key=lambda x: (x['figlio_cod'], x['figlio_id'])):
                senza_doc = " [SENZA DOCENTE]" if m.get('senza_docente') else ""
                lines.append(f"  • Figlio: {m['figlio_id']} - {m['figlio_cod']} - {m['figlio_desc']}{senza_doc}")
                lines.append(f"    Master: {m['master_id']} - {m['master_cod']} - {m['master_desc']}")
                lines.append(f"    DB: insegnamenti_cds(ins={m['figlio_id']}, master={m['master_id']}, sem={m['semestre']}, ins_esami={m['inserire_esami']})")
                lines.append("")
        
        # Mutuati da primo modulo
        lines.append("► Mutuati da Primo Modulo:")
        if not mutuati_modulo1:
            lines.append("  Nessuno")
        else:
            for m in sorted(mutuati_modulo1, key=lambda x: (x['figlio_cod'], x['figlio_id'])):
                senza_doc = " [SENZA DOCENTE]" if m.get('senza_docente') else ""
                lines.append(f"  • Figlio: {m['figlio_id']} - {m['figlio_cod']} - {m['figlio_desc']}{senza_doc}")
                lines.append(f"    Master: {m['master_id']} - {m['master_cod']} - {m['master_desc']} (modulo 1)")
                lines.append(f"    DB: insegnamenti_cds(ins={m['figlio_id']}, master={m['master_id']}, sem={m['semestre']}, ins_esami={m['inserire_esami']})")
                lines.append("")
        
        # Mutuati da secondo modulo
        lines.append("► Mutuati da Secondo Modulo:")
        if not mutuati_modulo2:
            lines.append("  Nessuno")
        else:
            for m in sorted(mutuati_modulo2, key=lambda x: (x['figlio_cod'], x['figlio_id'])):
                senza_doc = " [SENZA DOCENTE]" if m.get('senza_docente') else ""
                lines.append(f"  • Figlio: {m['figlio_id']} - {m['figlio_cod']} - {m['figlio_desc']}{senza_doc}")
                lines.append(f"    Master: {m['master_id']} - {m['master_cod']} - {m['master_desc']} (modulo 2)")
                lines.append(f"    DB: insegnamenti_cds(ins={m['figlio_id']}, master={m['master_id']}, sem={m['semestre']}, ins_esami={m['inserire_esami']})")
                lines.append("")

        # Sezione 3: Insegnamenti in moduli
        lines.append("INSEGNAMENTI IN MODULI")
        lines.append("-" * 80)
        if not moduli:
            lines.append("  Nessuno")
        else:
            for x in moduli:
                num = f"{x['modulo_numero']}" if x['modulo_numero'] else "?"
                senza_doc = " [SENZA DOCENTE]" if x.get('senza_docente') else ""
                lines.append(f"  • {x['tipo'].upper()}: Modulo {num}{senza_doc}")
                lines.append(f"    Modulo: {x['modulo_id']} - {x['modulo_cod']} - {x['modulo_desc']}")
                lines.append(f"    Padre: {x['padre_id']} - {x['padre_cod']} - {x['padre_desc']}")
                lines.append(f"    DB: {x['salvataggio']}")
                lines.append("")

        # Sezione 4: NUOVO - Insegnamenti senza docente
        lines.append("INSEGNAMENTI SENZA DOCENTE ASSEGNATO")
        lines.append("-" * 80)
        if not insegnamenti_senza_docente:
            lines.append("  Nessuno")
        else:
            # Deduplica per ID
            seen = set()
            for ins in insegnamenti_senza_docente:
                if ins['id'] not in seen:
                    lines.append(f"  • {ins['id']} - {ins['codice']} - {ins['titolo']}")
                    lines.append(f"    CdS: {ins['cds']}, Curriculum: {ins['curriculum']}")
                    lines.append("")
                    seen.add(ins['id'])

        lines.append("=" * 80)

        # Ritorna file txt
        content = "\n".join(lines).encode('utf-8')
        filename = f"opla_preview_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        resp = make_response(content)
        resp.headers['Content-Disposition'] = f'attachment; filename={filename}'
        resp.headers['Content-Type'] = 'text/plain; charset=utf-8'
        return resp

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500