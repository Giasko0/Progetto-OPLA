from flask import Blueprint, request, jsonify, session
from datetime import datetime, timedelta, date, time
import traceback
from db import get_db_connection, release_connection
from auth import require_auth
from utils.sessions import ottieni_intersezione_sessioni_docente, ottieni_vacanze, escludi_vacanze_da_sessioni

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

def get_user_admin_status(username):
    """Ottiene lo status admin dell'utente dal database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT permessi_admin FROM utenti WHERE username = %s", (username,))
    result = cursor.fetchone()
    cursor.close()
    release_connection(conn)
    return bool(result and result[0])

def get_titolare_per_insegnamento(insegnamento_id, anno_accademico, docente_fallback):
    """Ottiene il docente titolare per un singolo insegnamento dato l'id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Trova il docente titolare
        cursor.execute("""
            SELECT u.username 
            FROM insegnamenti_cds ic
            JOIN utenti u ON ic.titolare = u.matricola
            WHERE ic.insegnamento = %s AND ic.anno_accademico = %s
            LIMIT 1
        """, (insegnamento_id, anno_accademico))
        titolare_result = cursor.fetchone()
        if titolare_result:
            return titolare_result[0]
        else:
            return docente_fallback  # Se non c'è titolare, usa fallback
    finally:
        cursor.close()
        release_connection(conn)

def is_date_in_session(data_appello, docente, anno_accademico):
    """Verifica se la data dell'appello è all'interno di una sessione valida per il docente."""
    try:
        # Ottieni le sessioni del docente (con intersezione tra CdS)
        sessioni = ottieni_intersezione_sessioni_docente(docente, anno_accademico)
        
        if not sessioni:
            return False
        
        # Ottieni le vacanze per l'anno accademico
        vacanze = ottieni_vacanze(anno_accademico)
        
        # Escludi le vacanze dalle sessioni
        sessioni_valide = escludi_vacanze_da_sessioni(sessioni, vacanze)
        
        # Controlla se la data è all'interno di almeno una sessione valida
        for sessione in sessioni_valide:
            if sessione['inizio'] <= data_appello <= sessione['fine']:
                return True
        
        return False
        
    except Exception as e:
        return False


# ================== Funzioni per la gestione dei dati degli esami ==================

def genera_dati_esame():
    """Raccoglie i dati dal form modulare e li valida."""
    data = request.form
    docente_form = data.get('docente')  # Docente dal form (potrebbe essere admin)
    
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
        if not all([date_appello[i], ore_h[i], ore_m[i]]):
            continue
            
        # Costruzione sezione - validazioni delegate a controlla_vincoli
        data_esame = datetime.fromisoformat(date_appello[i])
        ora_int = int(ore_h[i])
        durata_appello = int(durate[i]) if i < len(durate) and durate[i] and durate[i].strip() else None
        sezione = {
            'descrizione': descrizioni[i],
            'data_appello': date_appello[i],
            'ora_appello': f"{ore_h[i]}:{ore_m[i]}",
            'durata_appello': durata_appello,
            'aula': aule[i] if i < len(aule) and aule[i] else None,
            'periodo': 1 if ora_int >= 13 else 0,
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
        'docente': docente_form,
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
    
    # Carica aule valide per validazione
    cursor.execute("SELECT nome FROM aule")
    aule_valide = {row[0] for row in cursor.fetchall()}
    
    # Estrai parametri principali
    insegnamenti = dati_esame['insegnamenti']
    sezioni_appelli = dati_esame['sezioni_appelli']
    anno_accademico = dati_esame['anno_accademico']
    docente_form = dati_esame.get('docente')
    exam_id_to_exclude = dati_esame.get('exam_id')
    
    # Determina se è admin
    is_admin = get_user_admin_status(docente_form)
    
    for sezione in sezioni_appelli:
        data_appello = sezione['data_appello']
        aula = sezione['aula']
        periodo = sezione['periodo']
        mostra_nel_calendario = sezione['mostra_nel_calendario']
        data_esame = datetime.fromisoformat(data_appello)
        
        # CONTROLLO SESSIONI: Verifica che la data sia all'interno di una sessione valida
        # ECCEZIONE: Permetti prove parziali non ufficiali fuori dalle sessioni
        for insegnamento_id in insegnamenti:
            docente_esame = docente_form if not is_admin else get_titolare_per_insegnamento(
                insegnamento_id, anno_accademico, docente_form
            )
            
            # Controlla se è una prova parziale non ufficiale (PP + mostra_nel_calendario = False)
            is_prova_parziale_non_ufficiale = (
                sezione.get('tipo_appello') == 'PP' and 
                not sezione.get('mostra_nel_calendario', True)
            )
            
            # Permetti prove parziali non ufficiali fuori dalle sessioni
            if not is_prova_parziale_non_ufficiale and not is_date_in_session(data_esame.date(), docente_esame, anno_accademico):
                cursor.close()
                release_connection(conn)
                return False, f'La data {data_appello} non è all\'interno di una sessione valida per l\'insegnamento {insegnamento_id}'
        
        # Controllo weekend
        if data_esame.weekday() >= 5:
            cursor.close()
            release_connection(conn)
            return False, f'Non è possibile inserire esami nel weekend: {data_appello}'
        
        # Controllo aula valida (solo se specificata)
        if aula and aula not in aule_valide:
            cursor.close()
            release_connection(conn)
            return False, f'Aula non valida: {aula}'
        
        # Controllo orario valido (8-18)
        ora_appello = sezione.get('ora_appello')
        if ora_appello:
            try:
                ora_h = int(ora_appello.split(':')[0])
                if ora_h < 8 or ora_h > 18:
                    cursor.close()
                    release_connection(conn)
                    return False, f'Orario non valido: {ora_appello}. Deve essere tra le 08:00 e le 18:00'
            except (ValueError, IndexError):
                cursor.close()
                release_connection(conn)
                return False, f'Formato orario non valido: {ora_appello}'
        
        # Controllo durata valida (opzionale, se specificata deve essere valida)
        durata_appello = sezione.get('durata_appello')
        if durata_appello is not None and durata_appello != '':
            try:
                durata = int(durata_appello)
                if durata < 30 or durata > 720:
                    cursor.close()
                    release_connection(conn)
                    return False, f'Durata non valida: {durata} minuti. Deve essere tra 30 e 720 minuti'
            except (ValueError, TypeError):
                cursor.close()
                release_connection(conn)
                return False, f'Formato durata non valido: {durata_appello}'
        
        # Per ogni insegnamento, controlla se la data cade in sessione anticipata e se è secondo semestre
        for insegnamento in insegnamenti:
            # Ottieni ID insegnamento
            cursor.execute("SELECT id, titolo FROM insegnamenti WHERE id = %s", (insegnamento,))
            result = cursor.fetchone()
            if not result:
                cursor.close()
                release_connection(conn)
                return False, f'Insegnamento {insegnamento_id} non trovato'
            insegnamento_id, titolo_insegnamento = result

            # CONTROLLO SESSIONI AGGIUNTIVO: Verifica che la data sia nelle sessioni specifiche dell'insegnamento
            # Solo se non è una prova parziale non ufficiale
            is_prova_parziale_non_ufficiale = (
                sezione.get('tipo_appello') == 'PP' and 
                not sezione.get('mostra_nel_calendario', True)
            )
            
            if not is_prova_parziale_non_ufficiale and not is_date_in_session(data_esame.date(), docente_esame, anno_accademico):
                cursor.close()
                release_connection(conn)
                return False, f'La data {data_appello} non è all\'interno di una sessione valida per l\'insegnamento {titolo_insegnamento}'

            # Ottieni info insegnamento_cds (serve semestre)
            cursor.execute("""
                SELECT semestre FROM insegnamenti_cds 
                WHERE insegnamento = %s AND anno_accademico = %s LIMIT 1
            """, (insegnamento_id, anno_accademico))
            cds_info = cursor.fetchone()
            if not cds_info:
                cursor.close()
                release_connection(conn)
                return False, f'Insegnamento {titolo_insegnamento} non trovato per l\'anno accademico {anno_accademico}'
            semestre = cds_info[0]

            # CONTROLLO SESSIONE INVERNALE: Verifica validità per anno successivo se necessario
            # Controlla se la data cade in una sessione invernale
            cursor.execute("""
                SELECT tipo_sessione FROM sessioni 
                WHERE cds IN (
                    SELECT cds FROM insegnamenti_cds WHERE insegnamento = %s AND anno_accademico = %s
                )
                AND anno_accademico = %s
                AND %s BETWEEN inizio AND fine
                AND tipo_sessione = 'invernale'
                LIMIT 1
            """, (insegnamento_id, anno_accademico, anno_accademico, data_esame.date()))
            
            sessione_invernale = cursor.fetchone()

            # Controlla se la data cade in una sessione anticipata
            cursor.execute("""
                SELECT inizio, fine FROM sessioni 
                WHERE cds IN (
                    SELECT cds FROM insegnamenti_cds WHERE insegnamento = %s AND anno_accademico = %s
                )
                AND anno_accademico = %s
                AND tipo_sessione = 'anticipata'
            """, (insegnamento_id, anno_accademico, anno_accademico))
            sessioni_anticipate = cursor.fetchall()
            for inizio, fine in sessioni_anticipate:
                if inizio and fine and inizio <= data_esame.date() <= fine:
                    # Blocca inseriemento appelli ufficiali se insegnamento è 2° sem o annuale
                    if (semestre == 2 or semestre == 3) and mostra_nel_calendario:
                        cursor.close()
                        release_connection(conn)
                        return False, f"Non è possibile inserire esami con 'Appello ufficiale' nella sessione anticipata per l'insegnamento '{titolo_insegnamento}' (secondo semestre/annuale)."

        # Controllo weekend
        if data_esame.weekday() >= 5:
            cursor.close()
            release_connection(conn)
            return False, f'Non è possibile inserire esami nel weekend: {data_appello}'

        # Controllo weekend
        if data_esame.weekday() >= 5:
            cursor.close()
            release_connection(conn)
            return False, f'Non è possibile inserire esami nel weekend: {data_appello}'
        
        # Controllo vincoli per insegnamento (solo se mostra nel calendario)
        if mostra_nel_calendario:
            for insegnamento in insegnamenti:
                # Ottieni ID insegnamento
                cursor.execute("SELECT id, titolo FROM insegnamenti WHERE id = %s", (insegnamento,))
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
                
                # Controllo esame stesso giorno
                cursor.execute("""
                    SELECT data_appello FROM esami 
                    WHERE insegnamento = %s AND anno_accademico = %s 
                    AND mostra_nel_calendario = true
                    AND data_appello = %s::date
                """ + (" AND id != %s" if exam_id_to_exclude else ""),
                [insegnamento_id, anno_accademico, data_appello] + 
                ([exam_id_to_exclude] if exam_id_to_exclude else []))
                
                same_day_exams = cursor.fetchall()
                
                if same_day_exams:
                    cursor.close()
                    release_connection(conn)
                    return False, f'Esiste già un esame lo stesso giorno ({data_appello}) per l\'insegnamento {titolo_insegnamento}'
                
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
        
        # Controllo conflitti aula (salta se studio docente, stessa aula originale, o aula non specificata)
        if aula and aula != "Studio docente DMI" and aula != aula_originale:
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
    
    cursor.close()
    release_connection(conn)
    return True, None

def inserisci_esami(dati_esame):
    """Inserisce tutti gli esami nel database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    esami_inseriti = []
    insegnamenti = dati_esame['insegnamenti']
    docente_form = dati_esame['docente']
    sezioni_appelli = dati_esame['sezioni_appelli']
    anno_accademico = dati_esame['anno_accademico']
    
    # Determina se è admin
    is_admin = get_user_admin_status(docente_form)
    
    for sezione in sezioni_appelli:
        for insegnamento_codice in insegnamenti:
            # Determina il docente specifico per questo insegnamento
            docente_esame = docente_form if not is_admin else get_titolare_per_insegnamento(
                insegnamento_codice, anno_accademico, docente_form
            )
            
            # Ottieni ID insegnamento
            cursor.execute("SELECT id, titolo FROM insegnamenti WHERE id = %s", (insegnamento_codice,))
            result = cursor.fetchone()
            if not result:
                continue
                
            insegnamento_id, titolo_insegnamento = result
            
            # Ottieni info CdS
            cursor.execute("""
                SELECT cds, curriculum_codice, anno_corso FROM insegnamenti_cds 
                WHERE insegnamento = %s AND anno_accademico = %s LIMIT 1
            """, (insegnamento_id, anno_accademico))
            
            cds_info = cursor.fetchone()
            if not cds_info:
                continue
                
            cds, curriculum_codice, anno_corso = cds_info
            
            # Verifica se è sessione invernale e primo semestre/annuale
            data_esame = datetime.strptime(sezione['data_appello'], '%Y-%m-%d').date()
            
            # Ottieni info sul semestre
            cursor.execute("""
                SELECT semestre FROM insegnamenti_cds 
                WHERE insegnamento = %s AND anno_accademico = %s LIMIT 1
            """, (insegnamento_id, anno_accademico))
            semestre_info = cursor.fetchone()
            semestre = semestre_info[0] if semestre_info else None
            
            # Controlla se è sessione invernale
            cursor.execute("""
                SELECT tipo_sessione FROM sessioni 
                WHERE cds = %s AND anno_accademico = %s AND curriculum_codice = %s
                AND %s BETWEEN inizio AND fine
                AND tipo_sessione = 'invernale'
                LIMIT 1
            """, (cds, anno_accademico, curriculum_codice, data_esame))
            
            sessione_invernale = cursor.fetchone()
            
            # Inserimento principale
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
                docente_esame, insegnamento_id, sezione['aula'], sezione['data_appello'],
                sezione['ora_appello'], sezione['inizio_iscrizione'], sezione['fine_iscrizione'],
                sezione['tipo_esame'], sezione['verbalizzazione'], sezione['descrizione'],
                sezione['note_appello'], sezione['tipo_appello'], sezione['definizione_appello'],
                sezione['gestione_prenotazione'], sezione['riservato'], sezione['tipo_iscrizione'],
                sezione['periodo'], sezione['durata_appello'], cds, anno_accademico,
                curriculum_codice, sezione['mostra_nel_calendario']
            ))
            
            esami_inseriti.append(f"{titolo_insegnamento} - {sezione['data_appello']} (Docente: {docente_esame})")
    
    conn.commit()
    cursor.close()
    release_connection(conn)
    return esami_inseriti

# ================== Endpoints API ==================

@exam_bp.route('/api/inserisci-esame', methods=['POST'])
@require_auth
def inserisci_esame():
    """API per inserire esami nel database."""
    try:
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
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Errore durante l\'inserimento degli esami: {str(e)}'}), 500

@exam_bp.route('/api/get-esame-by-id', methods=['GET'])
@require_auth
def get_esame_by_id():
    """Recupera i dettagli di un esame specifico per ID."""
    try:
        exam_id = request.args.get('id')
        if not exam_id:
            return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        username = session.get('username', '')
        is_admin = session.get('permessi_admin', False) or get_user_admin_status(username)
        
        cursor.execute("""
        SELECT e.*, i.titolo AS insegnamento_titolo, i.codice AS insegnamento_codice,
               c.nome_corso AS cds_nome, e.cds AS cds_codice, 
               CONCAT(u.nome, ' ', u.cognome) AS docente_nome_completo
        FROM esami e
        JOIN insegnamenti i ON e.insegnamento = i.id
        JOIN utenti u ON e.docente = u.username
        JOIN cds c ON e.cds = c.codice AND e.anno_accademico = c.anno_accademico 
                   AND e.curriculum_codice = c.curriculum_codice
        WHERE e.id = %s
        """, (exam_id,))
        
        esame = cursor.fetchone()
        if not esame:
            cursor.close()
            release_connection(conn)
            return jsonify({'success': False, 'message': 'Esame non trovato nel database'}), 404

        # Converti in dizionario
        columns = [desc[0] for desc in cursor.description]
        esame_dict = dict(zip(columns, esame))

        # Controllo permessi - ora distinguiamo tra modifica e sola lettura
        has_edit_permissions = check_user_permissions(esame_dict['docente'], username, is_admin)
        
        # Controllo modificabilità (solo se ha i permessi)
        can_modify = has_edit_permissions
        
        # Imposta le modalità
        esame_dict['can_modify'] = can_modify
        esame_dict['has_edit_permissions'] = has_edit_permissions
        esame_dict['is_read_only'] = not has_edit_permissions
        esame_dict['is_edit_mode'] = has_edit_permissions
        esame_dict['edit_id'] = exam_id
        
        # Messaggi informativi
        if not has_edit_permissions:
            esame_dict['message'] = "Visualizzazione in sola lettura - Non hai i permessi per modificare questo esame"
        elif not can_modify:
            esame_dict['message'] = "L'esame non può essere modificato (meno di 7 giorni)"
        else:
            esame_dict['message'] = ""

        # Serializza per JSON
        for key, value in esame_dict.items():
            esame_dict[key] = serialize_for_json(value)

        cursor.close()
        release_connection(conn)
        return jsonify({'success': True, 'esame': esame_dict})
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Errore durante il caricamento dell\'esame: {str(e)}'}), 500

@exam_bp.route('/api/update-esame', methods=['POST'])
@require_auth
def update_esame():
    """Aggiorna un esame esistente."""
    try:
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

        if not bypass_checks:
            insegnamento_id = esame_dict['insegnamento']
            nuova_data_obj = datetime.strptime(data.get('data_appello'), '%Y-%m-%d')
            docente_per_sessioni = esame_dict['docente'] if is_admin else username
            
            is_prova_parziale_non_ufficiale = (
                data.get('tipo_appello') == 'PP' and 
                not data.get('mostra_nel_calendario', True)
            )
            
            if not is_prova_parziale_non_ufficiale and not is_date_in_session(nuova_data_obj.date(), docente_per_sessioni, esame_dict['anno_accademico']):
                cursor.close()
                release_connection(conn)
                return jsonify({'success': False, 'message': f'La data {data.get("data_appello")} non è all\'interno di una sessione valida'}), 400

            dati_controllo = {
                'exam_id': exam_id,
                'insegnamenti': [insegnamento_id],
                'docente': username,
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

            vincoli_ok, errore = controlla_vincoli(dati_controllo, aula_originale=esame_dict['aula'])
            if not vincoli_ok:
                cursor.close()
                release_connection(conn)
                return jsonify({'success': False, 'message': errore}), 400

        aula_value = data.get('aula')
        if aula_value is not None and aula_value.strip() == '':
            aula_value = None

        vecchia_data = esame_dict['data_appello']
        vecchio_periodo = esame_dict['periodo']
        nuova_data = datetime.strptime(data.get('data_appello'), '%Y-%m-%d').date()
        nuovo_periodo = data.get('periodo')
        vecchio_mostra_calendario = esame_dict['mostra_nel_calendario']
        nuovo_mostra_calendario = data.get('mostra_nel_calendario', True)
        
        # Aggiornamento esame
        cursor.execute("""
        UPDATE esami SET
            descrizione = %s, tipo_appello = %s, aula = %s, data_appello = %s,
            data_inizio_iscrizione = %s, data_fine_iscrizione = %s, ora_appello = %s,
            durata_appello = %s, periodo = %s, verbalizzazione = %s,
            tipo_esame = %s, note_appello = %s, mostra_nel_calendario = %s
        WHERE id = %s
        """, (
            data.get('descrizione'), data.get('tipo_appello'), aula_value,
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
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Errore durante l\'aggiornamento dell\'esame: {str(e)}'}), 500

@exam_bp.route('/api/delete-esame', methods=['POST'])
@require_auth
def delete_esame():
    """Elimina un esame esistente."""
    try:
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
        # Eliminazione esame
        cursor.execute("DELETE FROM esami WHERE id = %s", (exam_id,))
        conn.commit()
        
        cursor.close()
        release_connection(conn)
        
        return jsonify({'success': True, 'message': 'Esame eliminato con successo'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Errore durante l\'eliminazione dell\'esame: {str(e)}'}), 500