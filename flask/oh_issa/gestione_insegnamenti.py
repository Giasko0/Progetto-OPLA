from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from psycopg2.extras import DictCursor
from auth import require_auth

gestione_insegnamenti_bp = Blueprint('gestione_insegnamenti', __name__, url_prefix='/api/oh-issa')

@gestione_insegnamenti_bp.route('/get-insegnamenti-per-anno')
def get_insegnamenti_per_anno():
    if not session.get('permessi_admin'):
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
    anno = request.args.get('anno')
    if not anno:
        return jsonify({'error': 'Anno accademico non specificato'}), 400
    
    try:
        anno = int(anno)
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        # Query per ottenere tutti gli insegnamenti dell'anno raggruppati per CdS
        cursor.execute("""
            SELECT 
                c.codice as cds_codice,
                c.nome_corso,
                c.curriculum_codice,
                c.curriculum_nome,
                i.id as insegnamento_id,
                i.codice as insegnamento_codice,
                i.titolo as insegnamento_titolo,
                ic.anno_corso,
                ic.semestre,
                u.username as docente_username,
                u.nome as docente_nome,
                u.cognome as docente_cognome,
                u.matricola as docente_matricola
            FROM cds c
            JOIN insegnamenti_cds ic ON c.codice = ic.cds 
                AND c.anno_accademico = ic.anno_accademico 
                AND c.curriculum_codice = ic.curriculum_codice
            JOIN insegnamenti i ON ic.insegnamento = i.id
            LEFT JOIN insegnamento_docente id ON i.id = id.insegnamento 
                AND id.annoaccademico = %s
            LEFT JOIN utenti u ON id.docente = u.username
            WHERE c.anno_accademico = %s
            ORDER BY c.codice, c.nome_corso, i.titolo, u.cognome, u.nome
        """, (anno, anno))
        
        rows = cursor.fetchall()
        
        # Raggruppa i dati per CdS e insegnamenti
        cds_dict = {}
        
        for row in rows:
            cds_codice = row['cds_codice']
            curriculum_codice = row['curriculum_codice']
            insegnamento_id = row['insegnamento_id']
            cds_key = f"{cds_codice}_{curriculum_codice}"
            
            # Inizializza il CdS se non esiste
            if cds_key not in cds_dict:
                cds_dict[cds_key] = {
                    'codice': cds_codice,
                    'nome_corso': row['nome_corso'],
                    'curriculum_codice': curriculum_codice,
                    'curriculum_nome': row['curriculum_nome'],
                    'insegnamenti': {}
                }
            
            # Inizializza l'insegnamento se non esiste
            if insegnamento_id not in cds_dict[cds_key]['insegnamenti']:
                cds_dict[cds_key]['insegnamenti'][insegnamento_id] = {
                    'id': insegnamento_id,
                    'codice': row['insegnamento_codice'],
                    'titolo': row['insegnamento_titolo'],
                    'anno_corso': row['anno_corso'],
                    'semestre': row['semestre'],
                    'curriculum_codice': row['curriculum_codice'],
                    'docenti': []
                }
            
            # Aggiungi il docente se presente e non già aggiunto
            if row['docente_username']:
                docente = {
                    'username': row['docente_username'],
                    'nome': row['docente_nome'],
                    'cognome': row['docente_cognome'],
                    'matricola': row['docente_matricola']
                }
                
                # Verifica che il docente non sia già presente
                insegnamento = cds_dict[cds_key]['insegnamenti'][insegnamento_id]
                if not any(d['username'] == docente['username'] for d in insegnamento['docenti']):
                    insegnamento['docenti'].append(docente)
        
        # Converte la struttura dati in lista
        result = []
        for cds_data in cds_dict.values():
            # Converte gli insegnamenti da dict a lista
            insegnamenti_list = list(cds_data['insegnamenti'].values())
            
            # Ordina gli insegnamenti per titolo
            insegnamenti_list.sort(key=lambda x: x['titolo'])
            
            result.append({
                'codice': cds_data['codice'],
                'nome_corso': cds_data['nome_corso'],
                'curriculum_codice': cds_data['curriculum_codice'],
                'curriculum_nome': cds_data['curriculum_nome'],
                'insegnamenti': insegnamenti_list
            })
        
        # Ordina i CdS per codice
        result.sort(key=lambda x: (x['codice'], x['curriculum_codice']))
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)
