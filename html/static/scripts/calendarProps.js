// Determina il range di date valido in base al periodo dell'anno
export function getValidDateRange() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    const startYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
    const endYear = startYear + 1;

    return {
        start: `${startYear}-01-01`,
        end: `${endYear}-04-30`
    };
}

// Restituisce l'anno accademico per la pianificazione
export function getPlanningYear() {
    const currentDate = new Date();
    return currentDate.getMonth() >= 9 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
}

// Crea un dropdown per sessioni, insegnamenti o cds
export function createDropdown(type, data, calendar) {
    const dropdown = document.createElement('div');
    dropdown.className = 'calendar-dropdown';
    if (type === 'sessioni') dropdown.id = 'sessioniDropdown';
    if (type === 'cds') dropdown.id = 'cdsDropdown';
    document.body.appendChild(dropdown);
    
    if (type === 'sessioni') {
        // Popola il dropdown con le sessioni disponibili
        dropdown.innerHTML = '';
        
        // Aggiungi le voci di menu per ogni tipo di sessione
        for (const [nome, periodo] of Object.entries(data)) {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.dataset.data = periodo.start;
            item.textContent = formatSessionName(nome);
            dropdown.appendChild(item);
        }
    }
    
    return dropdown;
}

// Popola il dropdown degli insegnamenti raggruppandoli per CdS
export function populateInsegnamentiDropdown(dropdownInsegnamenti, docente, planningYear, cdsFiltro = null) {
    // Parametri per la richiesta
    let url = `/api/getInsegnamentiDocente?anno=${planningYear}&docente=${docente}`;
    
    // Aggiungi filtro CdS se presente
    if (cdsFiltro) {
        url += `&cds=${cdsFiltro}`;
    }
    
    // Richiesta API per gli insegnamenti
    fetch(url)
        .then(response => response.json())
        .then(insegnamenti => {
            // Raggruppa gli insegnamenti per CDS
            const insegnamentiPerCds = {};
            
            // Organizza per CdS
            insegnamenti.forEach(ins => {
                if (!insegnamentiPerCds[ins.cds_codice]) {
                    insegnamentiPerCds[ins.cds_codice] = {
                        nome: ins.cds_nome,
                        insegnamenti: []
                    };
                }
                insegnamentiPerCds[ins.cds_codice].insegnamenti.push(ins);
            });
            
            // Costruisci HTML per il dropdown
            let dropdownHTML = '';
            
            // Genera HTML per ogni CdS
            Object.keys(insegnamentiPerCds).forEach(cdsCodice => {
                const cds = insegnamentiPerCds[cdsCodice];
                dropdownHTML += `<div class="dropdown-cds-title">${cds.nome}</div>`;
                
                cds.insegnamenti.forEach(ins => {
                    const isSelected = window.InsegnamentiManager && window.InsegnamentiManager.isSelected(ins.codice);
                    
                    dropdownHTML += `
                        <div class="dropdown-item dropdown-item-indented" data-codice="${ins.codice}" data-semestre="${ins.semestre}" data-anno-corso="${ins.anno_corso || ''}" data-cds="${ins.cds_codice}">
                            <input type="checkbox" id="ins-${ins.codice}" 
                                value="${ins.codice}"
                                ${isSelected ? 'checked' : ''}>
                            <label for="ins-${ins.codice}">${ins.titolo}</label>
                        </div>
                    `;
                });
            });
            
            dropdownInsegnamenti.innerHTML = dropdownHTML;
            
            // Aggiungi stili CSS se necessario
            if (!document.querySelector('.dropdown-style-added')) {
                const style = document.createElement('style');
                style.className = 'dropdown-style-added';
                style.textContent = `
                    .dropdown-cds-title {
                        font-weight: bold;
                        padding: 8px 12px;
                        background-color: #f8f9fa;
                        border-bottom: 1px solid #ddd;
                        margin-top: 5px;
                    }
                    .dropdown-item-indented {
                        margin-left: 15px;
                        border-left: 3px solid #e9ecef;
                    }
                `;
                document.head.appendChild(style);
            }
            
            // Mostra il dropdown
            dropdownInsegnamenti.classList.toggle('show');
        });
}

// Aggiorna gli eventi del calendario con i dati filtrati
export function fetchCalendarEvents(calendar, planningYear, info = null, successCallback = null, cdsFiltro = null) {
    // Ottieni docente dai cookie
    const loggedDocente = document.cookie
        .split('; ')
        .find(row => row.startsWith('username='))
        ?.split('=')[1];
        
    // Parametri base per API
    const params = new URLSearchParams();
    params.append('docente', loggedDocente);
    params.append('anno', planningYear);
    
    // Usa InsegnamentiManager per filtraggi
    if (window.InsegnamentiManager) {
        const selected = window.InsegnamentiManager.getSelected();
        
        if (selected.size === 0) {
            // Solo esami del docente se nessun filtro
            params.append('solo_docente', 'true');
        } else {
            // Filtra per insegnamenti selezionati
            const codici = Array.from(selected.keys());
            params.append('insegnamenti', codici.join(','));
            
            // Raccogli metadati per filtri aggiuntivi
            const metadata = {anniCorso: new Set(), semestri: new Set(), cds: new Set()};
            
            // Estrai metadati
            selected.forEach(ins => {
                if (ins.anno_corso) metadata.anniCorso.add(ins.anno_corso);
                if (ins.semestre) metadata.semestri.add(ins.semestre);
                if (ins.cds) metadata.cds.add(ins.cds);
            });
            
            // Aggiungi parametri di filtro
            for (const [key, set] of Object.entries({
                'anni_corso': metadata.anniCorso,
                'semestri': metadata.semestri,
                'cds': metadata.cds
            })) {
                if (set.size > 0) {
                    params.append(key, Array.from(set).join(','));
                }
            }
        }
    } else {
        // Fallback: solo esami docente
        params.append('solo_docente', 'true');
    }
    
    // Aggiungi filtro per CdS se presente
    if (cdsFiltro) {
        params.append('cds', cdsFiltro);
    }
    
    // Richiesta API
    fetch('/api/getEsami?' + params.toString())
        .then(response => response.json())
        .then(data => {
            if (successCallback) {
                // Callback di FullCalendar
                successCallback(data);
            } else {
                // Aggiornamento manuale
                calendar.getEventSources().forEach(source => source.remove());
                calendar.addEventSource(data);
            }
        })
        .catch(error => {
            console.error('Errore nel caricamento degli esami:', error);
            if (successCallback) {
                successCallback([]);
            }
        });
}

// Crea un tag visuale per un insegnamento selezionato
export function createInsegnamentoTag(codice, titolo, container) {
    // Crea elemento tag
    const tag = document.createElement('div');
    tag.className = 'multi-select-tag';
    tag.dataset.value = codice;
    tag.innerHTML = titolo + '<span class="multi-select-tag-remove">&times;</span>';
    
    // Gestione rimozione
    tag.querySelector('.multi-select-tag-remove').addEventListener('click', function(e) {
        e.stopPropagation();
        tag.remove();
        
        // Mostra placeholder se necessario
        if (container.querySelectorAll('.multi-select-tag').length === 0) {
            const placeholder = document.createElement('span');
            placeholder.className = 'multi-select-placeholder';
            placeholder.textContent = 'Seleziona gli insegnamenti';
            container.appendChild(placeholder);
        }
        
        // Aggiorna InsegnamentiManager
        if (window.InsegnamentiManager) {
            window.InsegnamentiManager.deselectInsegnamento(codice);
        }
        
        // Aggiorna select nascosto
        if (window.updateHiddenSelect) {
            window.updateHiddenSelect();
        }
    });
    
    container.appendChild(tag);
    return tag;
}

// Converti le sessioni in array di date valide per esami
export function getDateValideFromSessioni(sessioni) {
    const dateValide = [];
    
    // Iteriamo su tutti i periodi presenti nella risposta
    for (const [nome, periodo] of Object.entries(sessioni)) {
        // Assicuriamoci che le date siano nel formato corretto
        // La data di inizio a mezzanotte e la data di fine a fine giornata
        const startDate = periodo.start;
        const endDate = periodo.end;
        
        dateValide.push([
            startDate, 
            endDate, 
            formatSessionName(nome)
        ]);
    }
    
    return dateValide;
}

// Formatta il nome della sessione per la visualizzazione
function formatSessionName(nome) {
    // Gestisce la formattazione dei nomi dei periodi
    switch(nome) {
        case 'estiva': 
            return 'Sessione Estiva';
        case 'autunnale': 
            return 'Sessione Autunnale';
        case 'invernale': 
            return 'Sessione Invernale';
        case 'anticipata': 
            return 'Sessione Anticipata';
        case 'pausa_autunnale': 
            return 'Pausa Didattica (1° sem)';
        case 'pausa_primaverile': 
            return 'Pausa Didattica (2° sem)';
        default:
            // Capitalizza il nome se non riconosciuto
            return nome.charAt(0).toUpperCase() + nome.slice(1).replace('_', ' ');
    }
}

// Aggiorna la select nascosta con i valori dei tag
export function updateHiddenSelect(multiSelectBox, hiddenSelectId = 'insegnamento') {
    const hiddenSelect = document.getElementById(hiddenSelectId);
    if (hiddenSelect && multiSelectBox) {
        // Rimuovi opzioni esistenti
        while (hiddenSelect.options.length > 0) {
            hiddenSelect.remove(0);
        }
        
        // Aggiungi opzioni dai tag
        const tags = multiSelectBox.querySelectorAll('.multi-select-tag');
        tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.dataset.value;
            option.textContent = tag.textContent.replace('×', '').trim();
            option.selected = true;
            hiddenSelect.appendChild(option);
        });
    }
}