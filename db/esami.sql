-- Script per la creazione della tabella 'esami'

CREATE TABLE IF NOT EXISTS esami (
    id SERIAL PRIMARY KEY,
    tipo_appello TEXT,
    docente TEXT REFERENCES docenti(matricola),
    insegnamento TEXT REFERENCES insegnamenti(codice),
    aula TEXT REFERENCES aule(nome),
    data_appello DATE NOT NULL,
    data_inizio_iscrizione DATE NOT NULL,
    data_fine_iscrizione DATE NOT NULL,
    ora_appello TIME,
    verbalizzazione TEXT NOT NULL,
    definizione_appello TEXT,
    gestione_prenotazione TEXT,
    riservato BOOLEAN,
    tipo_iscrizione TEXT,
    tipo_esame TEXT,
    condizione_sql TEXT,
    partizionamento TEXT,
    partizione TEXT,
    note_appello TEXT,
    posti INTEGER,
    codice_turno TEXT
);

-- Creazione di un indice per migliorare le performance delle queries sulla data
CREATE INDEX idx_esami_data_appello ON esami(data_appello);