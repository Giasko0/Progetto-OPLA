from flask import Blueprint, render_template, request, redirect, make_response, jsonify
from db import get_db_connection
import io
import csv
from datetime import datetime

admin_bp = Blueprint('admin', __name__, url_prefix='/flask/admin')

@admin_bp.route('/')
def admin_login():
    if 'admin' in request.cookies:
        return redirect('/flask/admin/dashboard')
    return render_template('pannello-issa/login.html')

@admin_bp.route('/dashboard')
def admin_dashboard():
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
    return render_template('pannello-issa/dashboard.html')

@admin_bp.route('/auth', methods=['POST'])
def admin_auth():
    username = request.form.get('username')
    password = request.form.get('password')
    
    if username == "Admin" and password == "admin":
        response = redirect('/flask/admin/dashboard')
        response.set_cookie('admin', 'true')
        return response
    return redirect('/flask/admin')

@admin_bp.route('/logout')
def admin_logout():
    response = redirect('/flask/admin')
    response.delete_cookie('admin')
    return response

@admin_bp.route('/downloadCsv')
def download_csv():
    if 'admin' not in request.cookies:
        return redirect('/flask/admin')
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Ottieni tutti gli esami ordinati per data
        cursor.execute("""
            SELECT e.insegnamento, e.docente, e.dataora
            FROM esami e
            ORDER BY e.insegnamento, e.dataora
        """)
        esami = cursor.fetchall()

        # Crea il file CSV in memoria
        output = io.StringIO()
        writer = csv.writer(output)

        # Header CSV
        writer.writerow([
            'Tipo appello', 'Anno', 'CDS', 'AD', 'Des. Appello', 'Data Appello (gg/mm/yyyy)',
            'Data inizio iscr. (gg/mm/yyyy)', 'Data Fine iscr. (gg/mm/yyyy)', 'Ora appello (hh:mm)',
            'Verb.', 'Def. App.', 'Gest. Pren.', 'Riservato', 'Tipo Iscr.', 'Tipo Esa.', 'Edificio',
            'Aula', 'Matricola Docente', 'Sede', 'Condizione SQL', 'Partizionamento', 'Partizione',
            'Note Appello', 'Posti', 'Codice Turno'
        ])

        # Dati esami
        for esame in esami:
            writer.writerow(esame)

        # Prepara la risposta
        output.seek(0)
        response = make_response(output.getvalue())
        response.headers['Content-Disposition'] = 'attachment; filename=esami.csv'
        response.headers['Content-type'] = 'text/csv'
        
        return response

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()
