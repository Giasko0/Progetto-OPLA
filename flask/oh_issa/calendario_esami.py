from flask import Blueprint, request, jsonify
from db import get_db_connection, release_connection
from psycopg2.extras import DictCursor

calendario_esami_bp = Blueprint('calendario_esami', __name__, url_prefix='/api/oh-issa')

# API per ottenere i dati del calendario esami
@calendario_esami_bp.route('/getCalendarioEsami')
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
           COALESCE(e.data_appello, NULL) as data_appello
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
          'data_appello': row['data_appello']
        })
    
    # Ottieni le sessioni di esame per questo CdS
    cursor.execute("""
      SELECT tipo_sessione, inizio, fine
      FROM sessioni
      WHERE cds = %s AND anno_accademico = %s
      ORDER BY inizio
    """, (cds_code, anno_accademico))
    
    sessioni = cursor.fetchall()
    
    # Prepara le sessioni per il calendario
    sessioni_calendario = {
      'anticipata': {'nome': 'Sessione Anticipata', 'inizio': None, 'fine': None},
      'estiva': {'nome': 'Sessione Estiva', 'inizio': None, 'fine': None},
      'autunnale': {'nome': 'Sessione Autunnale', 'inizio': None, 'fine': None},
      'invernale': {'nome': 'Sessione Invernale', 'inizio': None, 'fine': None}
    }
    
    # Popola le date delle sessioni
    for sessione in sessioni:
      tipo_sessione, inizio, fine = sessione
      if tipo_sessione in sessioni_calendario:
        sessioni_calendario[tipo_sessione]['inizio'] = inizio
        sessioni_calendario[tipo_sessione]['fine'] = fine
    
    # Se non c'è sessione anticipata, cerca quella invernale dell'anno precedente
    if not sessioni_calendario['anticipata']['inizio']:
      cursor.execute("""
        SELECT inizio, fine
        FROM sessioni
        WHERE cds = %s AND anno_accademico = %s AND tipo_sessione = 'invernale'
      """, (cds_code, int(anno_accademico) - 1))
      
      sessione_precedente = cursor.fetchone()
      if sessione_precedente:
        sessioni_calendario['anticipata']['inizio'] = sessione_precedente[0]
        sessioni_calendario['anticipata']['fine'] = sessione_precedente[1]
    
    return jsonify({
      'nome_corso': cds_info['nome_corso'],
      'insegnamenti': insegnamenti,
      'sessioni': sessioni_calendario
    })
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)