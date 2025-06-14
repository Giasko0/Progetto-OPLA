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
    today = datetime.now().date()
    return (exam_date - today).days >= 7

def get_user_admin_status(username):
    """Ottiene lo status admin dell'utente dal database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT permessi_admin FROM utenti WHERE username = %s", (username,))
    result = cursor.fetchone()
    cursor.close()
    release_connection(conn)
    return bool(result and result[0])

# ================== Funzioni per la gestione dei dati degli esami ==================

def generaDatiEsame():
    """Raccoglie i dati dal form modulare e li valida."""
    data = request.form
    docente = data.get('docente')
    
    # Gestione insegnamenti
    insegnamenti = request.form.getlist('insegnamenti[]')
    if not insegnamenti:
        return {'status': 'error', 'message': 'Nessun insegnamento selezionato'}
    
    # Anno accademico obbligatorio
    anno_accademico = int(data.get('anno_accademico'))
    
    # Mappature per verbalizzazione (per compatibilità con import Excel)
    verbalizzazione_map = {
        "FSS": "FSS",  # Firma digitale singola
        "FWP": "FWP",  # Firma digitale con pubblicazione  
        "PAR": "PAR",  # Prova parziale
        "PPP": "PPP",  # Prova parziale con pubblicazione
    }
    
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
        sezione = {
            'descrizione': descrizioni[i],
            'data_appello': date_appello[i],
            'ora_h': ore_h[i],
            'ora_m': ore_m[i],
            'durata': durate[i] if i < len(durate) else '120',
            'aula': aule[i],
            'inizio_iscrizione': inizi_iscrizione[i] if i < len(inizi_iscrizione) else None,
            'fine_iscrizione': fini_iscrizione[i] if i < len(fini_iscrizione) else None,
            'verbalizzazione': verbalizzazione_map.get(verbalizzazioni[i] if i < len(verbalizzazioni) else 'FSS', 'FSS'),
            'tipo_esame': tipi_esame[i] if i < len(tipi_esame) else None,
            'note_appello': note_appelli[i] if i < len(note_appelli) else '',
            'tipo_appello': tipi_appello[i] if i < len(tipi_appello) else 'PF',
            'mostra_nel_calendario': (mostra_calendario[i] if i < len(mostra_calendario) else 'false').lower() == 'true'
        }
        
        # Validazione campi obbligatori
        if not all([sezione['data_appello'], sezione['ora_h'], sezione['ora_m'], sezione['aula']]):
            continue
        
        # Costruisci ora e valida
        sezione['ora_appello'] = f"{sezione['ora_h']}:{sezione['ora_m']}"
        ora_int = int(sezione['ora_h'])
        if not (8 <= ora_int <= 18):
            return {'status': 'error', 'message': f'Ora non valida per appello {i+1}: deve essere tra 08:00 e 18:00'}
        
        sezione['periodo'] = 1 if ora_int >= 14 else 0
        
        # Valida durata
        durata_appello = int(sezione['durata'])
        if not (30 <= durata_appello <= 720):
            return {'status': 'error', 'message': f'Durata deve essere tra 30 e 720 minuti per appello {i+1}'}
        sezione['durata_appello'] = durata_appello
        
        # Calcola automaticamente le date di iscrizione se mancanti
        data_esame = datetime.fromisoformat(sezione['data_appello'])
        
        if not sezione['inizio_iscrizione'] or sezione['inizio_iscrizione'].strip() == '':
            # Inizio iscrizione: 30 giorni prima
            data_inizio = data_esame - timedelta(days=30)
            sezione['inizio_iscrizione'] = data_inizio.strftime('%Y-%m-%d')
        
        if not sezione['fine_iscrizione'] or sezione['fine_iscrizione'].strip() == '':
            # Fine iscrizione: 1 giorno prima
            data_fine = data_esame - timedelta(days=1)
            sezione['fine_iscrizione'] = data_fine.strftime('%Y-%m-%d')
        
        # Campi con valori fissi
        sezione['tipo_iscrizione'] = 'SOC' if sezione['tipo_esame'] == 'SO' else sezione['tipo_esame']
        sezione['definizione_appello'] = 'STD'
        sezione['gestione_prenotazione'] = 'STD'
        sezione['riservato'] = False
        sezione['posti'] = None
        
        sezioni_appelli.append(sezione)
    
    if not sezioni_appelli:
        return {'status': 'error', 'message': 'Nessuna sezione appello valida'}
    
    return {
        'insegnamenti': insegnamenti,
        'docente': docente,
        'sezioni_appelli': sezioni_appelli,
        'anno_accademico': anno_accademico
    }

def controllaVincoli(dati_esame, aula_originale=None):
    """Controlla i vincoli per tutti gli esami."""
    if "status" in dati_esame and dati_esame["status"] == "error":
        return False, dati_esame["message"]
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
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
            return False, f'Non è possibile inserire esami di sabato o domenica ({data_appello})'
        
        # Controllo conflitti aula - salta se è la stessa aula dell'esame originale
        if aula != "Studio docente DMI":
            # Se è un aggiornamento e l'aula non è cambiata, salta il controllo
            if aula_originale and aula == aula_originale:
                pass  # Salta il controllo dell'aula
            else:
                if exam_id_to_exclude:
                    cursor.execute("""
                        SELECT COUNT(*) FROM esami 
                        WHERE aula = %s AND data_appello = %s AND periodo = %s AND id != %s
                    """, (aula, data_appello, periodo, exam_id_to_exclude))
                else:
                    cursor.execute("""
                        SELECT COUNT(*) FROM esami 
                        WHERE aula = %s AND data_appello = %s AND periodo = %s
                    """, (aula, data_appello, periodo))
                
                if cursor.fetchone()[0] > 0:
                    cursor.close()
                    release_connection(conn)
                    return False, f'Aula {aula} già occupata in questo periodo per la data {data_appello}'
        
        # Controllo vincolo 14 giorni per ogni insegnamento
        if mostra_nel_calendario:
            for insegnamento in insegnamenti:
                cursor.execute("SELECT id, titolo FROM insegnamenti WHERE codice = %s", (insegnamento,))
                result = cursor.fetchone()
                if not result:
                    cursor.close()
                    release_connection(conn)
                    return False, f"Insegnamento {insegnamento} non trovato"
                
                insegnamento_id, titolo_insegnamento = result
                
                # Verifica esistenza insegnamento per l'anno
                cursor.execute("""
                    SELECT ic.cds FROM insegnamenti_cds ic
                    WHERE ic.insegnamento = %s AND ic.anno_accademico = %s
                """, (insegnamento_id, anno_accademico))
                
                if not cursor.fetchone():
                    cursor.close()
                    release_connection(conn)
                    return False, f"Insegnamento {titolo_insegnamento} non trovato per l'anno accademico {anno_accademico}"
                
                # Controllo 14 giorni
                data_min = data_esame - timedelta(days=13)
                data_max = data_esame + timedelta(days=13)
                
                if exam_id_to_exclude:
                    cursor.execute("""
                        SELECT data_appello FROM esami e
                        WHERE e.insegnamento = %s 
                        AND e.data_appello BETWEEN %s AND %s
                        AND e.id != %s 
                        AND e.mostra_nel_calendario = TRUE
                    """, (insegnamento_id, data_min, data_max, exam_id_to_exclude))
                else:
                    cursor.execute("""
                        SELECT data_appello FROM esami e
                        WHERE e.insegnamento = %s 
                        AND e.data_appello BETWEEN %s AND %s
                        AND e.mostra_nel_calendario = TRUE
                    """, (insegnamento_id, data_min, data_max))
                
                esami_vicini = cursor.fetchall()
                if esami_vicini:
                    date_esami = [e[0].strftime('%d/%m/%Y') for e in esami_vicini]
                    cursor.close()
                    release_connection(conn)
                    return False, f"Vincolo 14 giorni violato per {titolo_insegnamento} il {data_appello}. Esami esistenti: {', '.join(date_esami)}"
    
    cursor.close()
    release_connection(conn)
    return True, None

def inserisciEsami(dati_esame):
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
            insegnamento_id, titolo_insegnamento = result
            
            # Ottieni info CDS
            cursor.execute("""
                SELECT cds, curriculum FROM insegnamenti_cds 
                WHERE insegnamento = %s AND anno_accademico = %s LIMIT 1
            """, (insegnamento_id, anno_accademico))
            
            cds_info = cursor.fetchone()
            cds, curriculum = cds_info
            
            # Inserimento
            cursor.execute("""
                INSERT INTO esami 
                (docente, insegnamento, aula, data_appello, ora_appello, 
                 data_inizio_iscrizione, data_fine_iscrizione, tipo_esame, 
                 verbalizzazione, descrizione, note_appello, tipo_appello, 
                 definizione_appello, gestione_prenotazione, riservato, 
                 tipo_iscrizione, periodo, durata_appello, cds, anno_accademico, 
                 curriculum, mostra_nel_calendario)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                docente, insegnamento_id, sezione['aula'], sezione['data_appello'],
                sezione['ora_appello'], sezione['inizio_iscrizione'], sezione['fine_iscrizione'],
                sezione['tipo_esame'], sezione['verbalizzazione'], sezione['descrizione'],
                sezione['note_appello'], sezione['tipo_appello'], sezione['definizione_appello'],
                sezione['gestione_prenotazione'], sezione['riservato'], sezione['tipo_iscrizione'],
                sezione['periodo'], sezione['durata_appello'], cds, anno_accademico,
                curriculum, sezione['mostra_nel_calendario']
            ))
            
            esami_inseriti.append(f"{titolo_insegnamento} - {sezione['data_appello']}")
    
    conn.commit()
    cursor.close()
    release_connection(conn)
    return esami_inseriti

# ================== Endpoints API ==================

@exam_bp.route('/api/inserisciEsame', methods=['POST'])
@require_auth
def inserisciEsame():
    """API per inserire esami nel database."""
    username = session.get('username')
    
    # Verifica permessi admin per bypass
    is_admin = session.get('permessi_admin', False) or get_user_admin_status(username)
    bypass_checks = request.form.get('bypass_checks', 'false').lower() == 'true'
    
    # Raccolta e validazione dati
    dati_esame = generaDatiEsame()
    if "status" in dati_esame and dati_esame["status"] == "error":
        return jsonify(dati_esame), 400
    
    # Bypass controlli se admin
    if is_admin and bypass_checks:
        esami_inseriti = inserisciEsami(dati_esame)
        return jsonify({
            'status': 'success',
            'message': 'Esami inseriti con successo (controlli bypassati)',
            'inserted': esami_inseriti
        }), 200
    
    # Controlli vincoli
    vincoli_ok, errore_vincoli = controllaVincoli(dati_esame)
    if not vincoli_ok:
        return jsonify({'status': 'error', 'message': errore_vincoli}), 400
    
    # Inserimento
    esami_inseriti = inserisciEsami(dati_esame)
    return jsonify({
        'status': 'success',
        'message': 'Tutti gli esami sono stati inseriti con successo',
        'inserted': esami_inseriti
    }), 200

@exam_bp.route('/api/getEsameById', methods=['GET'])
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
               AND e.curriculum = c.curriculum
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

@exam_bp.route('/api/updateEsame', methods=['POST'])
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
                'aula': data.get('aula'),
                'periodo': data.get('periodo'),
                'mostra_nel_calendario': data.get('mostra_nel_calendario', True)
            }],
            'anno_accademico': esame_dict['anno_accademico']
        }

        # Controllo vincoli passando l'aula originale
        vincoli_ok, errore = controllaVincoli(dati_controllo, aula_originale=esame_dict['aula'])
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

@exam_bp.route('/api/deleteEsame', methods=['POST'])
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