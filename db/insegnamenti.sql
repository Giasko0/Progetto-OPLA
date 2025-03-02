CREATE TABLE IF NOT EXISTS insegnamenti (
    codice TEXT PRIMARY KEY,
    titolo TEXT NOT NULL,
    cds TEXT NOT NULL,
    anno INTEGER NOT NULL,
    annocorso INTEGER NOT NULL,
    semestre INTEGER NOT NULL,
    docente TEXT,
    FOREIGN KEY (docente) REFERENCES docenti(matricola)
);

INSERT INTO insegnamenti (codice, titolo, cds, anno, annocorso, semestre, docente) VALUES
-- Docente gn900001 (1 insegnamenti)
('RC', 'Reti di Calcolatori', 'Informatica', 2025, 3, 2, 'gn900001'),
-- Docente av790001 (2 insegnamenti)
('ASD', 'Algoritmi e Strutture Dati', 'Informatica', 2025, 2, 1, 'av790001'),
('SD', 'Sistemi Distribuiti', 'Informatica', 2025, 3, 1, 'av790001'),
-- Docente lb750001 (2 insegnamenti)
('BD', 'Basi di Dati', 'Informatica', 2025, 3, 1, 'lb750001'),
('IS', 'Ingegneria del Software', 'Informatica', 2025, 2, 1, 'lb750001'),
-- Docente pg950001 (3 insegnamenti)
('IA', 'Intelligenza Artificiale', 'Informatica', 2025, 3, 2, 'pg950001'),
('ML', 'Machine Learning', 'Informatica', 2025, 3, 2, 'pg950001'),
('CV', 'Computer Vision', 'Informatica', 2025, 2, 1, 'pg950001'),
-- Docente mr800001 (3 insegnamenti)
('PI', 'Programmazione I', 'Informatica', 2025, 1, 1, 'mr800001'),
('SO', 'Sistemi Operativi', 'Informatica', 2025, 2, 1, 'mr800001'),
('PO', 'Programmazione II', 'Informatica', 2025, 1, 2, 'mr800001')