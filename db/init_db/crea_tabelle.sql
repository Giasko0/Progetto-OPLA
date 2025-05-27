-- Droppa tutte le tabelle
DROP TABLE IF EXISTS aule CASCADE;
DROP TABLE IF EXISTS cds CASCADE;
DROP TABLE IF EXISTS periodi_esame CASCADE;
DROP TABLE IF EXISTS insegnamenti CASCADE;
DROP TABLE IF EXISTS insegnamenti_cds CASCADE;
DROP TABLE IF EXISTS utenti CASCADE;
DROP TABLE IF EXISTS preferenze_utenti CASCADE;
DROP TABLE IF EXISTS insegnamento_docente CASCADE;
DROP TABLE IF EXISTS esami CASCADE;

-- Creazione della tabella 'aule'
CREATE TABLE aule (
    nome TEXT PRIMARY KEY,        -- Nome dell'aula (chiave primaria)
    codice TEXT NOT NULL,         -- Codice dell'aula da easyAcademy
    sede TEXT,                    -- Sede dell'aula
    edificio TEXT,                -- Edificio dell'aula
    posti INT                     -- Numero di posti disponibili
);

-- Creazione della tabella 'utenti'
CREATE TABLE utenti (
    username TEXT PRIMARY KEY,      -- Username del docente (ad020022) (chiave primaria)
    matricola TEXT NOT NULL UNIQUE, -- Matricola del docente (011876)
    nome TEXT,                      -- Nome del docente
    cognome TEXT,                   -- Cognome del docente
    password TEXT DEFAULT 'password', -- Password dell'utente (inizializzata a "password")
    permessi_admin BOOLEAN          -- Permessi admin (true/false)
);

-- Creazione della tabella 'cds'
CREATE TABLE cds (
    codice TEXT NOT NULL,                -- Codice del corso di studio (L062)
    anno_accademico INT NOT NULL,        -- Anno accademico (2025 per 2025/2026)
    nome_corso TEXT NOT NULL,            -- Nome del corso di studio (INFORMATICA)
    curriculum TEXT NOT NULL,            -- Curriculum del corso di studio (CYBERSECURITY)
    inizio_lezioni_primo_semestre DATE,  -- Inizio lezioni primo semestre
    fine_lezioni_primo_semestre DATE,    -- Fine lezioni primo semestre
    inizio_lezioni_secondo_semestre DATE,-- Inizio lezioni secondo semestre
    fine_lezioni_secondo_semestre DATE,  -- Fine lezioni secondo semestre
    PRIMARY KEY (codice, anno_accademico, curriculum),
    CONSTRAINT check_anno_accademico CHECK (anno_accademico >= 1900 AND anno_accademico <= 2100)
);

-- Creazione della tabella "periodi_esame"
CREATE TABLE periodi_esame (
    cds TEXT,
    anno_accademico INTEGER,
    curriculum TEXT,  -- Aggiunta del campo curriculum
    tipo_periodo TEXT, -- 'ESTIVA', 'AUTUNNALE', 'INVERNALE', 'PAUSA_AUTUNNALE', 'PAUSA_PRIMAVERILE'
    inizio DATE NOT NULL,
    fine DATE NOT NULL,
    max_esami INTEGER DEFAULT 3,
    PRIMARY KEY (cds, anno_accademico, curriculum, tipo_periodo),
    FOREIGN KEY (cds, anno_accademico, curriculum) REFERENCES cds(codice, anno_accademico, curriculum) ON DELETE CASCADE,
    CONSTRAINT check_tipo_periodo CHECK (tipo_periodo IN (
        'ESTIVA', 'AUTUNNALE', 'INVERNALE', 'ANTICIPATA',
        'PAUSA_AUTUNNALE', 'PAUSA_PRIMAVERILE'
    ))
);

-- Creazione della tabella 'insegnamenti' (generici, possono essere usati da qualsiasi corso di studio)
CREATE TABLE insegnamenti (
    id TEXT PRIMARY KEY,          -- ID univoco dell'insegnamento (chiave primaria)
    codice TEXT NOT NULL,         -- Codice dell'insegnamento (A000702)
    titolo TEXT NOT NULL          -- Titolo dell'insegnamento
);

-- Creazione della tabella 'insegnamenti_cds' (specifici per un corso di studio, potrebbero variare di anno in anno)
CREATE TABLE insegnamenti_cds (
    insegnamento TEXT,          -- ID dell'insegnamento
    anno_accademico INT,        -- Anno accademico
    cds TEXT,                   -- Codice del corso di studio
    curriculum TEXT,            -- Curriculum del corso di studio (aggiunto)
    anno_corso INT NOT NULL,    -- Anno del corso di studio
    semestre INT NOT NULL,      -- Semestre (Insegnamento annuale = 3)
    is_mutuato BOOLEAN NOT NULL,-- Insegnamento mutuato (true/false)
    is_modulo BOOLEAN NOT NULL, -- Insegnamento modulo (true/false)
    padri_mutua TEXT[],         -- Array di codici degli insegnamenti di riferimento per mutuazioni
    padre_modulo TEXT,          -- Codice dell'insegnamento di riferimento per moduli
    codice_modulo INT,          -- Numero modulo
    PRIMARY KEY (insegnamento, anno_accademico, cds, curriculum),
    FOREIGN KEY (insegnamento) REFERENCES insegnamenti(id) ON DELETE CASCADE,
    FOREIGN KEY (cds, anno_accademico, curriculum) REFERENCES cds(codice, anno_accademico, curriculum) ON DELETE CASCADE,
    CONSTRAINT check_semestre CHECK (semestre IN (1, 2, 3))
);

-- Tabella per le preferenze degli utenti
CREATE TABLE IF NOT EXISTS preferenze_utenti (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    form_type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    preferences TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT idx_user_form UNIQUE (username, form_type, name),
    FOREIGN KEY (username) REFERENCES utenti(username) ON DELETE CASCADE
);

-- Creazione della tabella 'insegnamento_docente' (relazione N:N tra insegnamenti e utenti)
CREATE TABLE insegnamento_docente (
    insegnamento TEXT,           -- ID dell'insegnamento (chiave esterna)
    docente TEXT,                -- Username del docente (chiave esterna)
    annoaccademico INT,          -- Anno accademico
    PRIMARY KEY (insegnamento, docente, annoaccademico),
    FOREIGN KEY (insegnamento) REFERENCES insegnamenti(id) ON DELETE CASCADE,
    FOREIGN KEY (docente) REFERENCES utenti(username) ON DELETE CASCADE
);

-- Creazione della tabella 'esami'
CREATE TABLE esami (
    id SERIAL PRIMARY KEY,                -- Identificativo univoco dell'esame (chiave primaria)
    descrizione TEXT,                     -- Descrizione dell'esame
    tipo_appello TEXT NOT NULL,           -- Tipo di appello (finale o parziale)
    docente TEXT NOT NULL,                -- Username del docente (chiave esterna)
    insegnamento TEXT NOT NULL,           -- ID dell'insegnamento (chiave esterna)
    cds TEXT NOT NULL,                    -- Codice del corso di studio
    anno_accademico INT NOT NULL,         -- Anno accademico
    curriculum TEXT NOT NULL,             -- Curriculum del corso di studio
    aula TEXT,                            -- Nome dell'aula dove si svolgerà l'esame (chiave esterna)
    data_appello DATE NOT NULL,           -- Data dell'esame
    data_inizio_iscrizione DATE NOT NULL, -- Data di apertura iscrizioni
    data_fine_iscrizione DATE NOT NULL,   -- Data di chiusura iscrizioni
    ora_appello TIME NOT NULL,            -- Ora di inizio dell'esame
    durata_appello REAL NOT NULL,         -- Durata dell'esame (in minuti)
    periodo INT NOT NULL,                 -- Periodo dell'esame (1 per mattina o 2 per pomeriggio)
    verbalizzazione TEXT NOT NULL,        -- Modalità di verbalizzazione (Firme...)
    definizione_appello TEXT,             -- Boh (STD)
    gestione_prenotazione TEXT,           -- Boh (STD)
    riservato BOOLEAN DEFAULT FALSE,      -- Flag per appelli non visibili agli studenti
    tipo_iscrizione TEXT,                 -- Boh (STD)
    tipo_esame TEXT,                      -- Scritto, orale o entrambi
    condizione_sql TEXT,                  -- Condizioni SQL aggiuntive (Lasciare vuoto)
    partizionamento TEXT,                 -- Tipo di partizionamento (Non serve al DMI)
    partizione TEXT,                      -- Partizione specifica  (Non serve al DMI)
    note_appello TEXT,                    -- Note addizionali sull'appello
    posti INTEGER,                        -- Numero di posti disponibili
    codice_turno TEXT,                    -- Codice identificativo del turno (Non serve al DMI)
    mostra_nel_calendario BOOLEAN DEFAULT TRUE, -- Flag per mostrare l'esame nel calendario
    FOREIGN KEY (docente) REFERENCES utenti(username) ON DELETE CASCADE,
    FOREIGN KEY (insegnamento) REFERENCES insegnamenti(id) ON DELETE CASCADE,
    FOREIGN KEY (aula) REFERENCES aule(nome) ON DELETE SET NULL,
    FOREIGN KEY (cds, anno_accademico, curriculum) REFERENCES cds(codice, anno_accademico, curriculum) ON DELETE CASCADE,
    CONSTRAINT check_date_esami CHECK (
        data_inizio_iscrizione <= data_fine_iscrizione 
        AND data_fine_iscrizione <= data_appello
    ),
    CONSTRAINT check_posti CHECK (posti > 0)
);

-- Creazione degli indici per velocizzare le query (forse sono troppi, levarne qualcuno se necessario)
CREATE INDEX idx_cds_nome_corso ON cds(nome_corso);

CREATE INDEX idx_insegnamenti_codice ON insegnamenti(codice);
CREATE INDEX idx_insegnamenti_id ON insegnamenti(id);

CREATE INDEX idx_insegnamenti_cds_anno ON insegnamenti_cds(anno_accademico);
CREATE INDEX idx_insegnamenti_cds_cds ON insegnamenti_cds(cds);

CREATE INDEX idx_utenti_matricola ON utenti(matricola);
CREATE INDEX idx_utenti_cognome ON utenti(cognome);

CREATE INDEX idx_insegna_annoaccademico ON insegnamento_docente(annoaccademico);
CREATE INDEX idx_insegna_docente ON insegnamento_docente(docente);
CREATE INDEX idx_insegna_insegnamento ON insegnamento_docente(insegnamento);

CREATE INDEX idx_esami_data_appello ON esami(data_appello);
CREATE INDEX idx_esami_insegnamento ON esami(insegnamento);
CREATE INDEX idx_esami_docente ON esami(docente);
CREATE INDEX idx_esami_aula ON esami(aula);

CREATE INDEX idx_aule_nome ON aule(nome);


-- Inserimento dell'utente 'admin' con permessi di amministratore
INSERT INTO utenti (username, matricola, nome, cognome, password, permessi_admin) VALUES ('admin', '012345', 'Admin', 'Bello', 'password', true);

INSERT INTO cds (codice, anno_accademico, nome_corso, curriculum, inizio_lezioni_primo_semestre, fine_lezioni_primo_semestre, inizio_lezioni_secondo_semestre, fine_lezioni_secondo_semestre) VALUES
('L062', 2023, 'INFORMATICA', 'CORSO GENERICO', '2023-10-01', '2023-12-20', '2023-02-01', '2023-05-31'),
('L062', 2024, 'INFORMATICA', 'CORSO GENERICO', '2024-10-01', '2024-12-20', '2025-02-01', '2025-05-31');

INSERT INTO periodi_esame (cds, anno_accademico, curriculum, tipo_periodo, inizio, fine, max_esami) VALUES
('L062', 2023, 'CORSO GENERICO', 'INVERNALE', '2025-01-07', '2025-02-22', 3),
('L062', 2024, 'CORSO GENERICO', 'ANTICIPATA', '2025-01-07', '2025-02-22', 3),
('L062', 2024, 'CORSO GENERICO', 'ESTIVA', '2025-06-10', '2025-07-25', 3),
('L062', 2024, 'CORSO GENERICO', 'AUTUNNALE', '2025-09-01', '2025-9-30', 2),
('L062', 2024, 'CORSO GENERICO', 'INVERNALE', '2026-01-10', '2026-02-25', 3),
('L062', 2024, 'CORSO GENERICO', 'PAUSA_AUTUNNALE', '2025-11-04', '2025-11-08', 1),
('L062', 2024, 'CORSO GENERICO', 'PAUSA_PRIMAVERILE', '2025-04-07', '2025-04-11', 1);