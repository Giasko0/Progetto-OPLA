# Inserimento Automatico Date Appelli

Benvenuti in **OPLÀ**! Questo progetto offre un modo semplice e diretto per permettere ai docenti di gestire e inserire le date degli esami in maniera centralizzata. Permette di verificare eventuali conflitti, prenotare aule e di esportare i dati nel formato richiesto dal sistema SOL dell’ateneo.

## Requisiti

- Docker e Docker Compose installati.
- Credenziali per il login (utilizzate in ambiente demo).

## Installazione e Avvio

1. Clona il repository.
2. Dal terminale, esegui:
```docker-compose up --build -d```
   Questo comando avvia:
   - Il server Flask su porta 5000 (accessibile tramite Nginx sulla porta 80).
   - PostgreSQL su porta 5432.
   - pgAdmin disponibile su [http://localhost:4400](http://localhost:4400).

3. Accedi all’applicazione tramite `http://localhost/flask`.
4. Ferma i container con ``` docker-compose down ```

## Uso dell'Applicazione

- **Autenticazione:**  
  Il login è gestito tramite l'API in [app.py](http://_vscodecontentref_/0) e la pagina login.html.

- **Inserimento Esami:**  
  Usa il calendario in index.html. Cliccando su un giorno, apparirà il form per inserire un esame (template in flask/templates/formAule.html).

- **Visualizzazione Esami:**  
  La pagina elencoEsami.html mostra l’elenco degli esami, con funzioni di ordinamento e filtraggio supportate dagli script elencoEsami.js e filtraEsami.js.

## API Principali

- **Login:** `POST /flask/api/login`  
  Autentica il docente e imposta il cookie `username`.

- **Inserisci Esame:** `POST /flask/api/inserisciEsame`  
  Inserisce un nuovo esame nel database, verificando conflitti di data e prenotando aule disponibili.

- **Ottieni Esami:** `GET /flask/api/ottieniEsami`  
  Restituisce la lista degli esami in formato JSON per il calendario.

- **Ottieni Insegnamenti:** `GET /flask/api/ottieniInsegnamenti`  
  Recupera gli insegnamenti associati al docente.

- **Filtra Esami:** `GET /flask/api/filtraEsami`  
  Permette il filtraggio degli esami in base all’anno accademico.

## Note

- La validazione dei dati e la gestione dei conflitti (massimo due esami per giorno e controllo delle aule) sono implementate nella funzione inserisciEsame.
- I file statici e i template sono organizzati per facilitare la manutenzione e garantire un’esperienza utente ottimale.
- Le configurazioni Docker e Nginx assicurano un deployment semplice in ambiente containerizzato.