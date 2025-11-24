from flask import Blueprint, request, jsonify, session
from db import get_db_connection, release_connection
from psycopg2.extras import DictCursor
import logging

controllo_esami_minimi_bp = Blueprint('controllo_esami_minimi', __name__, url_prefix='/api/oh-issa')

@controllo_esami_minimi_bp.route('/get-docenti-by-anno')
def get_docenti_by_anno():
    """Ottiene tutti i docenti che insegnano in un anno accademico"""
    if not session.get('permessi_admin'):
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
    anno = request.args.get('anno')
    if not anno:
        return jsonify({'error': 'Anno accademico non specificato'}), 400
    
    try:
        anno = int(anno)
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        cursor.execute("""
            SELECT DISTINCT u.username, u.nome, u.cognome, u.matricola
            FROM utenti u
            JOIN insegnamento_docente id ON u.username = id.docente
            WHERE id.annoaccademico = %s
            ORDER BY u.cognome, u.nome
        """, (anno,))
        
        docenti = []
        for row in cursor.fetchall():
            docenti.append({
                'username': row['username'],
                'nome': row['nome'],
                'cognome': row['cognome'],
                'matricola': row['matricola']
            })
        
        return jsonify(docenti)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@controllo_esami_minimi_bp.route('/controlla-esami-minimi')
def controlla_esami_minimi():
    """Controlla il numero di esami per ogni insegnamento"""
    if not session.get('permessi_admin'):
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 401
    
    anno = request.args.get('anno')
    cds_filter = request.args.get('cds')
    docente_filter = request.args.get('docente')
    
    if not anno:
        return jsonify({'error': 'Anno accademico non specificato'}), 400
    
    try:
        anno = int(anno)
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        # Ottieni il target di esami dalle configurazioni globali
        cursor.execute("""
            SELECT COALESCE(target_esami_default, 8) as target_esami
            FROM configurazioni_globali 
            WHERE anno_accademico = %s
        """, (anno,))
        
        target_result = cursor.fetchone()
        target_esami = target_result['target_esami']
        
        # Ottieni le sessioni per l'anno accademico
        cursor.execute("""
            SELECT tipo_sessione, MIN(inizio) as inizio, MAX(fine) as fine
            FROM sessioni
            WHERE anno_accademico = %s
            GROUP BY tipo_sessione
            ORDER BY 
                CASE tipo_sessione 
                    WHEN 'anticipata' THEN 1
                    WHEN 'estiva' THEN 2 
                    WHEN 'autunnale' THEN 3
                    WHEN 'invernale' THEN 4
                END
        """, (anno,))
        
        sessioni = cursor.fetchall()

        # Ottieni le regole specifiche per CdS/Curriculum
        cursor.execute("""
            SELECT cds, curriculum_codice, tipo_sessione, 
                   COALESCE(esami_primo_semestre, 0) as min_1, 
                   COALESCE(esami_secondo_semestre, 0) as min_2
            FROM sessioni
            WHERE anno_accademico = %s
        """, (anno,))
        rules_rows = cursor.fetchall()
        
        # Mappa: (cds, curriculum) -> { tipo_sessione: { 1: min1, 2: min2 } }
        rules_map = {}
        for r in rules_rows:
            key = (r['cds'], r['curriculum_codice'])
            if key not in rules_map:
                rules_map[key] = {}
            rules_map[key][r['tipo_sessione']] = { 1: r['min_1'], 2: r['min_2'] }
        
        # Query base per ottenere tutti gli insegnamenti dell'anno con conteggio esami per sessione
        base_query = """
            SELECT 
                i.id as insegnamento_id,
                i.codice as insegnamento_codice,
                i.titolo as insegnamento_titolo,
                ic.cds as cds_codice,
                c.nome_corso as cds_nome,
                ic.curriculum_codice,
                ic.anno_corso,
                ic.semestre,
                COUNT(CASE WHEN e.mostra_nel_calendario = TRUE THEN e.id END) as numero_esami,
                u.username as docente_username,
                u.nome as docente_nome,
                u.cognome as docente_cognome
        """
        
        # Aggiungi conteggio per ogni sessione
        for sessione in sessioni:
            tipo = sessione['tipo_sessione']
            base_query += f""",
                COUNT(CASE 
                    WHEN e.mostra_nel_calendario = TRUE 
                    AND e.data_appello BETWEEN %s AND %s
                    THEN e.id 
                END) as esami_{tipo}
            """
        
        base_query += """
            FROM insegnamenti i
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum_codice = c.curriculum_codice
            LEFT JOIN insegnamento_docente id ON i.id = id.insegnamento AND id.annoaccademico = %s
            LEFT JOIN utenti u ON id.docente = u.username
            LEFT JOIN esami e ON i.id = e.insegnamento AND e.anno_accademico = %s AND e.cds = ic.cds AND e.curriculum_codice = ic.curriculum_codice
            WHERE ic.anno_accademico = %s
            AND ic.inserire_esami = TRUE
        """
        
        # Prepara i parametri includendo le date delle sessioni
        params = []
        for sessione in sessioni:
            params.extend([sessione['inizio'], sessione['fine']])
        params.extend([anno, anno, anno])
        
        # Aggiungi filtri se specificati
        if cds_filter:
            base_query += " AND ic.cds = %s"
            params.append(cds_filter)
        
        if docente_filter:
            base_query += " AND u.username = %s"
            params.append(docente_filter)
        
        base_query += """
            GROUP BY i.id, i.codice, i.titolo, ic.cds, c.nome_corso, ic.curriculum_codice, 
                     ic.anno_corso, ic.semestre, u.username, u.nome, u.cognome
            ORDER BY ic.cds, i.titolo, u.cognome, u.nome
        """
        
        cursor.execute(base_query, params)
        rows = cursor.fetchall()
        
        # Raggruppa i risultati per insegnamento
        insegnamenti_dict = {}
        
        for row in rows:
            ins_key = f"{row['insegnamento_id']}_{row['cds_codice']}_{row['curriculum_codice']}"
            
            if ins_key not in insegnamenti_dict:
                esami_per_sessione = {}
                for sessione in sessioni:
                    tipo = sessione['tipo_sessione']
                    esami_per_sessione[tipo] = row[f'esami_{tipo}']
                
                # Calcola target e requisiti specifici
                cds_key = (row['cds_codice'], row['curriculum_codice'])
                semestre = row['semestre']
                session_reqs = {}
                
                if cds_key in rules_map:
                    for tipo, mins in rules_map[cds_key].items():
                        req = 0
                        if semestre == 1: req = mins[1]
                        elif semestre == 2: req = mins[2]
                        elif semestre == 3: req = max(mins[1], mins[2])
                        
                        session_reqs[tipo] = req
                
                insegnamenti_dict[ins_key] = {
                    'id': row['insegnamento_id'],
                    'codice': row['insegnamento_codice'],
                    'titolo': row['insegnamento_titolo'],
                    'cds_codice': row['cds_codice'],
                    'cds_nome': row['cds_nome'],
                    'curriculum_codice': row['curriculum_codice'],
                    'anno_corso': row['anno_corso'],
                    'semestre': row['semestre'],
                    'numero_esami': row['numero_esami'],
                    'esami_per_sessione': esami_per_sessione,
                    'target_esami': target_esami,
                    'session_requirements': session_reqs,
                    'docenti': []
                }
            
            # Aggiungi il docente se presente e non già aggiunto
            if row['docente_username']:
                docente = {
                    'username': row['docente_username'],
                    'nome': row['docente_nome'],
                    'cognome': row['docente_cognome']
                }
                
                # Verifica che il docente non sia già presente
                if not any(d['username'] == docente['username'] for d in insegnamenti_dict[ins_key]['docenti']):
                    insegnamenti_dict[ins_key]['docenti'].append(docente)
        
        # Converte in lista
        insegnamenti = list(insegnamenti_dict.values())
        
        # Statistiche
        total = len(insegnamenti)
        conformi = len([ins for ins in insegnamenti if ins['numero_esami'] >= ins['target_esami']])
        non_conformi = total - conformi
        
        result = {
            'anno_accademico': anno,
            'cds_filter': cds_filter,
            'docente_filter': docente_filter,
            'target_esami_default': target_esami,
            'sessioni': [{
                'tipo': s['tipo_sessione'], 
                'inizio': s['inizio'].isoformat(), 
                'fine': s['fine'].isoformat()
            } for s in sessioni],
            'statistiche': {
                'totale_insegnamenti': total,
                'conformi': conformi,
                'non_conformi': non_conformi,
                'percentuale_conformi': round(conformi / total * 100, 1) if total > 0 else 0
            },
            'insegnamenti': insegnamenti
        }
        
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"Errore nel controllo esami minimi: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)