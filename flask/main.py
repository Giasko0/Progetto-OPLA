# Import delle librerie
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
import os

# Import delle funzioni di supporto
from db import init_db

# Import dei blueprint
from auth import auth_bp, require_auth
from fetch import fetch_bp
from exams import exam_bp
from user_preferences import preferences_bp
from import_esami import import_bp

# Import dei blueprint oh-issa
from oh_issa.common import common_bp
from oh_issa.import_export import import_export_bp
from oh_issa.gestione_utenti import gestione_utenti_bp
from oh_issa.gestione_insegnamenti import gestione_insegnamenti_bp
from oh_issa.gestione_date import gestione_date_bp
from oh_issa.controllo_esami_minimi import controllo_esami_minimi_bp
from oh_issa.calendario_esami import calendario_esami_bp

app = Flask(__name__)

# Configura ProxyFix per gestire il reverse proxy nginx
app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_for=1,      # numero di proxy davanti all'app per X-Forwarded-For
    x_proto=1,    # numero di proxy per X-Forwarded-Proto  
    x_host=1,     # numero di proxy per X-Forwarded-Host
    x_port=1,     # numero di proxy per X-Forwarded-Port
    x_prefix=1    # numero di proxy per X-Forwarded-Prefix
)

# Inizializza il pool di connessioni
init_db()

# Configurazione della sessione
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'  # Future work: usare Redis o altro backend
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 10800  # 3 ore in secondi (durata sessione)

# Registrazione dei blueprint
app.register_blueprint(auth_bp)
app.register_blueprint(fetch_bp)
app.register_blueprint(preferences_bp)
app.register_blueprint(exam_bp)
app.register_blueprint(import_bp)

# Registrazione dei blueprint oh-issa
app.register_blueprint(common_bp)
app.register_blueprint(import_export_bp)
app.register_blueprint(gestione_utenti_bp)
app.register_blueprint(gestione_insegnamenti_bp)
app.register_blueprint(gestione_date_bp)
app.register_blueprint(controllo_esami_minimi_bp)
app.register_blueprint(calendario_esami_bp)

# ===== Main =====
if __name__ == '__main__':
  app.config['DEBUG'] = True 
  app.run(host='0.0.0.0')