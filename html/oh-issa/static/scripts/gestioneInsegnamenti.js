/**
 * Script per la gestione degli insegnamenti
 */
let selectedAnno = null;
let insegnamentiData = [];
let filteredData = [];

document.addEventListener('DOMContentLoaded', function() {
    initializeAnnoSelector();
    initFilters();
});

/**
 * Inizializza il selettore dell'anno accademico
 */
function initializeAnnoSelector() {
    fetch('/api/get-anni-accademici')
        .then(response => response.json())
        .then(years => {
            const select = document.getElementById('annoSelect');
            select.innerHTML = '<option value="">Seleziona anno accademico</option>';
            
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = `${year}/${year + 1}`;
                select.appendChild(option);
            });

            // Seleziona l'anno più recente di default
            if (years.length > 0) {
                select.value = years[0];
                selectedAnno = years[0];
                loadInsegnamenti(years[0]);
            }
        })
        .catch(error => {
            showMessage('error', 'Errore nel caricamento degli anni accademici');
            console.error('Error:', error);
        });

    // Event listener per il cambio anno
    document.getElementById('annoSelect').addEventListener('change', function() {
        selectedAnno = this.value ? parseInt(this.value) : null;
        if (selectedAnno) {
            loadInsegnamenti(selectedAnno);
        } else {
            hideAllSections();
            updateStatus('Seleziona un anno accademico per visualizzare gli insegnamenti');
        }
    });
}

/**
 * Inizializza i filtri di ricerca
 */
function initFilters() {
    const searchInput = document.getElementById('searchInsegnamento');
    const showOnlyWithoutDocenti = document.getElementById('showOnlyWithoutDocenti');
    const showOnlyWithDocenti = document.getElementById('showOnlyWithDocenti');

    searchInput.addEventListener('input', applyFilters);
    showOnlyWithoutDocenti.addEventListener('change', applyFilters);
    showOnlyWithDocenti.addEventListener('change', applyFilters);
}

/**
 * Carica gli insegnamenti per l'anno specificato
 */
function loadInsegnamenti(anno) {
    if (!anno) return;
    
    showLoading(true);
    updateStatus('Caricamento insegnamenti in corso...');
    hideAllSections();
    
    fetch(`/api/oh-issa/get-insegnamenti-per-anno?anno=${anno}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            insegnamentiData = data;
            filteredData = data;
            
            if (data.length === 0) {
                showNoResults();
                updateStatus('Nessun insegnamento trovato per questo anno accademico');
            } else {
                displayInsegnamenti(data);
                showAllSections();
                updateStatus(`Trovati ${getTotalInsegnamenti(data)} insegnamenti`);
            }
            
            showLoading(false);
        })
        .catch(error => {
            console.error('Errore nel caricamento degli insegnamenti:', error);
            showMessage('error', 'Si è verificato un errore durante il caricamento degli insegnamenti.');
            showNoResults();
            updateStatus('Errore nel caricamento');
            showLoading(false);
        });
}

/**
 * Visualizza gli insegnamenti raggruppati per CdS
 */
function displayInsegnamenti(data) {
    const container = document.getElementById('cdsContainer');
    container.innerHTML = '';

    // Se non ci sono dati originali, mostra messaggio di nessun risultato
    if (!insegnamentiData || insegnamentiData.length === 0) {
        showNoResults();
        return;
    }

    // Se ci sono dati originali ma i filtri non producono risultati
    if (!data || data.length === 0) {
        showNoResultsFiltered();
        return;
    }

    // Raggruppa per CdS
    data.forEach(cds => {
        const cdsSection = createCdsSection(cds);
        container.appendChild(cdsSection);
    });

    // Mostra tutte le sezioni incluso il contenuto
    showContentSection();
    updateStatistics(data);
}

/**
 * Crea la sezione per un CdS
 */
function createCdsSection(cds) {
    const section = document.createElement('div');
    section.className = 'cds-section';
    section.innerHTML = `
        <div class="cds-header">
            <h2>${cds.nome_corso} (${cds.codice})</h2>
            <div class="cds-stats">
                <span class="stat">${cds.insegnamenti.length} insegnamenti</span>
                <span class="stat">${getInsegnamentiConDocenti(cds.insegnamenti)} con docenti</span>
                <span class="stat">${getInsegnamentiSenzaDocenti(cds.insegnamenti)} senza docenti</span>
            </div>
        </div>
        <div class="insegnamenti-grid" id="grid-${cds.codice}">
        </div>
    `;

    const grid = section.querySelector('.insegnamenti-grid');
    
    // Ordina gli insegnamenti per titolo
    const insegnamentiOrdinati = [...cds.insegnamenti].sort((a, b) => 
        a.titolo.localeCompare(b.titolo)
    );

    insegnamentiOrdinati.forEach(insegnamento => {
        const card = createInsegnamentoCard(insegnamento);
        grid.appendChild(card);
    });

    return section;
}

/**
 * Crea la card per un insegnamento
 */
function createInsegnamentoCard(insegnamento) {
    const card = document.createElement('div');
    card.className = `insegnamento-card ${insegnamento.docenti.length === 0 ? 'no-docenti' : 'with-docenti'}`;
    card.dataset.titolo = insegnamento.titolo.toLowerCase();
    card.dataset.codice = insegnamento.codice.toLowerCase();
    card.dataset.hasDocenti = insegnamento.docenti.length > 0;

    const docentiHtml = insegnamento.docenti.length > 0 
        ? insegnamento.docenti.map(docente => `
            <div class="docente-item">
                <span class="docente-name">${docente.nome || ''} ${docente.cognome || ''}</span>
                <span class="docente-username">(${docente.username})</span>
            </div>
          `).join('')
        : '<div class="no-docenti-text">Nessun docente assegnato</div>';

    card.innerHTML = `
        <div class="insegnamento-header">
            <h4 class="insegnamento-title">${insegnamento.titolo}</h4>
            <span class="insegnamento-code">${insegnamento.codice}</span>
        </div>
        <div class="insegnamento-details">
            <div class="detail-row">
                <span class="detail-label">Anno:</span>
                <span class="detail-value">${insegnamento.anno_corso}°</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Semestre:</span>
                <span class="detail-value">${getSemestreText(insegnamento.semestre)}</span>
            </div>
        </div>
        <div class="docenti-section">
            <h5>Docenti assegnati:</h5>
            <div class="docenti-list">
                ${docentiHtml}
            </div>
        </div>
    `;

    return card;
}

/**
 * Applica i filtri ai dati
 */
function applyFilters() {
    const searchQuery = document.getElementById('searchInsegnamento').value.toLowerCase();
    const showOnlyWithoutDocenti = document.getElementById('showOnlyWithoutDocenti').checked;
    const showOnlyWithDocenti = document.getElementById('showOnlyWithDocenti').checked;

    // Filtra i dati
    filteredData = insegnamentiData.map(cds => {
        const insegnamentiFiltrati = cds.insegnamenti.filter(insegnamento => {
            // Filtro di ricerca
            const matchesSearch = 
                insegnamento.titolo.toLowerCase().includes(searchQuery) ||
                insegnamento.codice.toLowerCase().includes(searchQuery) ||
                insegnamento.docenti.some(docente => 
                    (docente.nome + ' ' + docente.cognome).toLowerCase().includes(searchQuery) ||
                    docente.username.toLowerCase().includes(searchQuery)
                );

            // Filtro docenti
            const hasDocenti = insegnamento.docenti.length > 0;
            const matchesDocenteFilter = 
                (!showOnlyWithoutDocenti && !showOnlyWithDocenti) ||
                (showOnlyWithoutDocenti && !hasDocenti) ||
                (showOnlyWithDocenti && hasDocenti);

            return matchesSearch && matchesDocenteFilter;
        });

        return {
            ...cds,
            insegnamenti: insegnamentiFiltrati
        };
    }).filter(cds => cds.insegnamenti.length > 0);

    displayInsegnamenti(filteredData);
}

/**
 * Aggiorna le statistiche
 */
function updateStatistics(data) {
    const totalInsegnamenti = getTotalInsegnamenti(data);
    const conDocenti = getTotalInsegnamentiConDocenti(data);
    const senzaDocenti = totalInsegnamenti - conDocenti;
    const totalDocenti = getTotalDocenti(data);

    document.getElementById('totalInsegnamenti').textContent = totalInsegnamenti;
    document.getElementById('insegnamentiConDocenti').textContent = conDocenti;
    document.getElementById('insegnamentiSenzaDocenti').textContent = senzaDocenti;
    document.getElementById('totalDocenti').textContent = totalDocenti;
}

/**
 * Funzioni di utilità per le statistiche
 */
function getTotalInsegnamenti(data) {
    return data.reduce((total, cds) => total + cds.insegnamenti.length, 0);
}

function getTotalInsegnamentiConDocenti(data) {
    return data.reduce((total, cds) => 
        total + cds.insegnamenti.filter(ins => ins.docenti.length > 0).length, 0
    );
}

function getInsegnamentiConDocenti(insegnamenti) {
    return insegnamenti.filter(ins => ins.docenti.length > 0).length;
}

function getInsegnamentiSenzaDocenti(insegnamenti) {
    return insegnamenti.filter(ins => ins.docenti.length === 0).length;
}

function getTotalDocenti(data) {
    const docentiSet = new Set();
    data.forEach(cds => {
        cds.insegnamenti.forEach(ins => {
            ins.docenti.forEach(docente => {
                docentiSet.add(docente.username);
            });
        });
    });
    return docentiSet.size;
}

/**
 * Converte il numero del semestre in testo
 */
function getSemestreText(semestre) {
    switch(semestre) {
        case 1: return '1°';
        case 2: return '2°';
        case 3: return 'Annuale';
        default: return 'Non specificato';
    }
}

/**
 * Aggiorna il testo di stato
 */
function updateStatus(text) {
    document.getElementById('statusText').textContent = text;
}

/**
 * Mostra/nasconde l'indicatore di caricamento
 */
function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

/**
 * Mostra tutte le sezioni
 */
function showAllSections() {
    document.getElementById('filtersSection').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';
    document.getElementById('contentSection').style.display = 'block';
    document.getElementById('noResultsMessage').style.display = 'none';
}

/**
 * Mostra solo le sezioni di filtri e statistiche
 */
function showFiltersAndStats() {
    document.getElementById('filtersSection').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';
    document.getElementById('contentSection').style.display = 'none';
    document.getElementById('noResultsMessage').style.display = 'none';
}

/**
 * Mostra la sezione contenuto
 */
function showContentSection() {
    document.getElementById('contentSection').style.display = 'block';
    document.getElementById('noResultsMessage').style.display = 'none';
}

/**
 * Mostra il messaggio di nessun risultato per i filtri
 */
function showNoResultsFiltered() {
    showFiltersAndStats();
    document.getElementById('contentSection').style.display = 'none';
    document.getElementById('noResultsMessage').style.display = 'block';
    document.getElementById('noResultsMessage').textContent = 'Nessun insegnamento corrisponde ai filtri selezionati.';
    
    // Mostra statistiche sui filtri
    updateStatistics(filteredData);
}

/**
 * Mostra il messaggio di nessun risultato
 */
function showNoResults() {
    hideAllSections();
    document.getElementById('noResultsMessage').style.display = 'block';
    document.getElementById('noResultsMessage').textContent = 'Nessun insegnamento trovato per l\'anno accademico selezionato.';
}

/**
 * Nasconde tutte le sezioni
 */
function hideAllSections() {
    document.getElementById('filtersSection').style.display = 'none';
    document.getElementById('statsSection').style.display = 'none';
    document.getElementById('contentSection').style.display = 'none';
    document.getElementById('noResultsMessage').style.display = 'none';
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
    
    messageDiv.appendChild(alert);
    
    // Rimuovi il messaggio dopo 5 secondi
    setTimeout(() => {
        alert.remove();
    }, 5000);
}
