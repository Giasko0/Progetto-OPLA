from flask import Blueprint, request, jsonify, session
from db import get_db_connection
from middlewares import get_current_username

api_bp = Blueprint('api', __name__)

@api_bp.route('/flask/api/ottieniInsegnamenti')
def ottieni_insegnamenti():
    # Ottieni lo username indipendentemente dal metodo di autenticazione
    username = get_current_username()
    
    if not username:
        return jsonify({'error': 'User not authenticated'}), 401
    
    # ...existing code...

@api_bp.route('/flask/api/mieiEsami')
def miei_esami():
    # Ottieni lo username indipendentemente dal metodo di autenticazione
    username = get_current_username()
    
    if not username:
        return jsonify({'error': 'User not authenticated'}), 401
    
    # ...existing code...

# Aggiorna analogamente altre funzioni API che necessitano di autenticazione
# ...existing code...
