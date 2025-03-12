/**
 * Script per la gestione dei corsi di studio
 */
document.addEventListener('DOMContentLoaded', function() {
    // Carica gli anni accademici disponibili
    fetch('/api/getAnniAccademici')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('anno_accademico');
            if (!select) return;
            
            select.innerHTML = ''; // Pulisci le opzioni esistenti
            
            data.forEach(anno => {
                const option = document.createElement('option');
                option.value = anno;
                option.textContent = `${anno}/${anno+1}`;
                select.appendChild(option);
            });
            
            // Aggiungi opzione per nuovo anno
            const currentYear = new Date().getFullYear();
            const newYear = currentYear + 1;
            const option = document.createElement('option');
            option.value = newYear;
            option.textContent = `${newYear}/${newYear+1} (Nuovo)`;
            select.appendChild(option);
        })
        .catch(error => {
            console.error('Errore nel caricamento degli anni accademici:', error);
            showMessage('error', 'Impossibile caricare gli anni accademici');
        });
    
    // Carica i corsi di studio esistenti
    loadExistingCdS();
    
    // Gestisci il form
    const cdsForm = document.getElementById('cdsForm');
    if (cdsForm) {
        cdsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const cdsData = {};
            
            // Converti i dati del form in un oggetto
            for (let [key, value] of formData.entries()) {
                cdsData[key] = value;
            }
            
            // Converti l'anno accademico in numero intero
            cdsData.anno_accademico = parseInt(cdsData.anno_accademico);
            cdsData.durata = parseInt(cdsData.durata);
            
            // Invia i dati al server
            fetch('/oh-issa/api/save-cds-dates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(cdsData),
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    showMessage('success', data.message);
                    loadExistingCdS(); // Ricarica la lista dei corsi
                } else {
                    showMessage('error', data.message);
                }
            })
            .catch(error => {
                console.error('Errore durante il salvataggio:', error);
                showMessage('error', 'Si è verificato un errore durante il salvataggio');
            });
        });
    }
    
    // Reset del form
    const resetFormButton = document.getElementById('resetForm');
    if (resetFormButton) {
        resetFormButton.addEventListener('click', function() {
            document.getElementById('cdsForm').reset();
        });
    }
});

// Funzione per mostrare messaggi
function showMessage(type, message) {
    const messageDiv = document.getElementById('responseMessages');
    if (!messageDiv) return;
    
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    
    const alert = document.createElement('div');
    alert.className = `alert ${alertClass}`;
    alert.textContent = message;
    
    messageDiv.appendChild(alert);
    
    // Rimuovi il messaggio dopo 5 secondi
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Funzione per caricare i corsi di studio esistenti
function loadExistingCdS() {
    const container = document.getElementById('cdsContainer');
    if (!container) return;
    
    container.innerHTML = '<p>Caricamento in corso...</p>';
    
    fetch('/oh-issa/api/getCdS')
        .then(response => response.json())
        .then(data => {
            if (data.length === 0) {
                container.innerHTML = '<p>Nessun corso di studio trovato.</p>';
                return;
            }
            
            // Crea la tabella dei corsi
            const table = document.createElement('table');
            
            // Intestazione
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Codice', 'Nome Corso', 'Anno Accademico', 'Azioni'].forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);
            
            // Corpo della tabella
            const tbody = document.createElement('tbody');
            data.forEach(cds => {
                const row = document.createElement('tr');
                
                const codeCell = document.createElement('td');
                codeCell.textContent = cds.codice;
                row.appendChild(codeCell);
                
                const nameCell = document.createElement('td');
                nameCell.textContent = cds.nome_corso;
                row.appendChild(nameCell);
                
                // Aggiungi cella per l'anno accademico
                const yearCell = document.createElement('td');
                yearCell.textContent = `${cds.anno_accademico}/${cds.anno_accademico + 1}`;
                row.appendChild(yearCell);
                
                const actionCell = document.createElement('td');
                
                // Pulsante di modifica
                const editBtn = document.createElement('button');
                editBtn.className = 'btn';
                editBtn.textContent = 'Modifica';
                editBtn.onclick = function() {
                    loadCdsDetails(cds.codice, cds.anno_accademico);
                };
                actionCell.appendChild(editBtn);
                
                // Spazio tra i pulsanti
                actionCell.appendChild(document.createTextNode(' '));
                
                // Pulsante per eliminare (sostituisce il pulsante duplica)
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger';
                deleteBtn.textContent = 'Elimina';
                deleteBtn.onclick = function() {
                    deleteCds(cds.codice, cds.anno_accademico);
                };
                actionCell.appendChild(deleteBtn);
                
                row.appendChild(actionCell);
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            
            // Aggiungi la tabella al container
            container.innerHTML = '';
            container.appendChild(table);
        })
        .catch(error => {
            console.error('Errore nel caricamento dei corsi di studio:', error);
            container.innerHTML = '<p>Errore nel caricamento dei corsi di studio.</p>';
        });
}

// Funzione per caricare i dettagli di un CdS nel form
function loadCdsDetails(cdsCode, annoAccademico) {
    fetch(`/oh-issa/api/getCdsDetails?codice=${cdsCode}&anno=${annoAccademico}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showMessage('error', data.error);
                return;
            }
            
            // Popola il form con i dati del CdS
            document.getElementById('codice').value = data.codice;
            document.getElementById('anno_accademico').value = data.anno_accademico;
            document.getElementById('nome_corso').value = data.nome_corso;
            document.getElementById('durata').value = data.durata;
            
            // Date primo semestre
            document.getElementById('inizio_lezioni_primo_semestre').value = formatDateForInput(data.inizio_lezioni_primo_semestre);
            document.getElementById('fine_lezioni_primo_semestre').value = formatDateForInput(data.fine_lezioni_primo_semestre);
            document.getElementById('pausa_didattica_primo_inizio').value = formatDateForInput(data.pausa_didattica_primo_inizio);
            document.getElementById('pausa_didattica_primo_fine').value = formatDateForInput(data.pausa_didattica_primo_fine);
            
            // Date secondo semestre
            document.getElementById('inizio_lezioni_secondo_semestre').value = formatDateForInput(data.inizio_lezioni_secondo_semestre);
            document.getElementById('fine_lezioni_secondo_semestre').value = formatDateForInput(data.fine_lezioni_secondo_semestre);
            document.getElementById('pausa_didattica_secondo_inizio').value = formatDateForInput(data.pausa_didattica_secondo_inizio);
            document.getElementById('pausa_didattica_secondo_fine').value = formatDateForInput(data.pausa_didattica_secondo_fine);
            
            // Date sessioni d'esame
            document.getElementById('inizio_sessione_anticipata').value = formatDateForInput(data.inizio_sessione_anticipata);
            document.getElementById('fine_sessione_anticipata').value = formatDateForInput(data.fine_sessione_anticipata);
            document.getElementById('inizio_sessione_estiva').value = formatDateForInput(data.inizio_sessione_estiva);
            document.getElementById('fine_sessione_estiva').value = formatDateForInput(data.fine_sessione_estiva);
            document.getElementById('inizio_sessione_autunnale').value = formatDateForInput(data.inizio_sessione_autunnale);
            document.getElementById('fine_sessione_autunnale').value = formatDateForInput(data.fine_sessione_autunnale);
            document.getElementById('inizio_sessione_invernale').value = formatDateForInput(data.inizio_sessione_invernale);
            document.getElementById('fine_sessione_invernale').value = formatDateForInput(data.fine_sessione_invernale);
            
            // Scroll to form
            document.querySelector('h1').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(error => {
            console.error('Errore nel caricamento dei dettagli del corso:', error);
            showMessage('error', 'Impossibile caricare i dettagli del corso');
        });
}

// Funzione per eliminare un CdS
function deleteCds(cdsCode, annoAccademico) {
    // Chiedi conferma prima di procedere
    if (!confirm(`Sei sicuro di voler eliminare il corso ${cdsCode} (A.A. ${annoAccademico}/${annoAccademico+1})?`)) {
        return; // Interrompi se l'utente annulla
    }
    
    // Invia la richiesta di eliminazione al server
    fetch('/oh-issa/api/deleteCds', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            codice: cdsCode,
            anno_accademico: annoAccademico
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showMessage('success', data.message || 'Corso di studio eliminato con successo');
            // Ricarica la lista dei corsi dopo l'eliminazione
            loadExistingCdS();
        } else {
            showMessage('error', data.message || 'Errore durante l\'eliminazione del corso di studio');
        }
    })
    .catch(error => {
        console.error('Errore durante l\'eliminazione:', error);
        showMessage('error', 'Si è verificato un errore durante l\'eliminazione');
    });
}

// Funzione helper per formattare una data per input type="date"
function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    
    try {
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error('Errore nella formattazione della data:', e);
        return '';
    }
}
