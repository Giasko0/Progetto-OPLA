INSERT INTO aule (nome, sede, edificio, posti) VALUES
  ('Studio docente DMI', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', NULL),
  ('A0', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 120),
  ('A2', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 80),
  ('A3', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 30),
  ('B1', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 20),
  ('B3', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 20),
  ('C2', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 15),
  ('C3', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 20),
  ('Aula verde', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 30),
  ('Aula gialla', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 40),
  ('I1', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 120),
  ('I2', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 80),
  ('Aula riunioni', 'Perugia', 'DIPARTIMENTO DI MATEMATICA E INFORMATICA', 25);

-- Inserimento utenti (i permessi sono cumulativi)
INSERT INTO utenti (username, matricola, email, nome, cognome, permessi_visitatore, permessi_docente, permessi_admin) VALUES
    ('ad020022', '011876', 'amedeo@gmail.com', 'Amedeo', 'Di Biase', true, true, true),  -- Admin: ha permessi docente, visitatore e admin
    ('av790001', '011875', 'av@gmail.com', 'Anna', 'Verdi', true, true, false),          -- Docente: ha permessi docente e visitatore
    ('gn900001', '011874', 'gn@gmail.com', 'Giulia', 'Neri', true, true, false),         -- Docente: ha permessi docente e visitatore
    ('lb750001', '011873', 'lb@gmail.com', 'Luigi', 'Bianchi', true, true, false),       -- Docente: ha permessi docente e visitatore
    ('mr800001', '011872', 'mr@gmail.com', 'Mario', 'Rossi', true, true, false),         -- Docente: ha permessi docente e visitatore
    ('pg950001', '011871', 'pg@gmail.com', 'Paolo', 'Gialli', true, true, false);        -- Docente: ha permessi docente e visitatore

-- Inserimento CDS con date complete
INSERT INTO cds (
    codice, anno_accademico, nome_corso, durata,
    inizio_lezioni_primo_semestre, fine_lezioni_primo_semestre,
    inizio_lezioni_secondo_semestre, fine_lezioni_secondo_semestre,
    pausa_didattica_primo_inizio, pausa_didattica_primo_fine,
    pausa_didattica_secondo_inizio, pausa_didattica_secondo_fine,
    inizio_sessione_anticipata, fine_sessione_anticipata,
    inizio_sessione_estiva, fine_sessione_estiva,
    inizio_sessione_autunnale, fine_sessione_autunnale,
    inizio_sessione_invernale, fine_sessione_invernale
) VALUES (
    'L062', 2025, 'Informatica Triennale', 3,
    '2025-09-25', '2025-12-22',                    -- Primo semestre
    '2026-02-24', '2026-05-31',                    -- Secondo semestre
    '2025-11-01', '2025-11-03',                    -- Pausa primo semestre
    '2026-04-09', '2026-04-14',                    -- Pausa secondo semestre
    '2026-01-07', '2026-02-21',                    -- Sessione anticipata
    '2026-06-03', '2026-07-31',                    -- Sessione estiva
    '2026-09-01', '2026-09-30',                    -- Sessione autunnale
    '2027-01-07', '2027-02-21'                     -- Sessione invernale
),
(
    'L062', 2024, 'Informatica Triennale', 3,
    '2024-09-25', '2024-12-22',                    -- Primo semestre
    '2025-02-24', '2025-05-31',                    -- Secondo semestre
    '2024-11-01', '2024-11-03',                    -- Pausa primo semestre
    '2025-04-09', '2025-04-14',                    -- Pausa secondo semestre
    '2025-01-07', '2025-02-21',                    -- Sessione anticipata
    '2025-06-03', '2025-07-31',                    -- Sessione estiva
    '2025-09-01', '2025-09-30',                    -- Sessione autunnale
    '2026-01-07', '2026-02-21'                     -- Sessione invernale
),
(
    'L035', 2024, 'Matematica', 3,
    '2024-09-23', '2024-12-20',                    -- Primo semestre
    '2025-02-26', '2025-05-30',                    -- Secondo semestre
    '2024-11-01', '2024-11-05',                    -- Pausa primo semestre
    '2025-04-10', '2025-04-15',                    -- Pausa secondo semestre
    '2025-01-10', '2025-02-22',                    -- Sessione anticipata
    '2025-06-05', '2025-07-30',                    -- Sessione estiva
    '2025-09-01', '2025-10-01',                    -- Sessione autunnale
    '2026-01-09', '2026-02-20'                     -- Sessione invernale
);

-- Inserimento insegnamenti (ora solo codice e titolo)
INSERT INTO insegnamenti (codice, titolo) VALUES
('A000392', 'Reti di Calcolatori'),
('A000390', 'Algoritmi e Strutture Dati'),
('A000406', 'Sistemi Distribuiti'),
('A000394', 'Basi di Dati'),
('A000403', 'Ingegneria del Software'),
('A000401', 'Intelligenza Artificiale'),
('A000407', 'Machine Learning'),
('A000408', 'Computer Vision'),
('A000385', 'Programmazione I'),
('A000391', 'Sistemi Operativi'),
('A000389', 'Programmazione II'),
('A000450', 'Analisi Matematica I'),
('A000451', 'Algebra Lineare'),
('A000452', 'Analisi Matematica II'),
('A000453', 'Geometria'),
('A000454', 'Fisica Matematica'),
('A000455', 'Calcolo Numerico');

-- Inserimento configurazione insegnamenti per anno 2024
INSERT INTO insegnamenti_cds (insegnamento, anno_accademico, cds, anno_corso, semestre, mutuato_da) VALUES
('A000392', 2024, 'L062', 3, 2, NULL),  -- Reti di Calcolatori
('A000390', 2024, 'L062', 2, 1, NULL),  -- Algoritmi e Strutture Dati
('A000406', 2024, 'L062', 3, 1, NULL),  -- Sistemi Distribuiti
('A000394', 2024, 'L062', 3, 1, NULL),  -- Basi di Dati
('A000403', 2024, 'L062', 2, 1, NULL),  -- Ingegneria del Software
('A000401', 2024, 'L062', 3, 2, NULL),  -- Intelligenza Artificiale
('A000407', 2024, 'L062', 3, 2, NULL),  -- Machine Learning
('A000408', 2024, 'L062', 2, 1, NULL),  -- Computer Vision
('A000385', 2024, 'L062', 1, 1, NULL),  -- Programmazione I
('A000391', 2024, 'L062', 2, 1, NULL),  -- Sistemi Operativi
('A000389', 2024, 'L062', 1, 2, NULL),  -- Programmazione II
('A000450', 2024, 'L035', 1, 1, NULL),  -- Analisi Matematica I
('A000451', 2024, 'L035', 1, 1, NULL),  -- Algebra Lineare
('A000452', 2024, 'L035', 1, 2, NULL),  -- Analisi Matematica II
('A000453', 2024, 'L035', 2, 1, NULL),  -- Geometria
('A000454', 2024, 'L035', 2, 2, NULL),  -- Fisica Matematica
('A000455', 2024, 'L035', 3, 1, NULL);  -- Calcolo Numerico

-- Esempio di cambio semestre/anno per alcuni insegnamenti nel 2025
INSERT INTO insegnamenti_cds (insegnamento, anno_accademico, cds, anno_corso, semestre, mutuato_da) VALUES
('A000392', 2025, 'L062', 3, 1, NULL),  -- Reti di Calcolatori spostato al primo semestre
('A000390', 2025, 'L062', 1, 2, NULL),  -- Algoritmi e Strutture Dati spostato al primo anno, secondo semestre
('A000406', 2025, 'L062', 3, 1, NULL),  -- Sistemi Distribuiti invariato
('A000394', 2025, 'L062', 3, 1, NULL),  -- Basi di Dati invariato
('A000403', 2025, 'L062', 2, 1, NULL),  -- Ingegneria del Software invariato
('A000401', 2025, 'L062', 3, 2, NULL),  -- Intelligenza Artificiale invariato
('A000407', 2025, 'L062', 3, 2, NULL),  -- Machine Learning invariato
('A000408', 2025, 'L062', 2, 1, NULL),  -- Computer Vision invariato
('A000385', 2025, 'L062', 1, 1, NULL),  -- Programmazione I invariato
('A000391', 2025, 'L062', 2, 1, NULL),  -- Sistemi Operativi invariato
('A000389', 2025, 'L062', 1, 2, NULL);  -- Programmazione II invariato

-- Inserimento relazioni insegnamento-docente iniziali e con cambi docente per il 2025
INSERT INTO insegna (insegnamento, docente, annoaccademico) VALUES
-- Anno 2024 (assegnazioni iniziali)
('A000392', 'gn900001', 2024),  -- Reti di Calcolatori: gn900001
('A000390', 'av790001', 2024),  -- Algoritmi e Strutture Dati: av790001
('A000406', 'av790001', 2024),  -- Sistemi Distribuiti: av790001
('A000394', 'lb750001', 2024),  -- Basi di Dati: lb750001
('A000403', 'lb750001', 2024),  -- Ingegneria del Software: lb750001
('A000401', 'pg950001', 2024),  -- Intelligenza Artificiale: pg950001
('A000407', 'pg950001', 2024),  -- Machine Learning: pg950001
('A000408', 'pg950001', 2024),  -- Computer Vision: pg950001
('A000385', 'mr800001', 2024),  -- Programmazione I: mr800001
('A000391', 'mr800001', 2024),  -- Sistemi Operativi: mr800001
('A000389', 'mr800001', 2024),  -- Programmazione II: mr800001
('A000450', 'av790001', 2024),  -- Analisi Matematica I: Anna Verdi
('A000451', 'pg950001', 2024),  -- Algebra Lineare: Paolo Gialli
('A000452', 'mr800001', 2024),  -- Analisi Matematica II: Mario Rossi
('A000453', 'gn900001', 2024),  -- Geometria: Giulia Neri
('A000454', 'lb750001', 2024),  -- Fisica Matematica: Luigi Bianchi
('A000455', 'mr800001', 2024),  -- Calcolo Numerico: Mario Rossi

-- Anno 2025 (con cambi di docente)
('A000392', 'av790001', 2025),  -- Reti di Calcolatori: cambiato da gn900001 a av790001
('A000390', 'gn900001', 2025),  -- Algoritmi e Strutture Dati: cambiato da av790001 a gn900001
('A000406', 'av790001', 2025),  -- Sistemi Distribuiti: invariato con av790001
('A000394', 'lb750001', 2025),  -- Basi di Dati: invariato con lb750001
('A000403', 'mr800001', 2025),  -- Ingegneria del Software: cambiato da lb750001 a mr800001
('A000401', 'pg950001', 2025),  -- Intelligenza Artificiale: invariato con pg950001
('A000407', 'lb750001', 2025),  -- Machine Learning: cambiato da pg950001 a lb750001
('A000408', 'pg950001', 2025),  -- Computer Vision: invariato con pg950001
('A000385', 'mr800001', 2025),  -- Programmazione I: invariato con mr800001
('A000391', 'gn900001', 2025),  -- Sistemi Operativi: cambiato da mr800001 a gn900001
('A000389', 'mr800001', 2025);  -- Programmazione II: invariato con mr800001

-- Inserimento esami di esempio
INSERT INTO esami (
    tipo_appello, docente, insegnamento, aula, 
    data_appello, data_inizio_iscrizione, data_fine_iscrizione, 
    ora_appello, verbalizzazione, tipo_esame, posti,
    definizione_appello, gestione_prenotazione, tipo_iscrizione,
    partizionamento, partizione, codice_turno, riservato,
    note_appello, condizione_sql, durata_appello, periodo
) VALUES
-- Esami AA 2025/2026 (solo sessione anticipata, primo semestre)
    ('PF', 'av790001', 'A000390', 'A2',         -- ASD
    '2026-01-15', '2025-12-15', '2026-01-13', 
    '09:00', 'FIRMA DIGITALE', 'SO', 80,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    'Portare documento identità', NULL, 2.5, 0),

-- Esami AA 2024/2025 (tutte le sessioni)
    ('PF', 'lb750001', 'A000394', 'A0',         -- BD
    '2025-06-15', '2025-05-15', '2025-06-13', 
    '14:30', 'FIRMA DIGITALE', 'S', 120,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 3.0, 1),

    ('PF', 'mr800001', 'A000385', 'I1',       -- PI
    '2025-07-10', '2025-06-10', '2025-07-08', 
    '09:00', 'FIRMA DIGITALE', 'S', 120,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 2.5, 0),

    ('PF', 'pg950001', 'A000401', 'A2',         -- IA
    '2025-06-10', '2025-05-10', '2025-06-08', 
    '09:00', 'FIRMA DIGITALE', 'O', 80,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 2.0, 0),

    ('PF', 'gn900001', 'A000392', 'I1',         -- RC
    '2025-09-15', '2025-08-15', '2025-09-13', 
    '14:30', 'FIRMA DIGITALE', 'SO', 120,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 3.0, 1),

    ('PF', 'mr800001', 'A000389', 'A0',       -- PII
    '2025-02-10', '2025-01-10', '2025-02-08', 
    '09:00', 'FIRMA DIGITALE', 'S', 120,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 2.5, 0),

-- AA 2024/2025 (sessione invernale)
    ('PF', 'lb750001', 'A000394', 'A0',         -- BD
    '2025-01-20', '2024-12-20', '2025-01-18', 
    '14:30', 'FIRMA DIGITALE', 'S', 120,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 3.0, 1),

-- Esami per il CdS di Matematica
    ('PF', 'av790001', 'A000450', 'A0',        -- Analisi Matematica I
    '2025-01-12', '2024-12-12', '2025-01-10', 
    '09:00', 'FIRMA DIGITALE', 'SO', 120,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    'Portare calcolatrice', NULL, 3.0, 0),

    ('PF', 'pg950001', 'A000451', 'A2',        -- Algebra Lineare
    '2025-01-22', '2024-12-22', '2025-01-20', 
    '14:00', 'FIRMA DIGITALE', 'S', 80,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 2.5, 0),

-- Sessione estiva
    ('PF', 'mr800001', 'A000452', 'I1',        -- Analisi Matematica II
    '2025-06-20', '2025-05-20', '2025-06-18', 
    '09:00', 'FIRMA DIGITALE', 'S', 120,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    'Portare calcolatrice scientifica', NULL, 3.5, 0),

    ('PF', 'mr800001', 'A000455', 'B1',        -- Calcolo Numerico
    '2025-07-05', '2025-06-05', '2025-07-03', 
    '14:30', 'FIRMA DIGITALE', 'SO', 20,
    'STD', 'STD', 'STD',
    NULL, NULL, NULL, false,
    NULL, NULL, 3.0, 0);