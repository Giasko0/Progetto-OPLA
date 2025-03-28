from flask import Blueprint, request, jsonify, session
from datetime import datetime, timedelta, date, time
import psycopg2
import json
import os
from db import get_db_connection, release_connection
from auth import login_required

exam_bp = Blueprint('exam_bp', __name__)

# Funzione helper per la serializzazione JSON di tipi Python
def serialize_for_json(obj):
    """
    Converte tipi Python non serializzabili in JSON (date, time, datetime) in stringhe.
    """
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif isinstance(obj, time):
        return obj.strftime('%H:%M:%S')
    elif isinstance(obj, timedelta):
        return str(obj)
    return obj

@exam_bp.route('/api/getEsameById', methods=['GET'])
@login_required
def get_esame_by_id():
    """
    Recupera i dettagli di un esame specifico per ID.
    Verifica se l'utente è autorizzato a modificare l'esame.
    """
    conn = None
    try:
        exam_id = request.args.get('id')
        if not exam_id:
            return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Ottieni username e permessi admin dai cookie invece che dalla sessione
        is_admin = False
        if 'admin' in request.cookies and request.cookies.get('admin') == 'true':
            is_admin = True
        
        username = ""
        if 'username' in request.cookies:
            username = request.cookies.get('username', '').strip()
        
        # Query per ottenere i dettagli dell'esame con informazioni aggiuntive
        query = """
        SELECT e.*, i.titolo AS insegnamento_titolo, i.codice AS insegnamento_codice,
               c.nome_corso AS cds_nome
        FROM esami e
        JOIN insegnamenti i ON e.insegnamento = i.id
        JOIN cds c ON e.cds = c.codice AND e.anno_accademico = c.anno_accademico AND e.curriculum = c.curriculum
        WHERE e.id = %s
        """
        cursor.execute(query, (exam_id,))
        esame = cursor.fetchone()

        if not esame:
            return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

        # Converti la riga in un dizionario
        columns = [desc[0] for desc in cursor.description]
        esame_dict = dict(zip(columns, esame))

        # Assicuriamoci che il campo docente sia pulito
        docente_esame = esame_dict['docente'].strip() if esame_dict['docente'] else ''

        # Debug avanzato per diagnosticare il problema
        print(f"GET ESAME - Confronto autenticazione:")
        print(f"Username dal cookie: '{username}' (tipo: {type(username)})")
        print(f"Docente dell'esame: '{docente_esame}' (tipo: {type(docente_esame)})")
        print(f"Admin: {is_admin}")
        print(f"Confronto diretto: {username == docente_esame}")
        print(f"Confronto case-insensitive: {username.lower() == docente_esame.lower()}")
        
        # Verifica i permessi: solo il docente che ha creato l'esame o gli admin possono modificarlo
        # Utilizziamo un confronto case-insensitive per essere più tolleranti
        if not is_admin and (username.lower() != docente_esame.lower()):
            error_msg = f"Non hai i permessi per modificare questo esame. Utente: '{username}', Docente: '{docente_esame}'"
            print(f"ERRORE PERMESSI: {error_msg}")
            return jsonify({'success': False, 'message': error_msg}), 403

        # Verifica se l'esame può essere modificato (almeno 7 giorni nel futuro)
        today = datetime.now().date()
        exam_date = esame_dict['data_appello']
        
        can_modify = (exam_date - today).days >= 7

        # Aggiunge l'informazione se l'esame può essere modificato
        esame_dict['can_modify'] = can_modify
        esame_dict['message'] = "" if can_modify else "L'esame non può essere modificato perché è a meno di 7 giorni dalla data attuale"

        # Aggiunge flag esplicito per modalità modifica
        esame_dict['is_edit_mode'] = True
        esame_dict['edit_id'] = exam_id

        cursor.close()
        
        # Serializza tutti i tipi di dati non serializzabili direttamente in JSON
        for key, value in esame_dict.items():
            esame_dict[key] = serialize_for_json(value)

        return jsonify({'success': True, 'esame': esame_dict})

    except Exception as e:
        print(f"Errore in get_esame_by_id: {str(e)}")
        return jsonify({'success': False, 'message': f'Errore durante il recupero dell\'esame: {str(e)}'}), 500
    finally:
        if conn:
            release_connection(conn)

@exam_bp.route('/api/updateEsame', methods=['POST'])
@login_required
def update_esame():
    """
    Aggiorna un esame esistente.
    Verifica che l'utente sia autorizzato a modificarlo e che la nuova data non sia anticipata.
    """
    conn = None
    try:
        data = request.get_json()
        exam_id = data.get('id')

        if not exam_id:
            return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Ottieni username e permessi admin dai cookie invece che dalla sessione
        is_admin = False
        if 'admin' in request.cookies and request.cookies.get('admin') == 'true':
            is_admin = True
        
        username = ""
        if 'username' in request.cookies:
            username = request.cookies.get('username', '').strip()

        # Ottieni i dettagli dell'esame esistente
        cursor.execute("SELECT * FROM esami WHERE id = %s", (exam_id,))
        esame_esistente = cursor.fetchone()

        if not esame_esistente:
            return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

        # Converti la riga in un dizionario
        columns = [desc[0] for desc in cursor.description]
        esame_dict = dict(zip(columns, esame_esistente))

        # Assicuriamoci che il campo docente sia pulito
        docente_esame = esame_dict['docente'].strip() if esame_dict['docente'] else ''

        # Debug avanzato per diagnosticare il problema
        print(f"UPDATE ESAME - Confronto autenticazione:")
        print(f"Username dal cookie: '{username}' (tipo: {type(username)})")
        print(f"Docente dell'esame: '{docente_esame}' (tipo: {type(docente_esame)})")
        print(f"Admin: {is_admin}")
        print(f"Confronto diretto: {username == docente_esame}")
        print(f"Confronto case-insensitive: {username.lower() == docente_esame.lower()}")
        
        # Verifica i permessi: solo il docente che ha creato l'esame o gli admin possono modificarlo
        # Utilizziamo un confronto case-insensitive per essere più tolleranti
        if not is_admin and (username.lower() != docente_esame.lower()):
            error_msg = f"Non hai i permessi per modificare questo esame. Utente: '{username}', Docente: '{docente_esame}'"
            print(f"ERRORE PERMESSI UPDATE: {error_msg}")
            return jsonify({'success': False, 'message': error_msg}), 403

        # Verifica se l'esame può essere modificato (almeno 7 giorni nel futuro)
        today = datetime.now().date()
        exam_date = esame_dict['data_appello']
        
        if (exam_date - today).days < 7:
            return jsonify({'success': False, 'message': 'L\'esame non può essere modificato perché è a meno di 7 giorni dalla data attuale'}), 400

        # Verifica che la nuova data non sia anticipata rispetto alla data originale
        nuova_data_appello = datetime.strptime(data.get('data_appello'), '%Y-%m-%d').date()
        if nuova_data_appello < exam_date:
            return jsonify({'success': False, 'message': 'La nuova data non può essere anticipata rispetto alla data originale'}), 400

        # Prepara l'aggiornamento
        update_query = """
        UPDATE esami SET
            descrizione = %s,
            tipo_appello = %s,
            aula = %s,
            data_appello = %s,
            data_inizio_iscrizione = %s,
            data_fine_iscrizione = %s,
            ora_appello = %s,
            durata_appello = %s,
            periodo = %s,
            verbalizzazione = %s,
            definizione_appello = %s,
            gestione_prenotazione = %s,
            riservato = %s,
            tipo_iscrizione = %s,
            tipo_esame = %s,
            condizione_sql = %s,
            partizionamento = %s,
            partizione = %s,
            note_appello = %s,
            posti = %s,
            codice_turno = %s
        WHERE id = %s
        RETURNING id
        """

        params = (
            data.get('descrizione'),
            data.get('tipo_appello'),
            data.get('aula'),
            data.get('data_appello'),
            data.get('data_inizio_iscrizione'),
            data.get('data_fine_iscrizione'),
            data.get('ora_appello'),
            data.get('durata_appello'),
            data.get('periodo'),
            data.get('verbalizzazione'),
            data.get('definizione_appello'),
            data.get('gestione_prenotazione'),
            data.get('riservato', False),
            data.get('tipo_iscrizione'),
            data.get('tipo_esame'),
            data.get('condizione_sql'),
            data.get('partizionamento'),
            data.get('partizione'),
            data.get('note_appello'),
            data.get('posti'),
            data.get('codice_turno'),
            exam_id
        )

        cursor.execute(update_query, params)
        updated_id = cursor.fetchone()[0]
        
        conn.commit()
        cursor.close()

        return jsonify({
            'success': True,
            'message': 'Esame aggiornato con successo',
            'id': updated_id
        })

    except Exception as e:
        print(f"Errore in update_esame: {str(e)}")
        return jsonify({'success': False, 'message': f'Errore durante l\'aggiornamento dell\'esame: {str(e)}'}), 500
    finally:
        if conn:
            release_connection(conn)

@exam_bp.route('/api/deleteEsame', methods=['POST'])
@login_required
def delete_esame():
    """
    Elimina un esame esistente.
    Verifica che l'utente sia autorizzato a eliminarlo.
    """
    conn = None
    try:
        data = request.get_json()
        exam_id = data.get('id')

        if not exam_id:
            return jsonify({'success': False, 'message': 'ID esame non fornito'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Ottieni username e permessi admin dai cookie invece che dalla sessione
        is_admin = False
        if 'admin' in request.cookies and request.cookies.get('admin') == 'true':
            is_admin = True
        
        username = ""
        if 'username' in request.cookies:
            username = request.cookies.get('username', '').strip()

        # Ottieni i dettagli dell'esame esistente
        cursor.execute("SELECT * FROM esami WHERE id = %s", (exam_id,))
        esame_esistente = cursor.fetchone()

        if not esame_esistente:
            return jsonify({'success': False, 'message': 'Esame non trovato'}), 404

        # Converti la riga in un dizionario
        columns = [desc[0] for desc in cursor.description]
        esame_dict = dict(zip(columns, esame_esistente))

        # Assicuriamoci che il campo docente sia pulito
        docente_esame = esame_dict['docente'].strip() if esame_dict['docente'] else ''

        # Debug avanzato per diagnosticare il problema
        print(f"DELETE ESAME - Confronto autenticazione:")
        print(f"Username dal cookie: '{username}' (tipo: {type(username)})")
        print(f"Docente dell'esame: '{docente_esame}' (tipo: {type(docente_esame)})")
        print(f"Admin: {is_admin}")
        print(f"Confronto diretto: {username == docente_esame}")
        print(f"Confronto case-insensitive: {username.lower() == docente_esame.lower()}")

        # Verifica i permessi: solo il docente che ha creato l'esame o gli admin possono eliminarlo
        # Utilizziamo un confronto case-insensitive per essere più tolleranti
        if not is_admin and (username.lower() != docente_esame.lower()):
            error_msg = f"Non hai i permessi per eliminare questo esame. Utente: '{username}', Docente: '{docente_esame}'"
            print(f"ERRORE PERMESSI DELETE: {error_msg}")
            return jsonify({'success': False, 'message': error_msg}), 403

        # Verifica se l'esame può essere eliminato (almeno 7 giorni nel futuro)
        today = datetime.now().date()
        exam_date = esame_dict['data_appello']
        
        if (exam_date - today).days < 7:
            return jsonify({'success': False, 'message': 'L\'esame non può essere eliminato perché è a meno di 7 giorni dalla data attuale'}), 400

        # Elimina l'esame
        cursor.execute("DELETE FROM esami WHERE id = %s", (exam_id,))
        
        conn.commit()
        cursor.close()

        return jsonify({
            'success': True,
            'message': 'Esame eliminato con successo'
        })

    except Exception as e:
        print(f"Errore in delete_esame: {str(e)}")
        return jsonify({'success': False, 'message': f'Errore durante l\'eliminazione dell\'esame: {str(e)}'}), 500
    finally:
        if conn:
            release_connection(conn)
