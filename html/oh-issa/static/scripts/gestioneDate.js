/**
 * Script per la gestione delle date dei corsi di studio
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
    
    // Reset del form - mostra il modale di conferma invece di resettare subito
    const resetFormButton = document.getElementById('resetForm');
    if (resetFormButton) {
        resetFormButton.addEventListener('click', function() {
            showResetConfirmModal();
        });
    }
    
    // Inizializza il modal per copiare le date
    initCopyDatesModal();
    
    // Inizializza il modal per confermare il reset
    initResetConfirmModal();
    
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
    fetch('/api/get-anni-accademici')
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
    
    fetch(`/api/oh-issa/get-cds-by-anno?anno=${anno}`)
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
                // Oggetto per tenere traccia dei CdS già aggiunti (per codice)
                const cdsByCode = {};
                
                // Scorri i dati e conserva un solo record per ogni codice
                data.forEach(cds => {
                    if (!cdsByCode[cds.codice]) {
                        cdsByCode[cds.codice] = cds;
                    }
                });
                
                // Aggiungi le opzioni filtrate
                Object.values(cdsByCode).forEach(cds => {
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
    
    fetch(`/api/oh-issa/get-cds-details?codice=${cdsCode}&anno=${annoAccademico}`)
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
            
            // Popola i campi delle sessioni d'esame
            const sessionTypes = ['anticipata', 'estiva', 'autunnale', 'invernale'];
            sessionTypes.forEach(tipo => {
                // Date
                if (data[`${tipo}_inizio`]) {
                    document.getElementById(`${tipo}_inizio`).value = formatDateForInput(data[`${tipo}_inizio`]);
                }
                if (data[`${tipo}_fine`]) {
                    document.getElementById(`${tipo}_fine`).value = formatDateForInput(data[`${tipo}_fine`]);
                }
                // Numero esami per semestre (solo primo semestre per la sessione anticipata)
                if (data[`${tipo}_esami_primo`] !== undefined) {
                    document.getElementById(`${tipo}_esami_primo`).value = data[`${tipo}_esami_primo`] || '';
                }
                if (tipo !== 'anticipata' && data[`${tipo}_esami_secondo`] !== undefined) {
                    document.getElementById(`${tipo}_esami_secondo`).value = data[`${tipo}_esami_secondo`] || '';
                }
            });
            
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
    
    // Date delle sessioni esame e numero esami per semestre
    const sessionTypes = ['anticipata', 'estiva', 'autunnale', 'invernale'];
    sessionTypes.forEach(tipo => {
        const inizio = formData.get(`${tipo}_inizio`);
        const fine = formData.get(`${tipo}_fine`);
        const esamiPrimo = formData.get(`${tipo}_esami_primo`);
        const esamiSecondo = formData.get(`${tipo}_esami_secondo`);
        
        if (inizio) cdsData[`${tipo}_inizio`] = inizio;
        if (fine) cdsData[`${tipo}_fine`] = fine;
        if (esamiPrimo) cdsData[`${tipo}_esami_primo`] = parseInt(esamiPrimo) || null;
        // La sessione anticipata non ha esami del secondo semestre
        if (tipo !== 'anticipata' && esamiSecondo) {
            cdsData[`${tipo}_esami_secondo`] = parseInt(esamiSecondo) || null;
        }
    });
    
    // Validazione coppie di date
    for (const tipo of sessionTypes) {
        const inizio = cdsData[`${tipo}_inizio`];
        const fine = cdsData[`${tipo}_fine`];
        if ((inizio && !fine) || (!inizio && fine)) {
            showMessage('error', `Entrambe le date di inizio e fine della sessione ${tipo} devono essere specificate o lasciate vuote`);
            return;
        }
    }
    
    // Invia i dati al server
    fetch('/api/oh-issa/save-cds-dates', {
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
    
    let alertClass;
    switch(type) {
        case 'success':
            alertClass = 'alert-success';
            break;
        case 'error':
            alertClass = 'alert-danger';
            break;
        case 'info':
            alertClass = 'alert-info';
            break;
        default:
            alertClass = 'alert-info';
    }
    
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
    fetch('/api/get-anni-accademici')
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
    
    fetch(`/api/oh-issa/get-cds-by-anno?anno=${anno}`)
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
                // Oggetto per tenere traccia dei CdS già aggiunti (per codice)
                const cdsByCode = {};
                
                // Scorri i dati e conserva un solo record per ogni codice
                data.forEach(cds => {
                    if (!cdsByCode[cds.codice]) {
                        cdsByCode[cds.codice] = cds;
                    }
                });
                
                // Aggiungi le opzioni filtrate
                Object.values(cdsByCode).forEach(cds => {
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
    
    fetch(`/api/oh-issa/get-cds-details?codice=${sourceCode}&anno=${sourceYear}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showMessage('error', data.error);
                return;
            }
            
            // Popola i campi delle sessioni d'esame
            const sessionTypes = ['anticipata', 'estiva', 'autunnale', 'invernale'];
            sessionTypes.forEach(tipo => {
                // Date
                if (data[`${tipo}_inizio`]) {
                    document.getElementById(`${tipo}_inizio`).value = formatDateForInput(data[`${tipo}_inizio`]);
                }
                if (data[`${tipo}_fine`]) {
                    document.getElementById(`${tipo}_fine`).value = formatDateForInput(data[`${tipo}_fine`]);
                }
            });
            
            // Chiudi il modal e mostra messaggio di successo
            document.getElementById('copyDatesModal').style.display = 'none';
            showMessage('success', `Date copiate con successo dal corso ${sourceCode} (${data.nome_corso})`);
        })
        .catch(error => {
            console.error('Errore nel caricamento dei dettagli del corso:', error);
            showMessage('error', 'Impossibile caricare i dettagli del corso selezionato');
        });
}

/**
 * Inizializza il modal per confermare il reset
 */
function initResetConfirmModal() {
    const modal = document.getElementById('resetConfirmModal');
    const cancelButton = document.getElementById('cancelReset');
    const confirmButton = document.getElementById('confirmReset');
    
    // Gestione click su Annulla - chiude il modal
    cancelButton.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    // Gestione click su Conferma - esegue il reset e chiude il modal
    confirmButton.addEventListener('click', function() {
        const cdsSelect = document.getElementById('selectCds');
        if (cdsSelect.value) {
            loadCdsDetails(cdsSelect.value);
            showMessage('info', 'Dati ripristinati allo stato originale');
        }
        modal.style.display = 'none';
    });
    
    // Chiusura del modal cliccando fuori
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

/**
 * Mostra il modal di conferma reset
 */
function showResetConfirmModal() {
    const modal = document.getElementById('resetConfirmModal');
    modal.style.display = 'flex';
}