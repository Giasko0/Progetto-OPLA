/**
 * Script per la gestione dei corsi di studio
 * Versione semplificata che gestisce solo la modifica delle date
 */
document.addEventListener('DOMContentLoaded', function() {
    // Carica gli anni accademici per il selettore in alto
    loadAnniAccademici();
    
    // Gestisci il form di invio
    const cdsForm = document.getElementById('cdsForm');
    if (cdsForm) {
        cdsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveCdsData();
        });
    }
    
    // Reset del form
    const resetFormButton = document.getElementById('resetForm');
    if (resetFormButton) {
        resetFormButton.addEventListener('click', function() {
            const cdsSelect = document.getElementById('selectCds');
            if (cdsSelect.value) {
                loadCdsDetails(cdsSelect.value);
            }
        });
    }
    
    // Inizializza il modal per copiare le date
    initCopyDatesModal();
    
    // Pulsante per copiare le date
    const copyDatesBtn = document.getElementById('copyDatesBtn');
    if (copyDatesBtn) {
        copyDatesBtn.addEventListener('click', function() {
            showCopyDatesModal();
        });
    }
});

/**
 * Carica gli anni accademici per il selettore
 */
function loadAnniAccademici() {
    fetch('/oh-issa/api/getAnniAccademici')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('selectAnnoAccademico');
            if (!select) return;
            
            // Ordina gli anni in modo decrescente
            data.sort((a, b) => b - a);
            
            select.innerHTML = '<option value="">Seleziona anno accademico</option>';
            
            data.forEach(anno => {
                const option = document.createElement('option');
                option.value = anno;
                option.textContent = `${anno}/${anno+1}`;
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Errore nel caricamento degli anni accademici:', error);
            showMessage('error', 'Impossibile caricare gli anni accademici');
        });
}

/**
 * Carica i corsi di studio per un anno specifico
 */
function loadCorsiForAnno(anno) {
    if (!anno) {
        document.getElementById('selectCds').innerHTML = '<option value="">Seleziona un corso</option>';
        document.getElementById('cdsFormContainer').style.display = 'none';
        return;
    }
    
    fetch(`/oh-issa/api/getCdSByAnno?anno=${anno}`)
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('selectCds');
            select.innerHTML = '<option value="">Seleziona un corso</option>';
            
            if (data.length === 0) {
                const option = document.createElement('option');
                option.disabled = true;
                option.textContent = "Nessun corso disponibile per questo anno";
                select.appendChild(option);
            } else {
                data.forEach(cds => {
                    const option = document.createElement('option');
                    option.value = `${cds.codice}_${anno}`;
                    option.textContent = `${cds.codice} - ${cds.nome_corso}`;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Errore nel caricamento dei corsi:', error);
            showMessage('error', 'Impossibile caricare i corsi per l\'anno selezionato');
        });
}

/**
 * Carica i dettagli di un CdS specifico
 */
function loadCdsDetails(value) {
    if (!value) {
        document.getElementById('cdsFormContainer').style.display = 'none';
        return;
    }
    
    // Il valore è in formato "codice_anno"
    const [cdsCode, annoAccademico] = value.split('_');
    
    // Mostra il form
    document.getElementById('cdsFormContainer').style.display = 'block';
    
    // Aggiungi un indicatore di caricamento
    document.getElementById('cdsInfoContainer').innerHTML = '<p>Caricamento informazioni...</p>';
    
    fetch(`/oh-issa/api/getCdsDetails?codice=${cdsCode}&anno=${annoAccademico}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data) {
                showMessage('error', 'Dati del corso non trovati');
                document.getElementById('cdsInfoContainer').innerHTML = '<p>Informazioni non disponibili</p>';
                return;
            }
            
            if (data.error) {
                showMessage('error', data.error);
                document.getElementById('cdsInfoContainer').innerHTML = '<p>Errore: ' + data.error + '</p>';
                return;
            }
            
            console.log("Dati ricevuti:", data);
            
            // Popola i campi nascosti con i dati del corso
            document.getElementById('codice').value = data.codice;
            document.getElementById('anno_accademico').value = data.anno_accademico;
            document.getElementById('nome_corso').value = data.nome_corso;
            
            // Ricrea il contenuto del container delle informazioni
            const infoContainer = document.getElementById('cdsInfoContainer');
            infoContainer.innerHTML = `
                <h3>Informazioni Corso</h3>
                <div class="info-row">
                    <span class="info-label">Codice:</span>
                    <span>${data.codice}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Anno Accademico:</span>
                    <span>${data.anno_accademico}/${parseInt(data.anno_accademico)+1}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Nome Corso:</span>
                    <span>${data.nome_corso}</span>
                </div>
            `;
            
            // Date primo semestre
            document.getElementById('inizio_primo').value = formatDateForInput(data.inizio_lezioni_primo_semestre);
            document.getElementById('fine_primo').value = formatDateForInput(data.fine_lezioni_primo_semestre);
            document.getElementById('pausa_primo_inizio').value = formatDateForInput(data.pausa_primo_inizio);
            document.getElementById('pausa_primo_fine').value = formatDateForInput(data.pausa_primo_fine);
            
            // Date secondo semestre
            document.getElementById('inizio_secondo').value = formatDateForInput(data.inizio_lezioni_secondo_semestre);
            document.getElementById('fine_secondo').value = formatDateForInput(data.fine_lezioni_secondo_semestre);
            document.getElementById('pausa_secondo_inizio').value = formatDateForInput(data.pausa_secondo_inizio);
            document.getElementById('pausa_secondo_fine').value = formatDateForInput(data.pausa_secondo_fine);
            
            // Date sessioni d'esame
            document.getElementById('anticipata_inizio').value = formatDateForInput(data.anticipata_inizio);
            document.getElementById('anticipata_fine').value = formatDateForInput(data.anticipata_fine);
            document.getElementById('estiva_inizio').value = formatDateForInput(data.estiva_inizio);
            document.getElementById('estiva_fine').value = formatDateForInput(data.estiva_fine);
            document.getElementById('autunnale_inizio').value = formatDateForInput(data.autunnale_inizio);
            document.getElementById('autunnale_fine').value = formatDateForInput(data.autunnale_fine);
            document.getElementById('invernale_inizio').value = formatDateForInput(data.invernale_inizio);
            document.getElementById('invernale_fine').value = formatDateForInput(data.invernale_fine);
            
            // Scroll to form
            document.getElementById('cdsFormContainer').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(error => {
            console.error('Errore nel caricamento dei dettagli del corso:', error);
            showMessage('error', 'Impossibile caricare i dettagli del corso: ' + error.message);
            document.getElementById('cdsInfoContainer').innerHTML = '<p>Errore nel caricamento</p>';
        });
}

/**
 * Salva i dati del CdS
 */
function saveCdsData() {
    const formData = new FormData(document.getElementById('cdsForm'));
    const cdsData = {};
    
    // Campi nascosti
    cdsData.codice_cds = formData.get('codice_cds');
    if (!cdsData.codice_cds) {
        showMessage('error', 'Codice CdS mancante');
        return;
    }
    
    const annoAccVal = formData.get('anno_accademico');
    if (!annoAccVal) {
        showMessage('error', 'Anno accademico mancante');
        return;
    }
    
    cdsData.anno_accademico = parseInt(annoAccVal);
    if (isNaN(cdsData.anno_accademico)) {
        showMessage('error', 'Anno accademico non valido');
        return;
    }
    
    cdsData.nome_corso = formData.get('nome_corso');
    
    // Date primo semestre
    cdsData.inizio_primo = formData.get('inizio_primo');
    cdsData.fine_primo = formData.get('fine_primo');
    cdsData.pausa_primo_inizio = formData.get('pausa_primo_inizio') || null;
    cdsData.pausa_primo_fine = formData.get('pausa_primo_fine') || null;
    
    // Date secondo semestre
    cdsData.inizio_secondo = formData.get('inizio_secondo');
    cdsData.fine_secondo = formData.get('fine_secondo');
    cdsData.pausa_secondo_inizio = formData.get('pausa_secondo_inizio') || null;
    cdsData.pausa_secondo_fine = formData.get('pausa_secondo_fine') || null;
    
    // Date sessioni esame
    cdsData.anticipata_inizio = formData.get('anticipata_inizio') || null;
    cdsData.anticipata_fine = formData.get('anticipata_fine') || null;
    cdsData.estiva_inizio = formData.get('estiva_inizio') || null;
    cdsData.estiva_fine = formData.get('estiva_fine') || null;
    cdsData.autunnale_inizio = formData.get('autunnale_inizio') || null;
    cdsData.autunnale_fine = formData.get('autunnale_fine') || null;
    cdsData.invernale_inizio = formData.get('invernale_inizio') || null;
    cdsData.invernale_fine = formData.get('invernale_fine') || null;
    
    // Validazione date obbligatorie
    if (!cdsData.inizio_primo || !cdsData.fine_primo || !cdsData.inizio_secondo || !cdsData.fine_secondo) {
        showMessage('error', 'Le date di inizio e fine dei semestri sono obbligatorie');
        return;
    }

    // Validazione coppie di date
    const datesPairs = [
        {inizio: cdsData.pausa_primo_inizio, fine: cdsData.pausa_primo_fine, name: 'pausa primo semestre'},
        {inizio: cdsData.pausa_secondo_inizio, fine: cdsData.pausa_secondo_fine, name: 'pausa secondo semestre'},
        {inizio: cdsData.anticipata_inizio, fine: cdsData.anticipata_fine, name: 'sessione anticipata'},
        {inizio: cdsData.estiva_inizio, fine: cdsData.estiva_fine, name: 'sessione estiva'},
        {inizio: cdsData.autunnale_inizio, fine: cdsData.autunnale_fine, name: 'sessione autunnale'},
        {inizio: cdsData.invernale_inizio, fine: cdsData.invernale_fine, name: 'sessione invernale'}
    ];

    for (const pair of datesPairs) {
        if ((pair.inizio && !pair.fine) || (!pair.inizio && pair.fine)) {
            showMessage('error', `Entrambe le date di inizio e fine ${pair.name} devono essere specificate o lasciate vuote`);
            return;
        }
    }
    
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
            loadCdsDetails(`${cdsData.codice_cds}_${cdsData.anno_accademico}`);
        } else {
            showMessage('error', data.message);
        }
    })
    .catch(error => {
        console.error('Errore durante il salvataggio:', error);
        showMessage('error', 'Si è verificato un errore durante il salvataggio');
    });
}

/**
 * Mostra un messaggio all'utente
 */
function showMessage(type, message) {
    const messageDiv = document.getElementById('responseMessages');
    if (!messageDiv) return;
    
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    
    const alert = document.createElement('div');
    alert.className = `alert ${alertClass}`;
    alert.textContent = message;
    
    messageDiv.innerHTML = '';
    messageDiv.appendChild(alert);
    
    // Rimuovi il messaggio dopo 5 secondi
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

/**
 * Formatta una data per l'input type="date"
 */
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

/**
 * Inizializza il modal per copiare le date
 */
function initCopyDatesModal() {
    const modal = document.getElementById('copyDatesModal');
    const cancelButton = document.getElementById('cancelCopy');
    const confirmButton = document.getElementById('confirmCopy');
    const sourceCdsYearSelect = document.getElementById('sourceCdsYear');
    
    // Carica gli anni accademici nel modal
    fetch('/oh-issa/api/getAnniAccademici')
        .then(response => response.json())
        .then(data => {
            data.sort((a, b) => b - a);
            sourceCdsYearSelect.innerHTML = '<option value="">Seleziona anno accademico</option>';
            
            data.forEach(anno => {
                const option = document.createElement('option');
                option.value = anno;
                option.textContent = `${anno}/${anno+1}`;
                sourceCdsYearSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Errore nel caricamento degli anni accademici:', error);
        });
    
    // Gestione cambiamento anno accademico nel modal
    sourceCdsYearSelect.addEventListener('change', function() {
        loadCorsiForAnnoModal(this.value);
    });
    
    // Chiusura del modal
    cancelButton.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    // Click fuori dal modal per chiuderlo
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Conferma copia
    confirmButton.addEventListener('click', function() {
        copyDatesFromSource();
    });
}

/**
 * Mostra il modal per copiare le date
 */
function showCopyDatesModal() {
    const modal = document.getElementById('copyDatesModal');
    modal.style.display = 'flex';
}

/**
 * Carica i corsi di studio per un anno specifico nel modal
 */
function loadCorsiForAnnoModal(anno) {
    if (!anno) {
        document.getElementById('sourceCds').innerHTML = '<option value="">Seleziona un corso</option>';
        return;
    }
    
    fetch(`/oh-issa/api/getCdSByAnno?anno=${anno}`)
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('sourceCds');
            select.innerHTML = '<option value="">Seleziona un corso</option>';
            
            if (data.length === 0) {
                const option = document.createElement('option');
                option.disabled = true;
                option.textContent = "Nessun corso disponibile per questo anno";
                select.appendChild(option);
            } else {
                data.forEach(cds => {
                    const option = document.createElement('option');
                    option.value = `${cds.codice}_${anno}`;
                    option.textContent = `${cds.codice} - ${cds.nome_corso}`;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Errore nel caricamento dei corsi:', error);
        });
}

/**
 * Copia le date dal CdS selezionato
 */
function copyDatesFromSource() {
    const sourceCdsValue = document.getElementById('sourceCds').value;
    if (!sourceCdsValue) {
        showMessage('error', 'Seleziona un corso di studio di origine');
        return;
    }
    
    const [sourceCode, sourceYear] = sourceCdsValue.split('_');
    
    fetch(`/oh-issa/api/getCdsDetails?codice=${sourceCode}&anno=${sourceYear}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showMessage('error', data.error);
                return;
            }
            
            // Date primo semestre
            document.getElementById('inizio_primo').value = formatDateForInput(data.inizio_lezioni_primo_semestre);
            document.getElementById('fine_primo').value = formatDateForInput(data.fine_lezioni_primo_semestre);
            document.getElementById('pausa_primo_inizio').value = formatDateForInput(data.pausa_primo_inizio);
            document.getElementById('pausa_primo_fine').value = formatDateForInput(data.pausa_primo_fine);
            
            // Date secondo semestre
            document.getElementById('inizio_secondo').value = formatDateForInput(data.inizio_lezioni_secondo_semestre);
            document.getElementById('fine_secondo').value = formatDateForInput(data.fine_lezioni_secondo_semestre);
            document.getElementById('pausa_secondo_inizio').value = formatDateForInput(data.pausa_secondo_inizio);
            document.getElementById('pausa_secondo_fine').value = formatDateForInput(data.pausa_secondo_fine);
            
            // Date sessioni d'esame
            document.getElementById('anticipata_inizio').value = formatDateForInput(data.anticipata_inizio);
            document.getElementById('anticipata_fine').value = formatDateForInput(data.anticipata_fine);
            document.getElementById('estiva_inizio').value = formatDateForInput(data.estiva_inizio);
            document.getElementById('estiva_fine').value = formatDateForInput(data.estiva_fine);
            document.getElementById('autunnale_inizio').value = formatDateForInput(data.autunnale_inizio);
            document.getElementById('autunnale_fine').value = formatDateForInput(data.autunnale_fine);
            document.getElementById('invernale_inizio').value = formatDateForInput(data.invernale_inizio);
            document.getElementById('invernale_fine').value = formatDateForInput(data.invernale_fine);
            
            // Chiudi il modal e mostra messaggio di successo
            document.getElementById('copyDatesModal').style.display = 'none';
            showMessage('success', `Date copiate con successo dal corso ${sourceCode} (${data.nome_corso})`);
        })
        .catch(error => {
            console.error('Errore nel caricamento dei dettagli del corso:', error);
            showMessage('error', 'Impossibile caricare i dettagli del corso selezionato');
        });
}
