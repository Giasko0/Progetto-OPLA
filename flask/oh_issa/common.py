from flask import Blueprint, request, jsonify
from db import get_db_connection, release_connection
from datetime import datetime

common_bp = Blueprint('common', __name__, url_prefix='/api/oh-issa')

# Nuova API per ottenere l'elenco dei corsi di studio senza duplicati (per il calendario)
@common_bp.route('/getCdSDistinct')
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
@common_bp.route('/getCdSByAnno')
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

# API per ottenere i dettagli di un corso di studio
@common_bp.route('/getCdsDetails')
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