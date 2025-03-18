-- Droppa tutte le tabelle
DROP TABLE IF EXISTS aule CASCADE;
DROP TABLE IF EXISTS cds CASCADE;
DROP TABLE IF EXISTS periodi_esame CASCADE;
DROP TABLE IF EXISTS insegnamenti CASCADE;
DROP TABLE IF EXISTS insegnamenti_cds CASCADE;
DROP TABLE IF EXISTS utenti CASCADE;
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

-- Creazione della tabella 'cds'
CREATE TABLE cds (
    codice TEXT NOT NULL,                         -- Codice del corso di studio (L062)
    anno_accademico INT NOT NULL,                 -- Anno accademico (2025 per 2025/2026)
    nome_corso TEXT NOT NULL,            -- Nome del corso di studio (Informatica Triennale) (NOT NULL)
    inizio_lezioni_primo_semestre DATE,  -- Inizio lezioni primo semestre
    fine_lezioni_primo_semestre DATE,    -- Fine lezioni primo semestre
    inizio_lezioni_secondo_semestre DATE,-- Inizio lezioni secondo semestre
    fine_lezioni_secondo_semestre DATE,  -- Fine lezioni secondo semestre
    PRIMARY KEY (codice, anno_accademico),
    CONSTRAINT check_anno_accademico CHECK (anno_accademico >= 1900 AND anno_accademico <= 2100)
);
-- Creazione della tabella "periodi_esame"
CREATE TABLE periodi_esame (
    cds TEXT,
    anno_accademico INTEGER,
    tipo_periodo TEXT, -- 'ESTIVA', 'AUTUNNALE', 'INVERNALE', 'PAUSA_AUTUNNALE', 'PAUSA_PRIMAVERILE'
    inizio DATE NOT NULL,
    fine DATE NOT NULL,
    max_esami INTEGER DEFAULT 3,
    PRIMARY KEY (cds, anno_accademico, tipo_periodo),
    FOREIGN KEY (cds, anno_accademico) REFERENCES cds(codice, anno_accademico) ON DELETE CASCADE,
    CONSTRAINT check_tipo_periodo CHECK (tipo_periodo IN (
        'ESTIVA', 'AUTUNNALE', 'INVERNALE', 'ANTICIPATA',
        'PAUSA_AUTUNNALE', 'PAUSA_PRIMAVERILE'
    ))
);

-- Creazione della tabella 'insegnamenti' (generici, possono essere usati da qualsiasi corso di studio)
CREATE TABLE insegnamenti (
    codice TEXT PRIMARY KEY,      -- Codice dell'insegnamento (A000702)
    titolo TEXT NOT NULL          -- Titolo dell'insegnamento
);

-- Creazione della tabella 'insegnamenti_cds' (specifici per un corso di studio, potrebbero variare di anno in anno)
CREATE TABLE insegnamenti_cds (
    insegnamento TEXT,          -- Codice dell'insegnamento (chiave esterna)
    anno_accademico INT,        -- Anno accademico (2025)
    cds TEXT,                   -- Codice del corso di studio (L062)
    anno_corso INT NOT NULL,    -- Anno del cds (1, 2 o 3 per triennale)
    semestre INT NOT NULL,      -- Semestre (1, 2 o 3 per annuale)
    mutuato_da TEXT,            -- Codice dell'insegnamento da cui è mutuato
    PRIMARY KEY (insegnamento, anno_accademico, cds),
    FOREIGN KEY (insegnamento) REFERENCES insegnamenti(codice) ON DELETE CASCADE,
    FOREIGN KEY (cds, anno_accademico) REFERENCES cds(codice, anno_accademico) ON DELETE CASCADE,
    FOREIGN KEY (mutuato_da) REFERENCES insegnamenti(codice) ON DELETE SET NULL
);

-- Creazione della tabella 'utenti'
CREATE TABLE utenti (
    username TEXT PRIMARY KEY,   -- Username del docente (ad020022) (chiave primaria)
    matricola TEXT NOT NULL,     -- Matricola del docente (011876) (NOT NULL)
    nome TEXT,                   -- Nome del docente
    cognome TEXT,                -- Cognome del docente
    permessi_docente BOOLEAN,    -- Permessi docente (true/false)
    permessi_admin BOOLEAN       -- Permessi admin (true/false)
);

-- Creazione della tabella 'insegnamento_docente' (relazione N:N tra insegnamenti e utenti)
CREATE TABLE insegnamento_docente (
    insegnamento TEXT,           -- Codice dell'insegnamento (chiave esterna)
    docente TEXT,                -- Username del docente (chiave esterna)
    annoaccademico INT,          -- Anno accademico
    PRIMARY KEY (insegnamento, docente, annoaccademico),
    FOREIGN KEY (insegnamento) REFERENCES insegnamenti(codice) ON DELETE CASCADE,
    FOREIGN KEY (docente) REFERENCES utenti(username) ON DELETE CASCADE
);

-- Creazione della tabella 'esami'
CREATE TABLE esami (
    id SERIAL PRIMARY KEY,                -- Identificativo univoco dell'esame (chiave primaria)
    tipo_appello TEXT NOT NULL,           -- Tipo di appello (finale o parziale)
    docente TEXT NOT NULL REFERENCES utenti(username) ON DELETE CASCADE,         -- Username del docente responsabile (chiave esterna)
    insegnamento TEXT NOT NULL REFERENCES insegnamenti(codice) ON DELETE CASCADE, -- Codice dell'insegnamento (chiave esterna)
    aula TEXT REFERENCES aule(nome) ON DELETE SET NULL,                        -- Nome dell'aula dove si svolgerà l'esame (chiave esterna)
    data_appello DATE NOT NULL,           -- Data dell'esame
    data_inizio_iscrizione DATE NOT NULL, -- Data di apertura iscrizioni
    data_fine_iscrizione DATE NOT NULL,   -- Data di chiusura iscrizioni
    ora_appello TIME NOT NULL,            -- Ora di inizio dell'esame
    durata_appello REAL NOT NULL,         -- Durata dell'esame (in minuti)
    periodo INT NOT NULL,                 -- Periodo dell'esame (mattina o pomeriggio)
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
    CONSTRAINT check_date_esami CHECK (
        data_inizio_iscrizione <= data_fine_iscrizione 
        AND data_fine_iscrizione <= data_appello
    ),
    CONSTRAINT check_posti CHECK (posti > 0)
);

-- Creazione degli indici per velocizzare le query (forse sono troppi, levarne qualcuno se necessario)
CREATE INDEX idx_cds_nome_corso ON cds(nome_corso);

CREATE INDEX idx_insegnamenti_cds_anno ON insegnamenti_cds(anno_accademico);
CREATE INDEX idx_insegnamenti_cds_cds ON insegnamenti_cds(cds);
CREATE INDEX idx_insegnamenti_cds_mutuato_da ON insegnamenti_cds(mutuato_da);

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