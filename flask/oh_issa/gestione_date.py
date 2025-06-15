from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from auth import require_auth
from datetime import datetime, date

gestione_date_bp = Blueprint('gestione_date', __name__, url_prefix='/api/oh-issa')

@gestione_date_bp.route('/save-cds-dates', methods=['POST'])
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
    
    # Elimina tutte le vacanze esistenti per questo CDS e anno accademico
    cursor.execute("""
      DELETE FROM vacanze 
      WHERE cds = %s AND anno_accademico = %s AND curriculum = %s
    """, (codice_cds, anno_accademico, curriculum))
    
    # Estrai i periodi di vacanza
    vacanze = data.get('vacanze', [])
    
    # Inserisci le nuove vacanze
    for vacanza in vacanze:
      descrizione = vacanza.get('descrizione', '').strip()
      inizio = vacanza.get('inizio')
      fine = vacanza.get('fine')
      
      # Validazione vacanza
      if not descrizione:
        return jsonify({'status': 'error', 'message': 'Descrizione vacanza obbligatoria'}), 400
      
      if not inizio or not fine:
        return jsonify({'status': 'error', 'message': f'Date di inizio e fine obbligatorie per: {descrizione}'}), 400
      
      # Verifica che la data di inizio sia precedente alla data di fine
      try:
        data_inizio = datetime.strptime(inizio, '%Y-%m-%d').date()
        data_fine = datetime.strptime(fine, '%Y-%m-%d').date()
        
        if data_inizio > data_fine:
          return jsonify({'status': 'error', 'message': f'Data inizio non può essere successiva alla data fine per: {descrizione}'}), 400
      except ValueError:
        return jsonify({'status': 'error', 'message': f'Formato date non valido per: {descrizione}'}), 400
      
      cursor.execute("""
        INSERT INTO vacanze (cds, anno_accademico, curriculum, descrizione, inizio, fine)
        VALUES (%s, %s, %s, %s, %s, %s)
      """, (codice_cds, anno_accademico, curriculum, descrizione, inizio, fine))
    
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

# API per ottenere i dettagli di un corso di studio (spostata da common.py)
@gestione_date_bp.route('/get-cds-details')
def get_cds_details():
  codice = request.args.get('codice')
  anno = request.args.get('anno')
  
  if not codice:
    return jsonify({'error': 'Codice CdS mancante'}), 400
  
  try:
    conn = get_db_connection()
    cursor = conn.cursor() # Considera cursor_factory=DictCursor se accedi per nome di colonna
    
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
        # Logga l'errore se necessario, ma non interrompere
        print(f"Errore nel recupero della sessione invernale precedente: {e}")
        pass
    
    # Combina i dati del CdS con le sessioni d'esame
    cds_data.update(sessioni_data)
    
    # Query per ottenere le vacanze
    cursor.execute("""
      SELECT descrizione, inizio, fine
      FROM vacanze
      WHERE cds = %s AND anno_accademico = %s
      ORDER BY inizio
    """, (codice, anno_accademico))
    
    vacanze_data = []
    for descrizione, inizio, fine in cursor.fetchall():
      vacanze_data.append({
        'descrizione': descrizione,
        'inizio': inizio.isoformat() if inizio else None,
        'fine': fine.isoformat() if fine else None
      })
    
    # Aggiungi le vacanze ai dati del CdS
    cds_data['vacanze'] = vacanze_data
    
    # Converti le date in stringhe ISO format
    for key, value in cds_data.items():
      if isinstance(value, date): # Controlla se è un oggetto date (datetime è una sottoclasse di date)
        cds_data[key] = value.isoformat()
        
    return jsonify(cds_data)
    
  except Exception as e:
    import traceback
    print(traceback.format_exc()) # Utile per il debug
    return jsonify({'error': str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)