# Import delle librerie
from flask import Flask
import os

# Import delle funzioni di supporto
from db import init_db

# Import dei blueprint
from auth import auth_bp
from saml_auth import saml_bp, require_auth
from admin import admin_bp
from fetch import fetch_bp
from exams import exam_bp
from user_preferences import preferences_bp

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
app.register_blueprint(saml_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(fetch_bp)
app.register_blueprint(preferences_bp)
app.register_blueprint(exam_bp)

# Flag per (non) usare saml
app.config['SAML_ENABLED'] = False

# ===== Main =====
if __name__ == '__main__':
  app.config['DEBUG'] = True 
  app.run(host='0.0.0.0')