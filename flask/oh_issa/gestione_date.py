from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from auth import require_auth

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