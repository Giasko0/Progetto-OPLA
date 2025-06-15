from flask import Blueprint, request, jsonify
from db import get_db_connection, release_connection
from datetime import datetime

common_bp = Blueprint('common', __name__, url_prefix='/api/oh-issa')

# API per ottenere i corsi di studio filtrati per un anno accademico specifico
@common_bp.route('/get-cds-by-anno')
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
