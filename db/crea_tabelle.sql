-- Droppa tutte le tabelle
DROP TABLE IF EXISTS aule CASCADE;
DROP TABLE IF EXISTS cds CASCADE;
DROP TABLE IF EXISTS sessioni CASCADE;
DROP TABLE IF EXISTS vacanze CASCADE;
DROP TABLE IF EXISTS configurazioni_globali CASCADE;
DROP TABLE IF EXISTS insegnamenti CASCADE;
DROP TABLE IF EXISTS insegnamenti_cds CASCADE;
DROP TABLE IF EXISTS utenti CASCADE;
DROP TABLE IF EXISTS preferenze_utenti CASCADE;
DROP TABLE IF EXISTS insegnamento_docente CASCADE;
DROP TABLE IF EXISTS esami CASCADE;

-- Tabella 'aule'
CREATE TABLE aule (
    nome TEXT PRIMARY KEY,        -- Nome dell'aula (chiave primaria)
    codice_esse3 TEXT,            -- Codice dell'aula da ESSE3
    codice_easyacademy TEXT,      -- Codice dell'aula da EasyAcademy
    sede TEXT,                    -- Sede dell'aula
    edificio TEXT,                -- Edificio dell'aula
    posti INT                     -- Numero di posti disponibili
);

-- Tabella 'utenti'
CREATE TABLE utenti (
    username TEXT PRIMARY KEY,      -- Username del docente (ad020022) (chiave primaria)
    matricola TEXT NOT NULL UNIQUE, -- Matricola del docente (011876)
    nome TEXT,                      -- Nome del docente
    cognome TEXT,                   -- Cognome del docente
    password TEXT DEFAULT 'password', -- Password dell'utente (inizializzata a "password")
    permessi_admin BOOLEAN          -- Permessi admin (true/false)
);

-- Tabella 'cds'
CREATE TABLE cds (
    codice TEXT NOT NULL,                -- Codice del corso di studio (L062)
    anno_accademico INT NOT NULL,        -- Anno accademico (2025 per 2025/2026)
    nome_corso TEXT NOT NULL,            -- Nome del corso di studio (INFORMATICA)
    curriculum_codice TEXT NOT NULL,     -- Codice del curriculum (GEN, E01, etc.)
    curriculum_nome TEXT NOT NULL,       -- Nome del curriculum (CORSO GENERICO, CYBERSECURITY, etc.)
    PRIMARY KEY (codice, anno_accademico, curriculum_codice),
    CONSTRAINT check_anno_accademico CHECK (anno_accademico >= 1900 AND anno_accademico <= 2100)
);

-- Tabella per le configurazioni globali che si applicano a tutto l'ateneo
CREATE TABLE configurazioni_globali (
    anno_accademico INTEGER PRIMARY KEY,     -- Anno accademico (2025 per 2025/2026)
    target_esami_default INTEGER,            -- Numero target di esami di default per i corsi
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_anno_accademico_global CHECK (anno_accademico >= 1900 AND anno_accademico <= 2100)
);

-- Tabella "sessioni"
CREATE TABLE sessioni (
    cds TEXT,
    anno_accademico INTEGER,
    curriculum_codice TEXT,
    tipo_sessione TEXT, -- 'anticipata', 'estiva', 'autunnale', 'invernale'
    inizio DATE NOT NULL,
    fine DATE NOT NULL,
    esami_primo_semestre INTEGER,
    esami_secondo_semestre INTEGER,
    PRIMARY KEY (cds, anno_accademico, curriculum_codice, tipo_sessione),
    FOREIGN KEY (cds, anno_accademico, curriculum_codice) REFERENCES cds(codice, anno_accademico, curriculum_codice) ON DELETE CASCADE,
    CONSTRAINT check_tipo_sessione CHECK (tipo_sessione IN (
        'anticipata', 'estiva', 'autunnale', 'invernale'
    ))
);

-- Tabella 'vacanze' per gestire i periodi di vacanza globali che si applicano a tutto l'ateneo
CREATE TABLE vacanze (
    id SERIAL PRIMARY KEY,
    anno_accademico INTEGER NOT NULL,
    descrizione TEXT NOT NULL,
    inizio DATE NOT NULL,
    fine DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (anno_accademico) 
        REFERENCES configurazioni_globali(anno_accademico) 
        ON DELETE CASCADE,
    
    -- Vincolo per verificare che la data di inizio sia precedente alla data di fine
    CONSTRAINT check_date_order CHECK (inizio <= fine)
);

-- Tabella 'insegnamenti' (generici, possono essere usati da qualsiasi corso di studio)
CREATE TABLE insegnamenti (
    id TEXT PRIMARY KEY,          -- ID univoco dell'insegnamento (chiave primaria)
    codice TEXT NOT NULL,         -- Codice dell'insegnamento (A000702)
    titolo TEXT NOT NULL          -- Titolo dell'insegnamento
);

-- Tabella 'insegnamenti_cds' (specifici per un corso di studio, potrebbero variare di anno in anno)
CREATE TABLE insegnamenti_cds (
    insegnamento TEXT,          -- ID dell'insegnamento
    anno_accademico INT,        -- Anno accademico
    cds TEXT,                   -- Codice del corso di studio
    curriculum_codice TEXT,     -- Codice del curriculum del corso di studio
    anno_corso INT NOT NULL,    -- Anno del corso di studio
    semestre INT NOT NULL,      -- Semestre (Insegnamento annuale = 3)
    PRIMARY KEY (insegnamento, anno_accademico, cds, curriculum_codice),
    FOREIGN KEY (insegnamento) REFERENCES insegnamenti(id) ON DELETE CASCADE,
    FOREIGN KEY (cds, anno_accademico, curriculum_codice) REFERENCES cds(codice, anno_accademico, curriculum_codice) ON DELETE CASCADE,
    CONSTRAINT check_semestre CHECK (semestre IN (1, 2, 3))
);

-- Tabella 'insegnamento_docente' (relazione N:N tra insegnamenti e utenti)
CREATE TABLE insegnamento_docente (
    insegnamento TEXT,           -- ID dell'insegnamento (chiave esterna)
    docente TEXT,                -- Username del docente (chiave esterna)
    annoaccademico INT,          -- Anno accademico
    PRIMARY KEY (insegnamento, docente, annoaccademico),
    FOREIGN KEY (insegnamento) REFERENCES insegnamenti(id) ON DELETE CASCADE,
    FOREIGN KEY (docente) REFERENCES utenti(username) ON DELETE CASCADE
);

-- Tabella per le preferenze degli utenti
CREATE TABLE preferenze_utenti (
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

-- Tabella 'esami'
CREATE TABLE esami (
    id SERIAL PRIMARY KEY,                -- Identificativo univoco dell'esame (chiave primaria)
    descrizione TEXT,                     -- Descrizione dell'esame
    tipo_appello TEXT NOT NULL,           -- Tipo di appello (finale o parziale)
    docente TEXT NOT NULL,                -- Username del docente (chiave esterna)
    insegnamento TEXT NOT NULL,           -- ID dell'insegnamento (chiave esterna)
    cds TEXT NOT NULL,                    -- Codice del corso di studio
    anno_accademico INT NOT NULL,         -- Anno accademico
    curriculum_codice TEXT NOT NULL,      -- Codice del curriculum del corso di studio
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
    FOREIGN KEY (cds, anno_accademico, curriculum_codice) REFERENCES cds(codice, anno_accademico, curriculum_codice) ON DELETE CASCADE,
    CONSTRAINT check_date_esami CHECK (
        data_inizio_iscrizione <= data_fine_iscrizione 
        AND data_fine_iscrizione <= data_appello
    ),
    CONSTRAINT check_posti CHECK (posti > 0)
);

-- Indici per velocizzare le query (forse sono troppi, levarne qualcuno se necessario)
-- Indici per la tabella 'esami'
CREATE INDEX idx_esami_data_appello ON esami(data_appello);
CREATE INDEX idx_esami_docente ON esami(docente);
CREATE INDEX idx_esami_insegnamento ON esami(insegnamento);
CREATE INDEX idx_esami_cds_anno_curriculum ON esami(cds, anno_accademico, curriculum_codice);
CREATE INDEX idx_esami_aula_data_periodo ON esami(aula, data_appello, periodo);
CREATE INDEX idx_esami_periodo ON esami(periodo);
CREATE INDEX idx_esami_data_iscrizione ON esami(data_inizio_iscrizione, data_fine_iscrizione);
CREATE INDEX idx_esami_calendario ON esami(mostra_nel_calendario);
CREATE INDEX idx_esami_data_range ON esami(data_appello, mostra_nel_calendario);
CREATE INDEX idx_esami_docente_anno ON esami(docente, anno_accademico);
CREATE INDEX idx_esami_insegnamento_data ON esami(insegnamento, data_appello);

-- Indici per la tabella 'insegnamenti_cds'
CREATE INDEX idx_insegnamenti_cds_anno_semestre ON insegnamenti_cds(anno_corso, semestre);
CREATE INDEX idx_insegnamenti_cds_anno_accademico ON insegnamenti_cds(anno_accademico);
CREATE INDEX idx_insegnamenti_cds_cds ON insegnamenti_cds(cds);
CREATE INDEX idx_insegnamenti_cds_curriculum ON insegnamenti_cds(curriculum_codice);

-- Indici per la tabella 'insegnamento_docente'
CREATE INDEX idx_insegnamento_docente_anno ON insegnamento_docente(annoaccademico);
CREATE INDEX idx_insegnamento_docente_docente_anno ON insegnamento_docente(docente, annoaccademico);

-- Indici per la tabella 'sessioni'
CREATE INDEX idx_sessioni_date_range ON sessioni(inizio, fine);
CREATE INDEX idx_sessioni_tipo ON sessioni(tipo_sessione);
CREATE INDEX idx_sessioni_cds_anno ON sessioni(cds, anno_accademico);
CREATE INDEX idx_sessioni_anno_type ON sessioni(anno_accademico, tipo_sessione);

-- Indici per la tabella 'utenti'
CREATE INDEX idx_utenti_permessi ON utenti(permessi_admin);

-- Indici per la tabella 'preferenze_utenti'
CREATE INDEX idx_preferenze_form_type ON preferenze_utenti(form_type);
CREATE INDEX idx_preferenze_created_at ON preferenze_utenti(created_at);
CREATE INDEX idx_preferenze_username_type ON preferenze_utenti(username, form_type);

-- Indici per la tabella 'insegnamenti'
CREATE INDEX idx_insegnamenti_codice ON insegnamenti(codice);
CREATE INDEX idx_insegnamenti_titolo_gin ON insegnamenti USING gin(to_tsvector('italian', titolo));

-- Indici per la tabella 'aule'
CREATE INDEX idx_aule_codice_esse3 ON aule(codice_esse3);
CREATE INDEX idx_aule_codice_easyacademy ON aule(codice_easyacademy);
CREATE INDEX idx_aule_sede ON aule(sede);
CREATE INDEX idx_aule_edificio ON aule(edificio);

-- Indici per la tabella 'cds'
CREATE INDEX idx_cds_anno ON cds(anno_accademico);
CREATE INDEX idx_cds_nome ON cds(nome_corso);

-- Indici per la tabella 'vacanze'
CREATE INDEX idx_vacanze_anno ON vacanze(anno_accademico);
CREATE INDEX idx_vacanze_date_range ON vacanze(inizio, fine);

-- Indici per la tabella 'configurazioni_globali'
CREATE INDEX idx_configurazioni_globali_anno ON configurazioni_globali(anno_accademico);

-- Inserimento dell'utente 'admin' con permessi di amministratore
INSERT INTO utenti (username, matricola, nome, cognome, password, permessi_admin) VALUES ('ad020022', '342804', 'Amedeo', 'Di Biase', 'password', true);

-- Inserimento dei corsi di studio default
INSERT INTO cds (codice, anno_accademico, nome_corso, curriculum_codice, curriculum_nome) VALUES
('L062', 2024, 'INFORMATICA', 'GEN', 'CORSO GENERICO');

-- Inserimento delle configurazioni globali di default
INSERT INTO configurazioni_globali (anno_accademico, target_esami_default) VALUES
(2024, 8);

-- Inserimento di alcune vacanze globali di esempio
INSERT INTO vacanze (anno_accademico, descrizione, inizio, fine) VALUES
(2024, 'Vacanze Natalizie', '2024-12-24', '2025-01-06'),
(2024, 'Vacanze Pasquali', '2025-04-20', '2025-04-25');

-- Inserimento delle sessioni di prova
INSERT INTO sessioni (cds, anno_accademico, curriculum_codice, tipo_sessione, inizio, fine, esami_primo_semestre, esami_secondo_semestre) VALUES
('L062', 2024, 'GEN', 'anticipata', '2024-12-22', '2025-02-22', 2, 0),
('L062', 2024, 'GEN', 'estiva', '2025-06-10', '2025-07-25', 2, 3),
('L062', 2024, 'GEN', 'autunnale', '2025-09-01', '2025-9-30', 2, 2),
('L062', 2024, 'GEN', 'invernale', '2026-01-10', '2026-02-25', 2, 3);

-- Inserimento delle aule
INSERT INTO aule (nome, codice_esse3, codice_easyacademy, sede, edificio, posti) VALUES
('Aula A-0', 'AULA A0', '002_FIA', '1288', 'INFORMATICA', 180),
('Aula A-2', 'AULA A2', '028_A2', '1288', 'INFORMATICA', 180),
('Aula A-3', 'AULA A3', '014_A0', '1288', 'INFORMATICA', 70),
('Aula B-1', 'AULA B1', '010_B1', '1288', 'INFORMATICA', 30),
('Aula B-3', 'AULA B3', '004_B3', '1288', 'INFORMATICA', 35),
('Aula C-2', 'AULA C2', '002_C2', '1288', 'INFORMATICA', 20),
('Aula C-3', 'AULA C3', '003_C3', '1288', 'INFORMATICA', 25),
('Aula Gialla', 'AULA GIALLA', '012_GIA', '1288', 'INFORMATICA', 23),
('Aula I-1', 'AULA I1', 'x1', '1288', 'INFORMATICA', 215),
('Aula I-2', 'AULA I2', 'x2', '1288', 'INFORMATICA', 90),
('Aula Verde', 'AULA VERDE', '013_VER', '1288', 'INFORMATICA', 25),
('Sala Riunioni', 'SALA RIUNIONI', 'x3', '1288', 'INFORMATICA', 25),
('Studio docente DMI', 'STUDIO DOCENTE DMI', '', '1288', 'INFORMATICA', 9999);
-- Aule inutilizzate
-- ('Aula Informatica', 'AULA INFORMATICA', '')
-- ('Aula Virtuale', 'AULA VIRTUALE TEAMS', '')