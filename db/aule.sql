CREATE TABLE aule (
  nome TEXT PRIMARY KEY,
  sede TEXT,
  edificio TEXT,
  posti INT
);

INSERT INTO aule (nome, sede, edificio, posti) VALUES
  ('Ufficio docente', '', '', NULL),
  ('A0', 'Perugia', 'Dipartimento di Matematica e Informatica', 120),
  ('A2', 'Perugia', 'Dipartimento di Matematica e Informatica', 80),
  ('A3', 'Perugia', 'Dipartimento di Matematica e Informatica', 30),
  ('B1', 'Perugia', 'Dipartimento di Matematica e Informatica', 20),
  ('B3', 'Perugia', 'Dipartimento di Matematica e Informatica', 20),
  ('C2', 'Perugia', 'Dipartimento di Matematica e Informatica', 15),
  ('C3', 'Perugia', 'Dipartimento di Matematica e Informatica', 20),
  ('Aula verde', 'Perugia', 'Dipartimento di Matematica e Informatica', 30),
  ('Aula gialla', 'Perugia', 'Dipartimento di Matematica e Informatica', 40),
  ('I1', 'Perugia', 'Dipartimento di Matematica e Informatica', 120),
  ('I2', 'Perugia', 'Dipartimento di Matematica e Informatica', 80),
  ('Aula riunioni', 'Perugia', 'Dipartimento di Matematica e Informatica', 25);
