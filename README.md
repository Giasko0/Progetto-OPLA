# Progetto di tirocinio: Inserimento automatico date appelli
### Obiettivo
Creare una piattaforma che consenta ai docenti di inserire e gestire le date degli esami in modo rapido e centralizzato, con la possibilità di esportare i dati in un formato compatibile con il sistema SOL dell’ateneo.

### Funzionalità Principali

1. **Inserimento Esami**
   - Il docente accede al sistema e visualizza solo gli esami di cui è responsabile.
   - Per ogni esame, inserisce data, periodo (mattina/pomeriggio) e aula preferita.
   - Il sistema verifica eventuali conflitti con altri esami dello stesso anno.
   - In caso di conflitto, suggerisce aule alternative disponibili.

2. **Gestione degli Spazi**
   - Se l’aula preferita è libera, viene automaticamente prenotata.
   - Se occupata, vengono proposte altre opzioni di aule disponibili.

3. **Esportazione Dati**
   - Al termine dell’inserimento, i dati vengono esportati in un file Excel compatibile con il formato di importazione del sistema SOL.
   - Questa esportazione consente di caricare tutte le informazioni in un’unica operazione.

4. **Gestione Docente**
   - Autenticazione per permettere ai docenti di accedere solo agli esami di propria competenza.
   - Salvataggio automatico delle date e dei dettagli di ciascun esame nel database.
	- Per l'autenticazione usare le credenziali di ateneo. Parlare con Francesco Sportolari.

### Configurazione da parte dell'Amministratore

L’amministratore configura il sistema con i seguenti dati:

   - **Sessioni d'esame**: definisce le finestre temporali (sessioni) e il numero di appelli per ogni docente.
   - **Informazioni sugli insegnamenti**: idealmente importate da u-gov (inclusi codice esame, nome, semestre, anno, corso di laurea e curriculum).

### Flusso di lavoro dell’Utente Docente

1. **Selezione Esami**: Il sistema mostra l'elenco degli esami assegnati al docente.
2. **Inserimento Dati**: Per ogni esame, il docente indica data, ora e aula.
3. **Salvataggio e Conferma**: Una volta confermati i dettagli, il sistema prenota l’aula e memorizza le informazioni nel database.

## Componenti dello sviluppo
1. **Autenticazione**: Parlare con Francesco Sportolari per ottenere informazioni sui docenti e relativi insegnamenti e gestire gli accessi.
2. **Dati di input**: Da u-gov prelevare informazioni sull'offerta formativa dell'anno corrente, forse ridondante se si usa il punto 1.
3. **Inserimento dei dati**: I docenti, rispettando i vincoli forniti dall'amministratore, inseriscono i dati tramite il calendario.
4. (opzionale) **Modifiche dei dati**: Se un docente cambia data, viene salvata la modifica in un database esterno (trovare soluzione alternativa).
5. **Esportare il database**: Dump del database in un file Excel che verrà caricato sul server, questo file dovrebbe essere strutturato similmente al [PDF con le date degli appelli](https://www.dmi.unipg.it/files/informatica/doc-triennale/calendario-esami/2024_2025_cal_esami_triennale_02.pdf)