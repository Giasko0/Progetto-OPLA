/**
 * Script per la gestione delle date globali del sistema
 * Gestisce configurazioni che si applicano a tutti i corsi dell'ateneo
 */
document.addEventListener('DOMContentLoaded', function() {
    // Carica gli anni accademici per il selettore
    loadAnniAccademici();
    
    // Gestisci il form di invio
    const globalDatesForm = document.getElementById('globalDatesForm');
    if (globalDatesForm) {
        globalDatesForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveGlobalDatesData();
        });
    }
    
    // Reset del form
    const resetFormButton = document.getElementById('resetForm');
    if (resetFormButton) {
        resetFormButton.addEventListener('click', function() {
            showResetConfirmModal();
        });
    }
    
    // Pulsante per copiare da anno precedente
    const copyFromPreviousYearBtn = document.getElementById('copyFromPreviousYear');
    if (copyFromPreviousYearBtn) {
        copyFromPreviousYearBtn.addEventListener('click', function() {
            showCopyFromPreviousModal();
        });
    }
    
    // Inizializza i modal
    initCopyFromPreviousModal();
    initResetConfirmModal();
    
    // Inizializza la gestione delle vacanze
    initVacanzeManagement();
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
 * Carica i dettagli delle date globali per un anno accademico
 */
function loadAnnoAccademicoDetails(anno) {
    if (!anno) {
        document.getElementById('globalDatesFormContainer').style.display = 'none';
        return;
    }
    
    // Mostra il form
    document.getElementById('globalDatesFormContainer').style.display = 'block';
    
    // Aggiungi un indicatore di caricamento
    document.getElementById('annoInfoContainer').innerHTML = '<p>Caricamento configurazioni...</p>';
    
    fetch(`/api/oh-issa/get-global-dates?anno=${anno}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Popola il campo nascosto dell'anno accademico
            document.getElementById('anno_accademico').value = anno;
            
            // Ricrea il contenuto del container delle informazioni
            const infoContainer = document.getElementById('annoInfoContainer');
            infoContainer.innerHTML = `
                <h3>Anno Accademico ${anno}/${parseInt(anno)+1}</h3>
                <p>Configurazione delle date globali che si applicano a tutti i corsi dell'ateneo</p>
            `;
            
            if (data && !data.error) {
                // Popola il target esami di default
                populateField('target_esami_default', data.target_esami_default);
                
                // Popola le vacanze
                if (data.vacanze) {
                    loadVacanze(data.vacanze);
                } else {
                    clearVacanzeContainer();
                }
            } else {
                // Nessun dato trovato, inizializza con valori di default
                initializeDefaultValues();
                clearVacanzeContainer();
            }
        })
        .catch(error => {
            console.error('Errore nel caricamento delle configurazioni:', error);
            
            // Inizializza con valori di default in caso di errore
            initializeDefaultValues();
            clearVacanzeContainer();
            
            if (error.message.includes('404')) {
                showMessage('info', 'Nessuna configurazione trovata per questo anno. Puoi crearne una nuova.');
            } else {
                showMessage('error', 'Impossibile caricare le configurazioni: ' + error.message);
            }
        });
}

/**
 * Popola un campo del form
 */
function populateField(fieldId, value, defaultValue = '') {
    const field = document.getElementById(fieldId);
    if (field) {
        if (value !== undefined && value !== null) {
            if (field.type === 'date') {
                field.value = formatDateForInput(value);
            } else {
                field.value = value;
            }
        } else {
            field.value = defaultValue;
        }
    }
}

/**
 * Inizializza i campi con valori di default
 */
function initializeDefaultValues() {
    // Non ci sono valori di default da impostare per target esami
}

/**
 * Salva i dati delle date globali
 */
function saveGlobalDatesData() {
    const formData = new FormData(document.getElementById('globalDatesForm'));
    const globalData = {};
    
    // Anno accademico
    const annoAccVal = formData.get('anno_accademico');
    if (!annoAccVal) {
        showMessage('error', 'Anno accademico mancante');
        return;
    }
    
    globalData.anno_accademico = parseInt(annoAccVal);
    
    // Target esami di default
    const targetEsami = formData.get('target_esami_default');
    if (targetEsami) {
        globalData.target_esami_default = parseInt(targetEsami) || null;
    }
    
    // Raccogli i dati delle vacanze
    globalData.vacanze = collectVacanzeData();
    
    // Validazione non necessaria per il momento
    
    // Invia i dati al server
    fetch('/api/oh-issa/save-global-dates', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(globalData),
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showMessage('success', data.message);
            loadAnnoAccademicoDetails(globalData.anno_accademico);
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
 * Inizializza la gestione delle vacanze
 */
function initVacanzeManagement() {
    const addVacanzaBtn = document.getElementById('addVacanzaBtn');
    if (addVacanzaBtn) {
        addVacanzaBtn.addEventListener('click', addVacanzaItem);
    }
}

/**
 * Aggiunge un nuovo elemento vacanza
 */
function addVacanzaItem() {
    const template = document.getElementById('vacanza-template');
    const container = document.getElementById('vacanze-container');
    
    if (!template || !container) return;
    
    // Clona il template
    const clone = template.content.cloneNode(true);
    
    // Aggiungi event listener per il pulsante rimuovi
    const removeBtn = clone.querySelector('.remove-vacanza');
    removeBtn.addEventListener('click', function() {
        this.closest('.vacanza-item').remove();
    });
    
    // Aggiungi event listener per il cambio tipo vacanza
    const tipoSelect = clone.querySelector('.vacanza-tipo');
    tipoSelect.addEventListener('change', function() {
        handleVacanzaTypeChange(this);
    });
    
    // Aggiungi al container
    container.appendChild(clone);
}

/**
 * Gestisce il cambio del tipo di vacanza
 */
function handleVacanzaTypeChange(selectElement) {
    const vacanzaItem = selectElement.closest('.vacanza-item');
    const customGroup = vacanzaItem.querySelector('.vacanza-custom');
    
    if (selectElement.value === 'altro') {
        customGroup.style.display = 'block';
    } else {
        customGroup.style.display = 'none';
    }
}

/**
 * Carica le vacanze esistenti
 */
function loadVacanze(vacanzeData) {
    const container = document.getElementById('vacanze-container');
    if (!container) return;
    
    // Pulisci il container
    container.innerHTML = '';
    
    // Se ci sono vacanze, aggiungile
    if (vacanzeData && vacanzeData.length > 0) {
        vacanzeData.forEach(vacanza => {
            addVacanzaItem();
            
            // Popola l'ultimo elemento aggiunto
            const items = container.querySelectorAll('.vacanza-item');
            const lastItem = items[items.length - 1];
            
            if (lastItem) {
                const descrizione = vacanza.descrizione || '';
                const selectTipo = lastItem.querySelector('.vacanza-tipo');
                const inputCustom = lastItem.querySelector('.vacanza-descrizione-custom');
                const customGroup = lastItem.querySelector('.vacanza-custom');
                
                // Controlla se la descrizione corrisponde a una delle opzioni predefinite
                const optionExists = Array.from(selectTipo.options).some(option => 
                    option.value === descrizione && option.value !== 'altro'
                );
                
                if (optionExists) {
                    // È una vacanza predefinita
                    selectTipo.value = descrizione;
                } else if (descrizione) {
                    // È una descrizione personalizzata
                    selectTipo.value = 'altro';
                    inputCustom.value = descrizione;
                    customGroup.style.display = 'block';
                }
                
                lastItem.querySelector('.vacanza-inizio').value = formatDateForInput(vacanza.inizio);
                lastItem.querySelector('.vacanza-fine').value = formatDateForInput(vacanza.fine);
            }
        });
    }
}

/**
 * Pulisce il container delle vacanze
 */
function clearVacanzeContainer() {
    const container = document.getElementById('vacanze-container');
    if (container) {
        container.innerHTML = '';
    }
}

/**
 * Raccoglie i dati delle vacanze dal form
 */
function collectVacanzeData() {
    const container = document.getElementById('vacanze-container');
    if (!container) return [];
    
    const vacanze = [];
    const vacanzeItems = container.querySelectorAll('.vacanza-item');
    
    vacanzeItems.forEach(item => {
        const selectTipo = item.querySelector('.vacanza-tipo');
        const inputCustom = item.querySelector('.vacanza-descrizione-custom');
        const inizio = item.querySelector('.vacanza-inizio').value;
        const fine = item.querySelector('.vacanza-fine').value;
        
        let descrizione = '';
        
        // Determina la descrizione in base alla selezione
        if (selectTipo.value === 'altro') {
            descrizione = inputCustom.value.trim();
        } else {
            descrizione = selectTipo.value;
        }
        
        // Aggiungi solo se ha almeno la descrizione
        if (descrizione || inizio || fine) {
            vacanze.push({
                descrizione: descrizione,
                inizio: inizio || null,
                fine: fine || null
            });
        }
    });
    
    return vacanze;
}

/**
 * Inizializza il modal per copiare da anno precedente
 */
function initCopyFromPreviousModal() {
    const modal = document.getElementById('copyFromPreviousModal');
    const cancelButton = document.getElementById('cancelCopyYear');
    const confirmButton = document.getElementById('confirmCopyYear');
    const sourceYearSelect = document.getElementById('sourceYear');
    
    // Carica gli anni accademici nel modal
    fetch('/api/get-anni-accademici')
        .then(response => response.json())
        .then(data => {
            data.sort((a, b) => b - a);
            sourceYearSelect.innerHTML = '<option value="">Seleziona anno accademico</option>';
            
            data.forEach(anno => {
                const option = document.createElement('option');
                option.value = anno;
                option.textContent = `${anno}/${anno+1}`;
                sourceYearSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Errore nel caricamento degli anni accademici:', error);
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
        copyFromPreviousYear();
    });
}

/**
 * Mostra il modal per copiare da anno precedente
 */
function showCopyFromPreviousModal() {
    const modal = document.getElementById('copyFromPreviousModal');
    modal.style.display = 'flex';
}

/**
 * Copia le configurazioni dall'anno selezionato
 */
function copyFromPreviousYear() {
    const sourceYear = document.getElementById('sourceYear').value;
    if (!sourceYear) {
        showMessage('error', 'Seleziona un anno accademico di origine');
        return;
    }
    
    fetch(`/api/oh-issa/get-global-dates?anno=${sourceYear}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showMessage('error', data.error);
                return;
            }
            
            // Popola il target esami di default
            populateField('target_esami_default', data.target_esami_default);
            
            // Popola le vacanze
            if (data.vacanze) {
                loadVacanze(data.vacanze);
            }
            
            // Chiudi il modal e mostra messaggio di successo
            document.getElementById('copyFromPreviousModal').style.display = 'none';
            showMessage('success', `Configurazioni copiate con successo dall'anno ${sourceYear}/${parseInt(sourceYear)+1}`);
        })
        .catch(error => {
            console.error('Errore nel caricamento delle configurazioni:', error);
            showMessage('error', 'Impossibile caricare le configurazioni dell\'anno selezionato');
        });
}

/**
 * Inizializza il modal per confermare il reset
 */
function initResetConfirmModal() {
    const modal = document.getElementById('resetConfirmModal');
    const cancelButton = document.getElementById('cancelReset');
    const confirmButton = document.getElementById('confirmReset');
    
    // Gestione click su Annulla
    cancelButton.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    // Gestione click su Conferma
    confirmButton.addEventListener('click', function() {
        const annoSelect = document.getElementById('selectAnnoAccademico');
        if (annoSelect.value) {
            loadAnnoAccademicoDetails(annoSelect.value);
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