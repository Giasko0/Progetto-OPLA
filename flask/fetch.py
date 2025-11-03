from flask import Blueprint, request, jsonify
from db import get_db_connection, release_connection
from datetime import datetime
from auth import get_user_data
from psycopg2.extras import DictCursor
from utils.sessions import (ottieni_intersezione_sessioni_docente, ottieni_sessioni_da_insegnamenti, ottieni_vacanze, escludi_vacanze_da_sessioni)

fetch_bp = Blueprint('fetch', __name__)

def ottieni_insegnamenti_docente(docente, anno_accademico):
    """Ottiene gli insegnamenti di un docente per un anno accademico"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT DISTINCT i.id, i.codice, i.titolo
            FROM insegnamenti i
            JOIN insegnamento_docente id ON i.id = id.insegnamento
            WHERE id.annoaccademico = %s AND id.docente = %s
            ORDER BY i.codice
        """, (anno_accademico, docente))
        
        return {row[0]: {'codice': row[1], 'titolo': row[2]} for row in cursor.fetchall()}
        
    except Exception as e:
        print(f"Errore nell'ottenere gli insegnamenti del docente: {str(e)}")
        return {}
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/get-aule', methods=['GET'])
def get_aule():
    data = request.args.get('data')
    periodo = request.args.get('periodo')
    
    try:
        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        
        docente = user_data['user_data']['username']
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT nome, posti FROM aule ORDER BY nome")
        tutte_aule = [(row[0], row[1]) for row in cursor.fetchall()]
        
        if data and periodo is not None:
            # Definisci le fasce orarie
            if periodo == '0':  # Mattina
                inizio_fascia = '08:30:00'
                fine_fascia = '13:30:00'
            else:  # Pomeriggio
                inizio_fascia = '14:00:00'
                fine_fascia = '19:00:00'
            
            # Recupera aule occupate da esami nel DB locale, escludendo quelle del docente stesso
            cursor.execute("""
                SELECT DISTINCT e.aula FROM esami e
                WHERE e.data_appello = %s AND e.periodo = %s AND e.aula IS NOT NULL AND e.docente != %s
            """, (data, periodo, docente))
            
            aule_occupate_db = {row[0] for row in cursor.fetchall()}
            
            # Controlla disponibilità tramite API EasyAcademy
            aule_occupate_ea = set()
            try:
                # Converti data da YYYY-MM-DD a DD-MM-YYYY per EasyAcademy
                data_parti = data.split('-')
                data_ea_format = f"{data_parti[2]}-{data_parti[1]}-{data_parti[0]}"
                
                url = f'https://easyacademy.unipg.it/agendaweb/rooms_call.php?sede=P02E04&date={data_ea_format}'
                response = requests.get(url, timeout=5)
                
                if response.ok:
                    data_ea = response.json()
                    if 'table' in data_ea:
                        for aula_code, aula_data in data_ea['table'].items():
                            for slot in aula_data:
                                if isinstance(slot, dict) and 'from' in slot and 'to' in slot and 'NomeAula' in slot:
                                    ora_inizio = slot['from']
                                    ora_fine = slot['to']
                                    nome_aula = slot['NomeAula']
                                    
                                    # Verifica sovrapposizione con la fascia oraria richiesta
                                    if ((ora_inizio <= fine_fascia and ora_fine >= inizio_fascia) or 
                                        (ora_inizio >= inizio_fascia and ora_inizio <= fine_fascia) or 
                                        (ora_fine >= inizio_fascia and ora_fine <= fine_fascia)):
                                        aule_occupate_ea.add(nome_aula)
            except Exception as req_error:
                print(f"Errore nella richiesta a EasyAcademy: {str(req_error)}")
            
            # Combina le aule occupate da entrambe le fonti
            aule_occupate = aule_occupate_db.union(aule_occupate_ea)
            
            # Filtra le aule disponibili
            aule_disponibili = [(aula[0], aula[1]) for aula in tutte_aule if aula[0] not in aule_occupate]
            aule = [{"nome": nome_aula, "posti": posti} for nome_aula, posti in aule_disponibili]
        else:
            aule = [{"nome": row[0], "posti": row[1]} for row in tutte_aule]
        
        return jsonify(aule)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/get-esami', methods=['GET'])
def get_esami():
    try:
        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        
        is_admin_user = user_data['user_data']['permessi_admin']
        current_user = user_data['user_data']['username']
        docente = request.args.get('docente')
        insegnamenti = request.args.get('insegnamenti')
        anno = int(request.args.get('anno'))
        
        if not docente or not anno:
            return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400

        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        # Ottieni gli insegnamenti del docente autenticato per identificare le codocenze
        insegnamenti_docente_autenticato = set()
        if not is_admin_user:
            cursor.execute("""
                SELECT DISTINCT insegnamento
                FROM insegnamento_docente
                WHERE docente = %s AND annoaccademico = %s
            """, (current_user, anno))
            insegnamenti_docente_autenticato = {row[0] for row in cursor.fetchall()}
        
        # Costruisci la lista degli insegnamenti autorizzati
        insegnamenti_autorizzati = []
        insegnamenti_selezionati = []
        
        if is_admin_user:
            # Admin può vedere tutti gli esami
            if insegnamenti:
                # Se specificati insegnamenti, trova quelli correlati
                insegnamenti_selezionati = insegnamenti.split(',')
                
                # Prima ottieni i semestri degli insegnamenti selezionati
                cursor.execute("""
                    SELECT DISTINCT ic1.insegnamento, ic1.semestre
                    FROM insegnamenti_cds ic1
                    WHERE ic1.insegnamento = ANY(%s) AND ic1.anno_accademico = %s
                """, (insegnamenti_selezionati, anno))
                insegnamenti_con_semestre = {row[0]: row[1] for row in cursor.fetchall()}
                
                # Per ogni insegnamento selezionato, trova quelli correlati considerando gli annuali
                for ins_id, semestre in insegnamenti_con_semestre.items():
                    if semestre == 3:  # Annuale
                        # Gli annuali si correlano con: annuali, 1° sem e 2° sem
                        semestre_condition = "ic2.semestre IN (1, 2, 3)"
                    else:  # 1° o 2° semestre
                        # I semestrali si correlano con: stesso semestre + annuali
                        semestre_condition = f"ic2.semestre IN ({semestre}, 3)"
                    
                    cursor.execute(f"""
                        SELECT DISTINCT i2.id
                        FROM insegnamenti_cds ic1
                        JOIN insegnamenti_cds ic2 ON ic1.cds = ic2.cds 
                            AND ic1.anno_corso = ic2.anno_corso 
                            AND ic1.anno_accademico = ic2.anno_accademico
                        JOIN insegnamenti i2 ON ic2.insegnamento = i2.id
                        WHERE ic1.insegnamento = %s 
                        AND ic1.anno_accademico = %s
                        AND ({semestre_condition})
                    """, (ins_id, anno))
                    
                    insegnamenti_autorizzati.extend([row[0] for row in cursor.fetchall()])
                insegnamenti_autorizzati = list(set(insegnamenti_autorizzati))
            else:
                insegnamenti_autorizzati = []
                insegnamenti_selezionati = []
        else:
            # Non admin: ottieni insegnamenti del docente
            insegnamenti_docente = ottieni_insegnamenti_docente(docente, anno)
            if not insegnamenti_docente:
                return jsonify([])
            
            # SEMPRE includi tutti gli insegnamenti del docente come base
            insegnamenti_autorizzati = list(insegnamenti_docente.keys())
            # Per non-admin, i suoi insegnamenti sono SEMPRE "selezionati" (blu)
            insegnamenti_selezionati = insegnamenti_autorizzati.copy()
            
            if insegnamenti:
                # Se specificati insegnamenti, aggiungi quelli correlati ai selezionati
                insegnamenti_selezionati = [ins for ins in insegnamenti_autorizzati if ins in insegnamenti.split(',')]
                if insegnamenti_selezionati:
                    cursor.execute("""
                        SELECT DISTINCT insegnamento, semestre
                        FROM insegnamenti_cds
                        WHERE insegnamento = ANY(%s) AND anno_accademico = %s
                    """, (insegnamenti_selezionati, anno))
                    insegnamenti_sel_con_semestre = {row[0]: row[1] for row in cursor.fetchall()}
                    
                    # Per ogni insegnamento selezionato, trova quelli correlati
                    for ins_id, semestre in insegnamenti_sel_con_semestre.items():
                        if semestre == 3:  # Annuale
                            # Gli annuali si correlano con: annuali, 1° sem e 2° sem
                            semestre_condition = "ic2.semestre IN (1, 2, 3)"
                        else:  # 1° o 2° semestre
                            # I semestrali si correlano con: stesso semestre + annuali
                            semestre_condition = f"ic2.semestre IN ({semestre}, 3)"
                        
                        cursor.execute(f"""
                            SELECT DISTINCT i2.id
                            FROM insegnamenti_cds ic1
                            JOIN insegnamenti_cds ic2 ON ic1.cds = ic2.cds 
                                AND ic1.anno_corso = ic2.anno_corso 
                                AND ic1.anno_accademico = ic2.anno_accademico
                            JOIN insegnamenti i2 ON ic2.insegnamento = i2.id
                            WHERE ic1.insegnamento = %s 
                            AND ic1.anno_accademico = %s
                            AND ({semestre_condition})
                        """, (ins_id, anno))
                        
                        insegnamenti_correlati = [row[0] for row in cursor.fetchall()]
                        insegnamenti_autorizzati.extend(insegnamenti_correlati)
                    insegnamenti_autorizzati = list(set(insegnamenti_autorizzati))
        # Ottieni i codocenti per gli insegnamenti del docente (solo per non-admin)
        codocenti_set = set()
        if not is_admin_user:
            cursor.execute("""
                SELECT DISTINCT id2.docente
                FROM insegnamento_docente id1
                JOIN insegnamento_docente id2 ON id1.insegnamento = id2.insegnamento 
                    AND id1.annoaccademico = id2.annoaccademico
                WHERE id1.docente = %s AND id1.annoaccademico = %s AND id2.docente != %s
            """, (docente, anno, docente))
            codocenti_set = {row[0] for row in cursor.fetchall()}
        
        # Query principale - mostra tutti gli esami degli insegnamenti autorizzati
        if not insegnamenti_autorizzati:
            where_clause = "WHERE 1=0"
            params = ()
        else:
            if is_admin_user:
                # Admin vede tutti gli esami ufficiali + tutti gli esami del docente (anche non ufficiali)
                where_clause = """WHERE e.insegnamento = ANY(%s) AND 
                                  (e.mostra_nel_calendario = true OR e.docente = %s)"""
                params = (insegnamenti_autorizzati, docente)
            else:
                # Non admin vede: esami ufficiali + esami del docente + esami dei codocenti (anche non ufficiali)
                codocenti_list = list(codocenti_set)
                codocenti_list.append(docente)  # Includi sempre il docente stesso
                where_clause = """WHERE e.insegnamento = ANY(%s) AND 
                                  (e.mostra_nel_calendario = true OR e.docente = ANY(%s))"""
                params = (insegnamenti_autorizzati, codocenti_list)
        
        query = f"""
            SELECT e.id, e.descrizione, e.docente, 
                   CONCAT(u.nome, ' ', u.cognome) as docente_nome,
                   u.nome as docente_nome_solo, u.cognome as docente_cognome,
                   i.codice as insegnamento, i.titolo as insegnamento_titolo, i.id as insegnamento_id,
                   e.aula, e.data_appello, e.ora_appello, e.tipo_appello,
                   e.durata_appello, e.periodo,
                   ic.cds as codice_cds, c.nome_corso as nome_cds,
                   a.edificio, e.mostra_nel_calendario
            FROM esami e
            JOIN utenti u ON e.docente = u.username
            JOIN insegnamenti i ON e.insegnamento = i.id
            LEFT JOIN insegnamenti_cds ic ON i.id = ic.insegnamento AND ic.anno_accademico = e.anno_accademico
            LEFT JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum_codice = c.curriculum_codice
            LEFT JOIN aule a ON e.aula = a.nome
            {where_clause}
            ORDER BY e.data_appello, e.ora_appello
        """
        
        cursor.execute(query, params)
        
        # Costruisci la risposta con logica semplificata
        exams = []
        for row in cursor.fetchall():
            # Determina se l'esame è del docente autenticato o di un suo codocente
            esame_del_docente = False
            
            if is_admin_user:
                # Admin: solo esami degli insegnamenti SELEZIONATI sono blu
                # Se non ci sono insegnamenti selezionati, nessun esame è blu
                if insegnamenti_selezionati:
                    esame_del_docente = row['insegnamento_id'] in insegnamenti_selezionati
                else:
                    esame_del_docente = False
            else:
                # Non-admin: esami suoi + esami dei codocenti dello stesso insegnamento
                if row['docente'] == current_user:
                    esame_del_docente = True
                elif row['insegnamento_id'] in insegnamenti_docente_autenticato:
                    # L'esame appartiene a un insegnamento in cui il docente è coinvolto
                    esame_del_docente = True
            
            # Eccezione per "Studio docente DMI": non mostra l'edificio tra parentesi
            if row['aula'] == 'Studio docente DMI':
                aula_completa = row['aula']
            else:
                aula_completa = f"{row['aula']} ({row['edificio']})" if row['edificio'] and row['aula'] else (row['aula'] or 'N/A')
            
            exams.append({
                'id': str(row['id']),
                'title': row['insegnamento_titolo'],
                'aula': aula_completa,
                'start': f"{row['data_appello'].isoformat()}T{row['ora_appello']}" if row['ora_appello'] else row['data_appello'].isoformat(),
                'description': row['descrizione'],
                'allDay': False,
                'extendedProps': {
                    'docente': row['docente'],
                    'docenteNome': row['docente_nome'],
                    'docenteNomeSolo': row['docente_nome_solo'],
                    'docenteCognome': row['docente_cognome'],
                    'insegnamento': row['insegnamento_id'],
                    'esameDelDocente': esame_del_docente,
                    'tipo_appello': row['tipo_appello'],
                    'durata_appello': row['durata_appello'],
                    'periodo': row['periodo'],
                    'codice_cds': row['codice_cds'],
                    'nome_cds': row['nome_cds'],
                    'edificio': row['edificio'],
                    'mostra_nel_calendario': row['mostra_nel_calendario'],
                }
            })
        
        return jsonify(exams)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere gli anni accademici disponibili
@fetch_bp.route('/api/get-anni-accademici')
def get_anni_accademici():
  try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Recupera tutti gli anni accademici
    cursor.execute("""
      SELECT DISTINCT anno_accademico
      FROM cds
      ORDER BY anno_accademico DESC
    """)
    
    # Estrae gli anni dalla query e li converte in una lista
    anni = [row[0] for row in cursor.fetchall()]
    
    return jsonify(anni)
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

@fetch_bp.route('/api/get-date-valide', methods=['GET'])
def get_date_valide():
    try:
        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        
        docente = request.args.get('docente')
        anno = int(request.args.get('anno'))
        insegnamenti = request.args.get('insegnamenti')
        
        # Docente e anno sono sempre obbligatori
        if not docente or not anno:
            return jsonify({'status': 'error', 'message': 'Docente e anno accademico sono obbligatori'}), 400
                
        # Se sono specificati insegnamenti, usa quelli per filtrare le sessioni
        if insegnamenti:
            sessions = ottieni_sessioni_da_insegnamenti(insegnamenti.split(','), anno)
        else:
            # Altrimenti usa tutte le sessioni del docente
            sessions = ottieni_intersezione_sessioni_docente(docente, anno)

        # Ottieni le vacanze per l'anno accademico e escludile dalle sessioni
        vacanze = ottieni_vacanze(anno)
        sessions_senza_vacanze = escludi_vacanze_da_sessioni(sessions, vacanze)

        date_valide = [
            [session['inizio'].isoformat(), session['fine'].isoformat(), session['nome'], session.get('sessione_id', ''), session.get('nome_base', session['nome']), session.get('parte_numero'), session.get('totale_parti')]
            for session in sorted(sessions_senza_vacanze, key=lambda x: (x['inizio'].year, x['inizio'].month))
        ]
        
        return jsonify(date_valide)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@fetch_bp.route('/api/get-insegnamenti-docente', methods=['GET'])
def get_insegnamenti_docente():
    docente = request.args.get('docente')
    anno = int(request.args.get('anno'))
    
    if not docente or not anno:
        return jsonify({'status': 'error', 'message': 'Parametri mancanti'}), 400
    
    user_data = get_user_data().get_json()
    if not user_data['authenticated']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    is_admin_user = user_data['user_data']['permessi_admin']
    
    if not is_admin_user and user_data['user_data']['username'] != docente:
        return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 403
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if is_admin_user:
            # Admin vede tutti gli insegnamenti che richiedono inserimento esami
            cursor.execute("""
                SELECT DISTINCT i.id, i.codice, i.titolo, ic.cds, c.nome_corso, ic.curriculum_codice, 
                       ic.semestre, ic.anno_corso
                FROM insegnamenti i
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum_codice = c.curriculum_codice
                WHERE ic.anno_accademico = %s AND ic.inserire_esami = true
                ORDER BY ic.cds, i.codice
            """, (anno,))
        else:
            # Docente vede solo i suoi insegnamenti che richiedono inserimento esami
            cursor.execute("""
                SELECT DISTINCT i.id, i.codice, i.titolo, ic.cds, c.nome_corso, ic.curriculum_codice, 
                       ic.semestre, ic.anno_corso
                FROM insegnamenti i
                JOIN insegnamento_docente id ON i.id = id.insegnamento
                JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
                JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico AND ic.curriculum_codice = c.curriculum_codice
                WHERE ic.anno_accademico = %s AND id.annoaccademico = %s AND id.docente = %s AND ic.inserire_esami = true
                ORDER BY ic.cds, i.codice
            """, (anno, anno, docente))
        
        # Organizza per CdS
        cds_dict = {}
        for row in cursor.fetchall():
            ins_id, codice, titolo, cds_code, nome_corso, curriculum_codice, semestre, anno_corso = row
            cds_key = f"{cds_code}_{curriculum_codice}"
            
            if cds_key not in cds_dict:
                cds_dict[cds_key] = {
                    "codice": cds_code, "nome": nome_corso, "curriculum_codice": curriculum_codice, "insegnamenti": []
                }
            
            cds_dict[cds_key]["insegnamenti"].append({
                "id": ins_id, "codice": codice, "titolo": titolo, 
                "semestre": semestre, "anno_corso": anno_corso,
                "cds_codice": cds_code, "cds_nome": nome_corso
            })
        
        return jsonify({"status": "success", "cds": list(cds_dict.values())})
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/check-esami-minimi', methods=['GET'])
def check_esami_minimi():
    user_data = get_user_data().get_json()
    if not user_data['authenticated']:
        return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
    
    docente = request.args.get('docente')
    anno = int(request.args.get('anno'))
    
    if not docente or not anno:
        return jsonify({'status': 'error', 'message': 'Docente e anno accademico sono obbligatori'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Ottieni il target esami globale
        cursor.execute("SELECT target_esami_default FROM configurazioni_globali WHERE anno_accademico = %s", (anno,))
        target_result = cursor.fetchone()
        target_esami = target_result[0] if target_result else 8
        
        # 2. Ottieni gli insegnamenti del docente che richiedono inserimento esami
        cursor.execute("""
            SELECT DISTINCT i.id, i.titolo, ic.cds, 
                   COALESCE(c.nome_corso, 'N/D') as nome_corso, ic.semestre
            FROM insegnamenti i
            JOIN insegnamento_docente id ON i.id = id.insegnamento
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            LEFT JOIN cds c ON ic.cds = c.codice AND ic.anno_accademico = c.anno_accademico 
                       AND ic.curriculum_codice = c.curriculum_codice
            WHERE id.docente = %s AND id.annoaccademico = %s AND ic.anno_accademico = %s 
                  AND ic.inserire_esami = true
        """, (docente, anno, anno))
        
        insegnamenti = cursor.fetchall()
        
        if not insegnamenti:
            return jsonify({
                'status': 'success', 
                'nessun_problema': True, 
                'message': 'Nessun insegnamento trovato per questo docente.',
                'target_esami': target_esami
            })
        
        insegnamenti_problematici = []
        
        for insegnamento in insegnamenti:
            ins_id, ins_titolo, cds_code, nome_corso, semestre = insegnamento
            
            # 3. Conta TUTTI gli esami per questo insegnamento (di qualunque docente) che sono ufficiali
            cursor.execute("""
                SELECT COUNT(*) FROM esami 
                WHERE insegnamento = %s AND anno_accademico = %s 
                      AND mostra_nel_calendario = true
            """, (ins_id, anno))
            
            esami_totali = cursor.fetchone()[0]
            
            # 4. Ottieni le sessioni per questo CdS
            cursor.execute("""
                SELECT tipo_sessione, inizio, fine, esami_primo_semestre, esami_secondo_semestre
                FROM sessioni
                WHERE cds = %s AND anno_accademico = %s AND curriculum_codice = 'GEN'
            """, (cds_code, anno))
            
            sessioni = cursor.fetchall()
            
            # 5. Verifica ogni sessione per problemi
            sessioni_problematiche = []
            
            for sessione in sessioni:
                tipo_sess, inizio, fine, esami_primo, esami_secondo = sessione
                
                # Calcola minimo richiesto per questo insegnamento/semestre
                if semestre == 1:
                    minimo_richiesto = esami_primo or 0
                elif semestre == 2 or semestre == 3: # Insegnamenti annuali seguono le regole del secondo semestre
                    minimo_richiesto = esami_secondo or 0
                else:
                    minimo_richiesto = 0
                
                if minimo_richiesto > 0:
                    # 6. Conta TUTTI gli esami in questa sessione (di qualunque docente) che sono ufficiali
                    cursor.execute("""
                        SELECT COUNT(*) FROM esami 
                        WHERE insegnamento = %s AND anno_accademico = %s
                              AND data_appello >= %s AND data_appello <= %s
                              AND mostra_nel_calendario = true
                    """, (ins_id, anno, inizio, fine))
                    
                    esami_presenti = cursor.fetchone()[0]
                    
                    # 7. Verifica se è problematica
                    if esami_presenti < minimo_richiesto:
                        sessioni_problematiche.append({
                            'tipo_sessione': tipo_sess,
                            'esami_presenti': esami_presenti,
                            'minimo_richiesto': minimo_richiesto
                        })
                elif semestre == 3 and tipo_sess == 'anticipata' and minimo_richiesto == 0:
                    # Per insegnamenti annuali in anticipata, verifica che non ci siano appelli
                    cursor.execute("""
                        SELECT COUNT(*) FROM esami 
                        WHERE insegnamento = %s AND anno_accademico = %s
                              AND data_appello >= %s AND data_appello <= %s
                              AND mostra_nel_calendario = true
                    """, (ins_id, anno, inizio, fine))
                    
                    esami_presenti = cursor.fetchone()[0]
                    
                    # Se ci sono appelli in anticipata per insegnamenti annuali, è un problema
                    if esami_presenti > 0:
                        sessioni_problematiche.append({
                            'tipo_sessione': tipo_sess,
                            'esami_presenti': esami_presenti,
                            'minimo_richiesto': 0,
                            'messaggio': 'Gli insegnamenti annuali non devono avere appelli in sessione anticipata'
                        })
            
            # 8. Aggiungi agli insegnamenti problematici se necessario
            sotto_target = esami_totali < target_esami
            ha_sessioni_problematiche = len(sessioni_problematiche) > 0
            
            if sotto_target or ha_sessioni_problematiche:
                insegnamenti_problematici.append({
                    'id': ins_id,
                    'titolo': ins_titolo,
                    'esami_inseriti': esami_totali,
                    'codici_cds': f"{nome_corso} - {cds_code}",
                    'target_esami': target_esami,
                    'sotto_target': sotto_target,
                    'sessioni_problematiche': sessioni_problematiche,
                    'semestre': semestre
                })
        
        if not insegnamenti_problematici:
            return jsonify({
                'status': 'success', 
                'nessun_problema': True, 
                'message': f'Tutti gli insegnamenti rispettano i minimi richiesti.',
                'target_esami': target_esami
            })
        
        return jsonify({
            'status': 'warning', 
            'nessun_problema': False,
            'insegnamenti': [i['titolo'] for i in insegnamenti_problematici],
            'insegnamenti_sotto_minimo': insegnamenti_problematici,
            'target_esami': target_esami
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

def ottieni_target_esami_e_sessioni(docente, anno_accademico):
    """Ottiene il numero minimo di esami per sessione per i CdS del docente"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ottieni il target di esami default dalle configurazioni globali
        cursor.execute("""
            SELECT target_esami_default 
            FROM configurazioni_globali 
            WHERE anno_accademico = %s
        """, (anno_accademico,))
        
        target_result = cursor.fetchone()
        if not target_result or target_result[0] is None:
            raise Exception(f"Programmazione Didattica non disponibile per l'anno {anno_accademico}/{anno_accademico + 1}")
        target_esami = target_result[0]
        
        # Ottieni i CdS GEN del docente
        cursor.execute("""
            SELECT DISTINCT ic.cds
            FROM insegnamento_docente id
            JOIN insegnamenti_cds ic ON id.insegnamento = ic.insegnamento
            WHERE id.docente = %s AND id.annoaccademico = %s AND ic.anno_accademico = %s
        """, (docente, anno_accademico, anno_accademico))
        
        cds_list = [row[0] for row in cursor.fetchall()]
        
        if not cds_list:
            raise Exception(f"Nessun CdS GEN trovato per il docente {docente} nell'anno {anno_accademico}")
        
        # Ottieni i minimi per sessione per tutti i CdS GEN del docente
        sessioni_per_cds = {}
        
        for cds in cds_list:
            cursor.execute("""
                SELECT tipo_sessione, esami_primo_semestre, esami_secondo_semestre
                FROM sessioni
                WHERE cds = %s AND anno_accademico = %s AND curriculum_codice = 'GEN'
            """, (cds, anno_accademico))
            
            sessioni_data = cursor.fetchall()
            sessioni_per_cds[cds] = {}
            
            for tipo_sessione, primo_sem, secondo_sem in sessioni_data:
                sessioni_per_cds[cds][tipo_sessione] = {
                    'primo_semestre': primo_sem or 0,
                    'secondo_semestre': secondo_sem or 0
                }
        
        return {
            'target_esami_default': target_esami,
            'sessioni_per_cds': sessioni_per_cds
        }
        
    except Exception as e:
        print(f"Errore nell'ottenere target esami e sessioni: {str(e)}")
        raise e
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

@fetch_bp.route('/api/get-target-esami-sessioni', methods=['GET'])
def get_target_esami_sessioni():
    """Endpoint per ottenere target esami e informazioni sessioni per un docente"""
    try:
        user_data = get_user_data().get_json()
        if not user_data['authenticated']:
            return jsonify({'status': 'error', 'message': 'Utente non autenticato'}), 401
        
        docente = request.args.get('docente')
        anno = request.args.get('anno')
        
        if not docente or not anno:
            return jsonify({'status': 'error', 'message': 'Parametri docente e anno obbligatori'}), 400
        
        try:
            anno = int(anno)
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Anno deve essere un numero intero'}), 400
        
        # Controlla autorizzazioni
        is_admin_user = user_data['user_data']['permessi_admin']
        if not is_admin_user and user_data['user_data']['username'] != docente:
            return jsonify({'status': 'error', 'message': 'Accesso non autorizzato'}), 403
        
        result = ottieni_target_esami_e_sessioni(docente, anno)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500