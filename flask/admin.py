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
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if 'admin' not in request.cookies:
      return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401

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
    
    # Funzione per estrarre tutti i codici di insegnamenti mutuati
    def estrai_tutti_codici_insegnamenti_mutuati(text):
      if not text:
        return []
      # Estraiamo tutti i possibili codici di insegnamento (formato AXXXXXX)
      matches = re.findall(r'(?:Af\s+)?([A-Z][0-9]{6})', str(text), re.IGNORECASE)
      return matches
    
    # Dizionario per mappare codici insegnamento ai loro ID
    codice_to_id = {}
    
    # Strutture dati per la gestione dei moduli
    moduli_per_padre = {}  # {codice_padre: {codice_modulo: {'id': id_numerico, 'docenti': set(docenti), 'num_modulo': numero}}}
    padri_moduli = {}      # Mappatura inversa {codice_modulo: codice_padre}
    
    # Prima fase: raccogliamo informazioni di base
    for row_idx in range(1, sheet.nrows):
      try:
        cod_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['cod_insegnamento'])).strip()
        id_insegnamento_raw = sheet.cell_value(row_idx, colonna_indices['id_insegnamento'])
        id_insegnamento = str(id_insegnamento_raw).replace('.0', '') if id_insegnamento_raw else ""
        cod_unita_didattica = str(sheet.cell_value(row_idx, colonna_indices['cod_unita_didattica'])).strip()
        id_unita_didattica_raw = sheet.cell_value(row_idx, colonna_indices['id_unita_didattica'])
        id_unita_didattica = str(id_unita_didattica_raw).replace('.0', '') if id_unita_didattica_raw else ""
        username_docente = str(sheet.cell_value(row_idx, colonna_indices['username_docente'])).strip()
        
        # Mappatura codice -> id
        if cod_insegnamento and id_insegnamento:
            codice_to_id[cod_insegnamento] = id_insegnamento
        
        if cod_unita_didattica and id_unita_didattica:
            codice_to_id[cod_unita_didattica] = id_unita_didattica
        
        # Raccogliamo informazioni sulle relazioni moduli-padre
        if cod_unita_didattica and cod_insegnamento:
            # Mappatura inversa: modulo -> padre
            padri_moduli[cod_unita_didattica] = cod_insegnamento
            
            # Inizializza la struttura per il padre se non esiste
            if cod_insegnamento not in moduli_per_padre:
                moduli_per_padre[cod_insegnamento] = {}
            
            # Inizializza la struttura per il modulo se non esiste
            if cod_unita_didattica not in moduli_per_padre[cod_insegnamento]:
                # Converti l'ID in float per confronto numerico (per ordinare i moduli)
                try:
                    id_numerico = float(id_unita_didattica) if id_unita_didattica else 0
                except (ValueError, TypeError):
                    id_numerico = 0
                    
                moduli_per_padre[cod_insegnamento][cod_unita_didattica] = {
                    'id': id_numerico,
                    'docenti': set(),
                    'num_modulo': None  # Sarà assegnato nella fase successiva
                }
            
            # Registra il docente per questo modulo se presente
            if username_docente:
                moduli_per_padre[cod_insegnamento][cod_unita_didattica]['docenti'].add(username_docente)
            
      except Exception as e:
        print(f"Errore nell'analisi preliminare della riga {row_idx}: {str(e)}")
    
    # Seconda fase: assegna numeri modulo in base all'ID (il maggiore è modulo 2)
    for cod_padre, moduli in moduli_per_padre.items():
        if len(moduli) > 1:
            # Ordina i moduli per ID numerico
            moduli_ordinati = sorted(moduli.items(), key=lambda x: x[1]['id'])
            
            # Assegna i numeri modulo (1, 2, 3, ...)
            for i, (cod_modulo, _) in enumerate(moduli_ordinati, 1):
                moduli_per_padre[cod_padre][cod_modulo]['num_modulo'] = i
                print(f"Modulo {cod_modulo} è il modulo {i} dell'insegnamento {cod_padre}")
        else:
            # Se c'è un solo modulo, assegniamo 1
            for cod_modulo in moduli:
                moduli_per_padre[cod_padre][cod_modulo]['num_modulo'] = 1
    
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
        cod_unita_didattica = str(sheet.cell_value(row_idx, colonna_indices['cod_unita_didattica'])).strip()
        id_unita_didattica_raw = sheet.cell_value(row_idx, colonna_indices['id_unita_didattica'])
        id_unita_didattica = str(id_unita_didattica_raw).replace('.0', '') if id_unita_didattica_raw else ""
        
        # Verifica che almeno un codice sia presente
        if not cod_insegnamento and not cod_unita_didattica:
          continue
        
        des_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['des_insegnamento'])).strip()
        des_unita_didattica = str(sheet.cell_value(row_idx, colonna_indices['des_unita_didattica'])).strip()
        
        # Estrai periodo/semestre
        des_periodo = ""
        if cod_unita_didattica:
            des_periodo_raw = sheet.cell_value(row_idx, colonna_indices['des_periodo_unita_didattica'])
        else:
            des_periodo_raw = sheet.cell_value(row_idx, colonna_indices['des_periodo_insegnamento'])
        des_periodo = str(des_periodo_raw).strip() if des_periodo_raw else ""
        semestre = periodo_to_semestre.get(des_periodo, default_semestre)
        
        # Estrai dati docente
        matricola_docente = str(sheet.cell_value(row_idx, colonna_indices['matricola_docente'])).strip()
        cognome_docente = str(sheet.cell_value(row_idx, colonna_indices['cognome_docente'])).strip()
        nome_docente = str(sheet.cell_value(row_idx, colonna_indices['nome_docente'])).strip()
        
        # Variabili per tenere traccia delle caratteristiche dell'insegnamento
        is_mutuato = False
        is_modulo = False
        padri_mutua = []
        padre_modulo = None
        codice_modulo = None
        
        # Determina se è un insegnamento mutuato (colonna BL o CW)
        des_raggruppamento_insegnamento = str(sheet.cell_value(row_idx, colonna_indices['des_raggruppamento_insegnamento'])).strip()
        des_raggruppamento_unita_didattica = str(sheet.cell_value(row_idx, colonna_indices['des_raggruppamento_unita_didattica'])).strip()
        
        # Funzione per gestire insegnamenti mutuati
        def gestisci_mutuato():
          nonlocal is_mutuato, padri_mutua
          
          is_mutuato = True
          
          # Estrai i codici mutuati dal testo
          codici_trovati = []
          if "MUTUAT" in des_raggruppamento_insegnamento.upper():
            codici_trovati = estrai_tutti_codici_insegnamenti_mutuati(des_raggruppamento_insegnamento)
          elif "MUTUAT" in des_raggruppamento_unita_didattica.upper():
            codici_trovati = estrai_tutti_codici_insegnamenti_mutuati(des_raggruppamento_unita_didattica)
          
          if codici_trovati:
            # Verifica se i codici trovati sono moduli dello stesso insegnamento
            padri = set()
            codici_moduli = []
            
            for codice in codici_trovati:
              # Verifica se il codice è un modulo
              if codice in padri_moduli:
                padri.add(padri_moduli[codice])
                codici_moduli.append(codice)
            
            # Se abbiamo trovato moduli dello stesso padre
            if len(padri) == 1 and codici_moduli:
              # Il padre della mutuazione è il padre comune dei moduli
              padre_comune = padri.pop()
              padri_mutua = [padre_comune]
              print(f"Insegnamento mutuato {cod_insegnamento} ha come padre {padre_comune} (comune a moduli {', '.join(codici_moduli)})")
            elif codici_trovati:
              # Salvare tutti i codici trovati come padri mutuati
              padri_mutua = codici_trovati
              print(f"Insegnamento mutuato {cod_insegnamento} ha come padri: {', '.join(padri_mutua)}")

        # Funzione per gestire moduli
        def gestisci_modulo():
          nonlocal is_modulo, padre_modulo, codice_modulo, id_effettivo, codice_effettivo, descrizione_effettiva
          
          is_modulo = True
          padre_modulo = cod_insegnamento  # Il codice dell'insegnamento padre
          
          # Verifica se esiste un padre per questo modulo
          if cod_insegnamento in moduli_per_padre and cod_unita_didattica in moduli_per_padre[cod_insegnamento]:
              modulo_info = moduli_per_padre[cod_insegnamento][cod_unita_didattica]
              codice_modulo = modulo_info['num_modulo']
              
              # Imposta i dati identificativi del modulo
              id_effettivo = id_unita_didattica
              codice_effettivo = cod_unita_didattica
              if des_unita_didattica:
                  descrizione_effettiva = f"{des_insegnamento} - {des_unita_didattica}"
              else:
                  descrizione_effettiva = des_insegnamento
              
              # Gestisci l'insegnamento padre se il docente insegna tutti i moduli
              gestisci_insegnamento_padre_per_docente()
          else:
              # Caso normale per modulo senza informazioni aggiuntive
              id_effettivo = id_unita_didattica
              codice_effettivo = cod_unita_didattica
              if des_unita_didattica:
                  descrizione_effettiva = f"{des_insegnamento} - {des_unita_didattica}"
              else:
                  descrizione_effettiva = des_insegnamento
        
        # Funzione per gestire l'insegnamento padre quando il docente insegna tutti i moduli
        def gestisci_insegnamento_padre_per_docente():
          nonlocal insegnamenti_data, insegnamenti_set, insegnamenti_cds_data, insegnamento_docente_data, insegnamento_docente_set
          
          # Verifica se il docente insegna tutti i moduli del padre
          tutti_moduli = moduli_per_padre[cod_insegnamento]
          if len(tutti_moduli) > 1:  # Ci sono almeno 2 moduli
              # Raccogli tutti i moduli del padre
              tutti_codici_moduli = set(tutti_moduli.keys())
              
              # Raccogli tutti i moduli che insegna questo docente
              moduli_di_questo_docente = {cod_mod for cod_mod, info in tutti_moduli.items() 
                                        if username_docente in info['docenti']}
              
              # Se il docente insegna tutti i moduli, aggiungi ANCHE l'insegnamento padre
              if len(moduli_di_questo_docente) == len(tutti_codici_moduli):
                  print(f"Docente {username_docente} insegna tutti i moduli di {cod_insegnamento}: registrando sia moduli che insegnamento padre")
                  
                  # Aggiungi insegnamento padre se non già presente
                  if id_insegnamento not in insegnamenti_set:
                      insegnamenti_data.append((id_insegnamento, cod_insegnamento, des_insegnamento))
                      insegnamenti_set.add(id_insegnamento)
                  
                  # Aggiungi insegnamento_cds per il padre se non già presente
                  insegnamenti_cds_key_padre = (id_insegnamento, anno_accademico, cod_cds, des_curriculum)
                  if insegnamenti_cds_key_padre not in cds_set:
                      # Determina se l'insegnamento padre è mutuato
                      padre_is_mutuato = is_mutuato  # Eredita lo stato mutuato
                      padre_padri_mutua = padri_mutua  # Eredita i padri mutuati
                      
                      insegnamenti_cds_data.append((
                          id_insegnamento, 
                          anno_accademico, 
                          cod_cds, 
                          des_curriculum,
                          anno_corso, 
                          semestre, 
                          padre_is_mutuato,
                          False,  # Il padre non è un modulo
                          padre_padri_mutua,  # Può ereditare i padri mutuati
                          None,   # Non ha padre modulo
                          None    # Non ha codice modulo
                      ))
                  
                  # Aggiungi insegnamento_docente per il padre
                  insegnamento_docente_key_padre = (id_insegnamento, username_docente, anno_accademico)
                  if insegnamento_docente_key_padre not in insegnamento_docente_set:
                      insegnamento_docente_data.append((id_insegnamento, username_docente, anno_accademico))
                      insegnamento_docente_set.add(insegnamento_docente_key_padre)
        
        # Verifica se è un insegnamento mutuato
        if "MUTUAT" in des_raggruppamento_insegnamento.upper() or "MUTUAT" in des_raggruppamento_unita_didattica.upper():
          gestisci_mutuato()
        
        # Determina se è un modulo e gestisci l'assegnazione appropriata
        if cod_unita_didattica:
            # È un modulo
            gestisci_modulo()
        else:
            # È un insegnamento normale (non modulo)
            id_effettivo = id_insegnamento
            codice_effettivo = cod_insegnamento
            descrizione_effettiva = des_insegnamento
        
        # Aggiungi CdS se non già presente
        cds_key = (cod_cds, anno_accademico, des_curriculum)
        if cds_key not in cds_set:
          cds_data.append((cod_cds, anno_accademico, des_cds, des_curriculum))
          cds_set.add(cds_key)
        
        # Aggiungi insegnamento se non già presente
        if id_effettivo not in insegnamenti_set:
          insegnamenti_data.append((id_effettivo, codice_effettivo, descrizione_effettiva))
          insegnamenti_set.add(id_effettivo)
        
        # Aggiungi insegnamento padre se necessario
        if padre_modulo and padre_modulo in codice_to_id:
          padre_id = codice_to_id[padre_modulo]
          if padre_id not in insegnamenti_set:
            insegnamenti_data.append((padre_id, padre_modulo, des_insegnamento))
            insegnamenti_set.add(padre_id)
        
        # Aggiungi insegnamento_cds se non già presente
        insegnamenti_cds_key = (id_effettivo, anno_accademico, cod_cds, des_curriculum)
        if insegnamenti_cds_key not in cds_set:
          insegnamenti_cds_data.append((
            id_effettivo, 
            anno_accademico, 
            cod_cds, 
            des_curriculum,
            anno_corso, 
            semestre, 
            is_mutuato,
            is_modulo,
            padri_mutua,
            padre_modulo,
            codice_modulo
          ))
        
        # Aggiungi utente se not already present
        if username_docente not in utenti_set:
          utenti_data.append((username_docente, matricola_docente, nome_docente, cognome_docente, True, False))
          utenti_set.add(username_docente)
        
        # Aggiungi insegnamento_docente
        insegnamento_docente_key = (id_effettivo, username_docente, anno_accademico)
        if insegnamento_docente_key not in insegnamento_docente_set:
          insegnamento_docente_data.append((id_effettivo, username_docente, anno_accademico))
          insegnamento_docente_set.add(insegnamento_docente_key)
      except Exception as e:
        print(f"Errore nell'elaborazione della riga {row_idx}: {str(e)}")
    
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
        print(f"Errore nell'inserimento CDS {item}: {str(e)}")
    
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
        print(f"Errore nell'inserimento insegnamento {item}: {str(e)}")
    
    # 3. Insegnamenti_cds
    for item in insegnamenti_cds_data:
      try:
        cursor.execute("""
          INSERT INTO insegnamenti_cds 
          (insegnamento, anno_accademico, cds, curriculum, anno_corso, semestre, is_mutuato, is_modulo, padri_mutua, padre_modulo, codice_modulo)
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
          ON CONFLICT (insegnamento, anno_accademico, cds, curriculum) DO UPDATE 
          SET anno_corso = EXCLUDED.anno_corso,
              semestre = EXCLUDED.semestre,
              is_mutuato = EXCLUDED.is_mutuato,
              is_modulo = EXCLUDED.is_modulo,
              padri_mutua = EXCLUDED.padri_mutua,
              padre_modulo = EXCLUDED.padre_modulo,
              codice_modulo = EXCLUDED.codice_modulo
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
