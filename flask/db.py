import psycopg2
import os

# Database configuration
DB_HOST = "opla-db"
DB_NAME = "dati"
DB_USER = "psqluser"
DB_PASS = "passpostgres"

def get_db_connection():
    db = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    return db
