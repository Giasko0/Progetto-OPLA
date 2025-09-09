import psycopg2
import os
from psycopg2.pool import ThreadedConnectionPool
import atexit

# Database configuration
DB_HOST = "opla-db"
DB_NAME = "dati"
DB_USER = "psqluser"
DB_PASS = "passpostgres"

# Istanza globale del pool di connessioni
db_pool = None

def init_db():
    # Inizializza il pool di connessioni
    global db_pool
    if db_pool is None:
        try:
            db_pool = ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                host=DB_HOST,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASS
            )
            # Registra la funzione di pulizia al termine dell'applicazione
            atexit.register(close_all_connections)
            print("Pool di connessioni inizializzato correttamente")
            return db_pool
        except Exception as e:
            print(f"Errore nell'inizializzazione del pool: {e}")
            raise
    return db_pool

def get_db_connection():
    # Ottiene una connessione dal pool
    global db_pool
    if db_pool is None or db_pool.closed:
        init_db()
    try:
        conn = db_pool.getconn()
        if conn.closed:
            # Se la connessione è chiusa, rilasciala e prendi una nuova connessione
            db_pool.putconn(conn)
            conn = db_pool.getconn()
        return conn
    except Exception as e:
        print(f"Errore nell'ottenere una connessione dal pool: {e}")
        # Tenta di reinizializzare il pool se c'è un errore
        if db_pool is not None:
            try:
                db_pool.closeall()
            except:
                pass
        init_db()
        return db_pool.getconn()

def release_connection(conn):
    # Rilascia una connessione di nuovo al pool
    global db_pool
    if db_pool is not None and not db_pool.closed:
        try:
            if conn and not conn.closed:
                db_pool.putconn(conn)
        except Exception as e:
            print(f"Errore nel rilascio della connessione: {e}")

def close_all_connections():
    # Chiude tutte le connessioni del pool
    global db_pool
    if db_pool is not None and not db_pool.closed:
        try:
            db_pool.closeall()
            print("Tutte le connessioni del pool sono state chiuse")
        except Exception as e:
            print(f"Errore nella chiusura di tutte le connessioni: {e}")
