from flask import Blueprint, request, jsonify, session
from datetime import datetime, timedelta, date, time
from db import get_db_connection, release_connection
from auth import require_auth

exam_bp = Blueprint('exam_bp', __name__)

# ================== Funzioni utility ==================

def serialize_for_json(obj):
    """Converte tipi Python non serializzabili in JSON in stringhe."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif isinstance(obj, time):
        return obj.strftime('%H:%M:%S')
    elif isinstance(obj, timedelta):
        return str(obj)
    return obj

def check_user_permissions(exam_docente, username, is_admin):
    """Controlla se l'utente può modificare l'esame."""
    return is_admin or username.lower() == exam_docente.strip().lower()

def check_exam_modifiable(exam_date):
    """Controlla se l'esame può essere modificato (almeno 7 giorni nel futuro)."""
    # DISABILITATO: Controllo dei 7 giorni per modificabilità esame
    # today = datetime.now().date()
    # return (exam_date - today).days >= 7
    return True  # Permetti sempre la modifica

def get_user_admin_status(username):
    """Ottiene lo status admin dell'utente dal database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT permessi_admin FROM utenti WHERE username = %s", (username,))
    result = cursor.fetchone()
    cursor.close()
    release_connection(conn)
    return bool(result and result[0])

def is_date_in_session(data_appello, docente, anno_accademico):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT inizio, fine FROM sessioni s
        JOIN insegnamenti_cds ic ON s.cds = ic.cds AND s.anno_accademico = ic.anno_accademico
        JOIN insegnamento_docente idoc ON ic.insegnamento = idoc.insegnamento AND ic.anno_accademico = idoc.annoaccademico
        WHERE idoc.docente = %s AND s.anno_accademico = %s
    """, (docente, anno_accademico))
    sessioni = cursor.fetchall()
    cursor.close()
    release_connection(conn)
    for inizio, fine in sessioni:
        if inizio and fine and inizio <= data_appello <= fine:
            return True
    return False

# ================== Funzioni per la gestione dei dati degli esami ==================

def genera_dati_esame():
    """Raccoglie i dati dal form modulare e li valida."""
    data = request.form
    docente = data.get('docente')
    
    # Gestione insegnamenti
    insegnamenti = request.form.getlist('insegnamenti[]')
    if not insegnamenti:
        return {'status': 'error', 'message': 'Nessun insegnamento selezionato'}
    
    # Anno accademico obbligatorio
    anno_accademico = int(data.get('anno_accademico'))
    
    # Mappature per verbalizzazione
    verbalizzazione_map = {"FSS": "FSS", "FWP": "FWP", "PAR": "PAR", "PPP": "PPP"}
    
    # Raccolta sezioni appelli dal form
    sezioni_appelli = []
    descrizioni = request.form.getlist('descrizione[]')
    date_appello = request.form.getlist('dataora[]')
    ore_h = request.form.getlist('ora_h[]')
    ore_m = request.form.getlist('ora_m[]')
    durate = request.form.getlist('durata[]')
    aule = request.form.getlist('aula[]')
    inizi_iscrizione = request.form.getlist('inizioIscrizione[]')
    fini_iscrizione = request.form.getlist('fineIscrizione[]')
    verbalizzazioni = request.form.getlist('verbalizzazione[]')
    tipi_esame = request.form.getlist('tipoEsame[]')
    note_appelli = request.form.getlist('note[]')
    tipi_appello = request.form.getlist('tipo_appello_radio[]')
    mostra_calendario = request.form.getlist('mostra_nel_calendario[]')
    
    if not descrizioni:
        return {'status': 'error', 'message': 'Nessuna sezione appello inserita'}
    
    # Processa tutte le sezioni
    for i in range(len(descrizioni)):
        # Validazione campi obbligatori base
        if not all([date_appello[i], ore_h[i], ore_m[i], aule[i]]):
            continue
            
        # Validazione ora (8-18)
        ora_int = int(ore_h[i])
        if not (8 <= ora_int <= 18):
            return {'status': 'error', 'message': f'Ora non valida per appello {i+1}: deve essere tra 08:00 e 18:00'}
        
        # Validazione durata (30-720 minuti)
        durata_appello = int(durate[i] if i < len(durate) else '120')
        if not (30 <= durata_appello <= 720):
            return {'status': 'error', 'message': f'Durata deve essere tra 30 e 720 minuti per appello {i+1}'}
            
        # Costruzione sezione
        data_esame = datetime.fromisoformat(date_appello[i])
        # Controllo che la data sia in una sessione valida
        if not is_date_in_session(data_esame.date(), docente, anno_accademico):
            return {'status': 'error', 'message': f'La data {date_appello[i]} non è all\'interno di una sessione valida'}
        sezione = {
            'descrizione': descrizioni[i],
            'data_appello': date_appello[i],
            'ora_appello': f"{ore_h[i]}:{ore_m[i]}",
            'durata_appello': durata_appello,
            'aula': aule[i],
            'periodo': 1 if ora_int >= 14 else 0,
            'verbalizzazione': verbalizzazione_map.get(verbalizzazioni[i] if i < len(verbalizzazioni) else 'FSS', 'FSS'),
            'tipo_esame': tipi_esame[i] if i < len(tipi_esame) else None,
            'note_appello': note_appelli[i] if i < len(note_appelli) else '',
            'tipo_appello': tipi_appello[i] if i < len(tipi_appello) else 'PF',
            'mostra_nel_calendario': (mostra_calendario[i] if i < len(mostra_calendario) else 'false').lower() == 'true',
            'tipo_iscrizione': 'SOC' if (tipi_esame[i] if i < len(tipi_esame) else None) == 'SO' else (tipi_esame[i] if i < len(tipi_esame) else None),
            'definizione_appello': 'STD',
            'gestione_prenotazione': 'STD',
            'riservato': False,
            'posti': None
        }
        
        # Calcola automaticamente le date di iscrizione se mancanti
        if not (inizi_iscrizione and i < len(inizi_iscrizione) and inizi_iscrizione[i].strip()):
            sezione['inizio_iscrizione'] = (data_esame - timedelta(days=30)).strftime('%Y-%m-%d')
        else:
            sezione['inizio_iscrizione'] = inizi_iscrizione[i]
            
        if not (fini_iscrizione and i < len(fini_iscrizione) and fini_iscrizione[i].strip()):
            sezione['fine_iscrizione'] = (data_esame - timedelta(days=1)).strftime('%Y-%m-%d')
        else:
            sezione['fine_iscrizione'] = fini_iscrizione[i]
        
        sezioni_appelli.append(sezione)
    
    if not sezioni_appelli:
        return {'status': 'error', 'message': 'Nessuna sezione appello valida'}
    
    return {
        'insegnamenti': insegnamenti,
        'docente': docente,
        'sezioni_appelli': sezioni_appelli,
        'anno_accademico': anno_accademico
    }

def controlla_vincoli(dati_esame, aula_originale=None):
    """Controlla i vincoli per tutti gli esami."""
    if "status" in dati_esame and dati_esame["status"] == "error":
        return False, dati_esame["message"]
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Ottieni target esami per l'anno accademico
    cursor.execute("""
        SELECT target_esami_default 
        FROM configurazioni_globali 
        WHERE anno_accademico = %s
    """, (dati_esame['anno_accademico'],))
    
    target_result = cursor.fetchone()
    target_esami = target_result[0]
    
    # Estrai parametri principali
    insegnamenti = dati_esame['insegnamenti']
    sezioni_appelli = dati_esame['sezioni_appelli']
    anno_accademico = dati_esame['anno_accademico']
    exam_id_to_exclude = dati_esame.get('exam_id')
    
    for sezione in sezioni_appelli:
        data_appello = sezione['data_appello']
        aula = sezione['aula']
        periodo = sezione['periodo']
        mostra_nel_calendario = sezione['mostra_nel_calendario']
        data_esame = datetime.fromisoformat(data_appello)
        
        # Controllo weekend
        if data_esame.weekday() >= 5:
            cursor.close()
            release_connection(conn)
            return False, f'Non è possibile inserire esami nel weekend: {data_appello}'
        
        # Controllo conflitti aula (salta se studio docente o stessa aula originale)
        if aula != "Studio docente DMI" and aula != aula_originale:
            where_clause = "WHERE aula = %s AND data_appello = %s AND periodo = %s"
            params = [aula, data_appello, periodo]
            
            if exam_id_to_exclude:
                where_clause += " AND id != %s"
                params.append(exam_id_to_exclude)
            
            cursor.execute(f"SELECT COUNT(*) FROM esami {where_clause}", params)
            
            if cursor.fetchone()[0] > 0:
                cursor.close()
                release_connection(conn)
                periodo_str = "pomeriggio" if periodo == 1 else "mattina"
                return False, f'Conflitto aula: {aula} già occupata il {data_appello} nel periodo {periodo_str}'
        
        # Controllo vincoli per insegnamento (solo se mostra nel calendario)
        if mostra_nel_calendario:
            for insegnamento in insegnamenti:
                # Ottieni info insegnamento
                cursor.execute("SELECT id, titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
                result = cursor.fetchone()
                if not result:
                    cursor.close()
                    release_connection(conn)
                    return False, f'Insegnamento {insegnamento} non trovato'
                
                insegnamento_id, titolo_insegnamento = result
                
                # Verifica esistenza per l'anno accademico
                cursor.execute("""
                    SELECT 1 FROM insegnamenti_cds 
                    WHERE insegnamento = %s AND anno_accademico = %s LIMIT 1
                """, (insegnamento_id, anno_accademico))
                
                if not cursor.fetchone():
                    cursor.close()
                    release_connection(conn)
                    return False, f'Insegnamento {titolo_insegnamento} non trovato per l\'anno accademico {anno_accademico}'
                
                # Controllo vincolo 14 giorni
                cursor.execute("""
                    SELECT data_appello FROM esami 
                    WHERE insegnamento = %s AND anno_accademico = %s 
                    AND mostra_nel_calendario = true
                    AND data_appello != %s::date
                    AND data_appello BETWEEN (%s::date - INTERVAL '13 days')
                    AND (%s::date + INTERVAL '13 days')
                """ + (" AND id != %s" if exam_id_to_exclude else ""),
                [insegnamento_id, anno_accademico, data_appello, data_appello, data_appello] + 
                ([exam_id_to_exclude] if exam_id_to_exclude else []))
                
                conflicting_dates = cursor.fetchall()
                
                if conflicting_dates:
                    conflicting_date = conflicting_dates[0][0]
                    cursor.close()
                    release_connection(conn)
                    return False, f'Vincolo 14 giorni violato per {titolo_insegnamento}: esiste già un esame il {conflicting_date}'
                
                # Controllo conflitto orario con materie dello stesso CDS/anno/semestre
                ora_appello = sezione.get('ora_appello')
                if not ora_appello:
                    cursor.close()
                    release_connection(conn)
                    return False, f'Ora appello mancante per la validazione dei vincoli'
                
                cursor.execute("""
                    SELECT DISTINCT i.titolo, e.ora_appello
                    FROM esami e
                    JOIN insegnamenti i ON e.insegnamento = i.id
                    JOIN insegnamenti_cds ic1 ON e.insegnamento = ic1.insegnamento AND e.anno_accademico = ic1.anno_accademico
                    JOIN insegnamenti_cds ic2 ON ic2.insegnamento = %s AND ic2.anno_accademico = %s
                    WHERE e.data_appello = %s
                    AND e.ora_appello = %s
                    AND e.mostra_nel_calendario = true
                    AND e.insegnamento != %s
                    AND ic1.cds = ic2.cds
                    AND ic1.anno_corso = ic2.anno_corso
                    AND ic1.semestre = ic2.semestre
                    AND e.anno_accademico = %s
                """ + (" AND e.id != %s" if exam_id_to_exclude else ""),
                [insegnamento_id, anno_accademico, data_appello, ora_appello, 
                 insegnamento_id, anno_accademico] + 
                ([exam_id_to_exclude] if exam_id_to_exclude else []))
                
                conflicting_exams = cursor.fetchall()
                
                if conflicting_exams:
                    conflicting_title, conflicting_time = conflicting_exams[0]
                    cursor.close()
                    release_connection(conn)
                    return False, f'Conflitto orario: {conflicting_title} ha già un esame il {data_appello} alle {conflicting_time} per lo stesso CDS/anno/semestre di {titolo_insegnamento}'
    
    cursor.close()
    release_connection(conn)
    return True, None

def inserisci_esami(dati_esame):
    """Inserisce tutti gli esami nel database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    esami_inseriti = []
    insegnamenti = dati_esame['insegnamenti']
    docente = dati_esame['docente']
    sezioni_appelli = dati_esame['sezioni_appelli']
    anno_accademico = dati_esame['anno_accademico']
    
    for sezione in sezioni_appelli:
        for insegnamento_codice in insegnamenti:
            # Ottieni ID insegnamento
            cursor.execute("SELECT id, titolo FROM insegnamenti WHERE codice = %s", (insegnamento_codice,))
            result = cursor.fetchone()
            if not result:
                continue
                
            insegnamento_id, titolo_insegnamento = result
            
            # Ottieni info CDS
            cursor.execute("""
                SELECT cds, curriculum_codice FROM insegnamenti_cds 
                WHERE insegnamento = %s AND anno_accademico = %s LIMIT 1
            """, (insegnamento_id, anno_accademico))
            
            cds_info = cursor.fetchone()
            if not cds_info:
                continue
                
            cds, curriculum_codice = cds_info
            
            # Inserimento
            cursor.execute("""
                INSERT INTO esami 
                (docente, insegnamento, aula, data_appello, ora_appello, 
                 data_inizio_iscrizione, data_fine_iscrizione, tipo_esame, 
                 verbalizzazione, descrizione, note_appello, tipo_appello, 
                 definizione_appello, gestione_prenotazione, riservato, 
                 tipo_iscrizione, periodo, durata_appello, cds, anno_accademico, 
                 curriculum_codice, mostra_nel_calendario)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                docente, insegnamento_id, sezione['aula'], sezione['data_appello'],
                sezione['ora_appello'], sezione['inizio_iscrizione'], sezione['fine_iscrizione'],
                sezione['tipo_esame'], sezione['verbalizzazione'], sezione['descrizione'],
                sezione['note_appello'], sezione['tipo_appello'], sezione['definizione_appello'],
                sezione['gestione_prenotazione'], sezione['riservato'], sezione['tipo_iscrizione'],
                sezione['periodo'], sezione['durata_appello'], cds, anno_accademico,
                curriculum_codice, sezione['mostra_nel_calendario']
            ))
            
            esami_inseriti.append(f"{titolo_insegnamento} - {sezione['data_appello']}")
    
    conn.commit()
    cursor.close()
    release_connection(conn)
    return esami_inseriti

# ================== Endpoints API ==================

@exam_bp.route('/api/inserisci-esame', methods=['POST'])
@require_auth
def inserisci_esame():
    """API per inserire esami nel database."""
    username = session.get('username')
    
    # Verifica permessi admin per bypass
    is_admin = session.get('permessi_admin', False) or get_user_admin_status(username)
    bypass_checks = request.form.get('bypass_checks', 'false').lower() == 'true'
    
    # Raccolta e validazione dati
    dati_esame = genera_dati_esame()
    if "status" in dati_esame and dati_esame["status"] == "error":
        return jsonify(dati_esame), 400
    
    # Bypass controlli se admin
    if is_admin and bypass_checks:
        esami_inseriti = inserisci_esami(dati_esame)
        return jsonify({
            'status': 'success',
            'message': 'Esami inseriti con successo (controlli bypassati)',
            'inserted': esami_inseriti
        }), 200
    
    # Controlli vincoli
    vincoli_ok, errore_vincoli = controlla_vincoli(dati_esame)
    if not vincoli_ok:
        return jsonify({'status': 'error', 'message': errore_vincoli}), 400
    
    # Inserimento
    esami_inseriti = inserisci_esami(dati_esame)
    return jsonify({
        'status': 'success',
        'message': 'Tutti gli esami sono stati inseriti con successo',
        'inserted': esami_inseriti
    }), 200

@exam_bp.route('/api/get-esame-by-id', methods=['GET'])
@require_auth
def get_esame_by_id():
    """Recupera i dettagli di un esame specifico per ID."""
    exam_id = request.args.get('id')
    if not exam_id:
        return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    username = session.get('username', '')
    is_admin = session.get('permessi_admin', False) or get_user_admin_status(username)
    
    cursor.execute("""
    SELECT e.*, i.titolo AS insegnamento_titolo, i.codice AS insegnamento_codice,
           c.nome_corso AS cds_nome
    FROM esami e
    JOIN insegnamenti i ON e.insegnamento = i.id
    JOIN cds c ON e.cds = c.codice AND e.anno_accademico = c.anno_accademico 
               AND e.curriculum_codice = c.curriculum_codice
    WHERE e.id = %s
    """, (exam_id,))
    
    esame = cursor.fetchone()
    if not esame:
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

    # Converti in dizionario
    columns = [desc[0] for desc in cursor.description]
    esame_dict = dict(zip(columns, esame))

    # Controllo permessi
    if not check_user_permissions(esame_dict['docente'], username, is_admin):
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Non hai i permessi per modificare questo esame'}), 403

    # Controllo modificabilità
    can_modify = check_exam_modifiable(esame_dict['data_appello'])
    esame_dict['can_modify'] = can_modify
    esame_dict['message'] = "" if can_modify else "L'esame non può essere modificato (meno di 7 giorni)"
    esame_dict['is_edit_mode'] = True
    esame_dict['edit_id'] = exam_id

    # Serializza per JSON
    for key, value in esame_dict.items():
        esame_dict[key] = serialize_for_json(value)

    cursor.close()
    release_connection(conn)
    return jsonify({'success': True, 'esame': esame_dict})

@exam_bp.route('/api/update-esame', methods=['POST'])
@require_auth
def update_esame():
    """Aggiorna un esame esistente con supporto per sezioni modulari."""
    data = request.get_json()
    exam_id = data.get('id')
    if not exam_id:
        return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    username = session.get('username', '')
    is_admin = session.get('permessi_admin', False) or get_user_admin_status(username)
    bypass_checks = data.get('bypass_checks', False)

    # Ottieni esame esistente
    cursor.execute("SELECT * FROM esami WHERE id = %s", (exam_id,))
    esame = cursor.fetchone()
    if not esame:
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

    columns = [desc[0] for desc in cursor.description]
    esame_dict = dict(zip(columns, esame))

    # Controlli permessi e modificabilità
    if not check_user_permissions(esame_dict['docente'], username, is_admin):
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Non hai i permessi per modificare questo esame'}), 403

    if not bypass_checks and not check_exam_modifiable(esame_dict['data_appello']):
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Esame non modificabile (meno di 7 giorni)'}), 400

    # Controllo data non anticipata (solo se non bypass)
    if not bypass_checks:
        nuova_data = datetime.strptime(data.get('data_appello'), '%Y-%m-%d').date()
        if nuova_data < esame_dict['data_appello']:
            cursor.close()
            release_connection(conn)
            return jsonify({'success': False, 'message': 'La nuova data non può essere anticipata'}), 400

    # Controllo vincoli (solo se non bypass)
    if not bypass_checks:
        # Ottieni codice insegnamento per controllo vincoli
        cursor.execute("SELECT codice FROM insegnamenti WHERE id = %s", (esame_dict['insegnamento'],))
        insegnamento_result = cursor.fetchone()

        # Prepara dati per controllo vincoli
        dati_controllo = {
            'exam_id': exam_id,
            'insegnamenti': [insegnamento_result[0]],
            'sezioni_appelli': [{
                'data_appello': data.get('data_appello'),
                'ora_appello': data.get('ora_appello'),
                'aula': data.get('aula'),
                'periodo': data.get('periodo'),
                'mostra_nel_calendario': data.get('mostra_nel_calendario', True),
                'tipo_appello': data.get('tipo_appello', 'PF')
            }],
            'anno_accademico': esame_dict['anno_accademico']
        }

        # Controllo vincoli passando l'aula originale
        vincoli_ok, errore = controlla_vincoli(dati_controllo, aula_originale=esame_dict['aula'])
        if not vincoli_ok:
            cursor.close()
            release_connection(conn)
            return jsonify({'success': False, 'message': errore}), 400

    # Aggiornamento
    cursor.execute("""
    UPDATE esami SET
        descrizione = %s, tipo_appello = %s, aula = %s, data_appello = %s,
        data_inizio_iscrizione = %s, data_fine_iscrizione = %s, ora_appello = %s,
        durata_appello = %s, periodo = %s, verbalizzazione = %s,
        tipo_esame = %s, note_appello = %s, mostra_nel_calendario = %s
    WHERE id = %s
    """, (
        data.get('descrizione'), data.get('tipo_appello'), data.get('aula'),
        data.get('data_appello'), data.get('data_inizio_iscrizione'),
        data.get('data_fine_iscrizione'), data.get('ora_appello'),
        data.get('durata_appello'), data.get('periodo'), data.get('verbalizzazione'),
        data.get('tipo_esame'), data.get('note_appello'),
        data.get('mostra_nel_calendario', True), exam_id
    ))
    
    conn.commit()
    cursor.close()
    release_connection(conn)
    
    message = 'Esame aggiornato con successo'
    if bypass_checks:
        message += ' (controlli bypassati)'
        
    return jsonify({'success': True, 'message': message})

@exam_bp.route('/api/delete-esame', methods=['POST'])
@require_auth
def delete_esame():
    """Elimina un esame esistente."""
    data = request.get_json()
    exam_id = data.get('id')
    if not exam_id:
        return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    username = session.get('username', '')
    is_admin = session.get('permessi_admin', False) or get_user_admin_status(username)

    # Ottieni esame
    cursor.execute("SELECT * FROM esami WHERE id = %s", (exam_id,))
    esame = cursor.fetchone()
    if not esame:
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

    columns = [desc[0] for desc in cursor.description]
    esame_dict = dict(zip(columns, esame))

    # Controlli
    if not check_user_permissions(esame_dict['docente'], username, is_admin):
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Non hai i permessi per eliminare questo esame'}), 403

    if not check_exam_modifiable(esame_dict['data_appello']):
        cursor.close()
        release_connection(conn)
        return jsonify({'success': False, 'message': 'Esame non eliminabile (meno di 7 giorni)'}), 400

    # Eliminazione
    cursor.execute("DELETE FROM esami WHERE id = %s", (exam_id,))
    conn.commit()
    cursor.close()
    release_connection(conn)
    
    return jsonify({'success': True, 'message': 'Esame eliminato con successo'})