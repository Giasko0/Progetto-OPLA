# Import delle librerie
from flask import Flask
import os

# Import delle funzioni di supporto
from db import init_db

# Import dei blueprint
from auth import auth_bp, require_auth
from fetch import fetch_bp
from exams import exam_bp
from user_preferences import preferences_bp

# Import dei blueprint oh-issa
from oh_issa.import_export import import_export_bp
from oh_issa.gestione_utenti import gestione_utenti_bp
from oh_issa.gestione_date import gestione_date_bp
from oh_issa.common import common_bp
from oh_issa.calendario_esami import calendario_esami_bp

app = Flask(__name__)

# Inizializza il pool di connessioni
init_db()

# Configurazione della sessione
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'  # Opzionalmente usare Redis o altro backend
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # 24 ore in secondi

# Registrazione dei blueprint
app.register_blueprint(auth_bp)
app.register_blueprint(fetch_bp)
app.register_blueprint(preferences_bp)
app.register_blueprint(exam_bp)

# Registrazione dei blueprint oh-issa
app.register_blueprint(import_export_bp)
app.register_blueprint(gestione_utenti_bp)
app.register_blueprint(gestione_date_bp)
app.register_blueprint(common_bp)
app.register_blueprint(calendario_esami_bp)

# ===== Main =====
if __name__ == '__main__':
  app.config['DEBUG'] = True 
  app.run(host='0.0.0.0')