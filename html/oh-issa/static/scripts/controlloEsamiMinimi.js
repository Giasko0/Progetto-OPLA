// Script per il controllo degli esami minimi
document.addEventListener('DOMContentLoaded', function() {
    // Elementi DOM
    const btnControllaEsami = document.getElementById('btnControllaEsami');
    const searchInput = document.getElementById('searchInsegnamento');
    const filterRadios = document.querySelectorAll('input[name="filterType"]');
    
    // Variabili per i dati
    let reportData = null;
    let filteredData = null;
    
    // Inizializza la pagina
    loadAnniAccademici();
    
    // Event listeners
    btnControllaEsami.addEventListener('click', controllaEsamiMinimi);
    searchInput.addEventListener('input', applyFilters);
    filterRadios.forEach(radio => radio.addEventListener('change', applyFilters));
});

// Carica gli anni accademici
function loadAnniAccademici() {
    fetch('/api/get-anni-accademici')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('selectAnnoAccademico');
            if (!select) return;
            
            data.sort((a, b) => b - a);
            select.innerHTML = '<option value="">Seleziona anno accademico</option>';
            
            data.forEach(anno => {
                const option = document.createElement('option');
                option.value = anno;
                option.textContent = `${anno}/${anno+1}`;
                select.appendChild(option);
            });
            
            // Event listener per caricare corsi
            select.addEventListener('change', function() {
                if (this.value) {
                    loadCorsiForAnno(this.value);
                } else {
                    resetSelectors();
                }
            });
        })
        .catch(error => {
            console.error('Errore nel caricamento degli anni accademici:', error);
            mostraErrore('Impossibile caricare gli anni accademici');
        });
}

// Carica i corsi per un anno specifico
function loadCorsiForAnno(anno) {
    fetch(`/api/oh-issa/get-cds-by-anno?anno=${anno}`)
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('selectCds');
            select.innerHTML = '<option value="">Tutti i corsi</option>';
            
            if (data.length === 0) {
                const option = document.createElement('option');
                option.disabled = true;
                option.textContent = "Nessun corso disponibile per questo anno";
                select.appendChild(option);
            } else {
                data.forEach(cds => {
                    const option = document.createElement('option');
                    option.value = cds.codice;
                    option.textContent = `${cds.codice} - ${cds.nome_corso}`;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Errore nel caricamento dei corsi:', error);
        });
}

// Reset selettori
function resetSelectors() {
    document.getElementById('selectCds').innerHTML = '<option value="">Tutti i corsi</option>';
}

// Controlla gli esami minimi
function controllaEsamiMinimi() {
    const annoAccademico = document.getElementById('selectAnnoAccademico').value;
    const cds = document.getElementById('selectCds').value;
    const reportContainer = document.getElementById('reportContainer');
    
    if (!annoAccademico) {
        mostraErrore('Seleziona un anno accademico');
        return;
    }
    
    // Mostra loading
    showLoading(true);
    hideAllSections();
    reportContainer.innerHTML = '<div class="loading">Controllo esami minimi in corso...</div>';
    
    // Costruisci URL con parametri
    const params = new URLSearchParams({ anno: annoAccademico });
    if (cds) params.append('cds', cds);
    
    fetch(`/api/oh-issa/controlla-esami-minimi?${params}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                mostraErrore(data.error);
                return;
            }
            
            reportData = data;
            filteredData = data;
            visualizzaReport(data);
            showAllSections();
        })
        .catch(error => {
            console.error('Errore nel controllo esami minimi:', error);
            mostraErrore('Si è verificato un errore nel controllo: ' + error.message);
        })
        .finally(() => {
            showLoading(false);
        });
}

// Visualizza il report
function visualizzaReport(data) {
    const reportContainer = document.getElementById('reportContainer');
    reportContainer.innerHTML = '';
    
    if (!data.insegnamenti || data.insegnamenti.length === 0) {
        reportContainer.innerHTML = '<p class="alert alert-info text-center">Nessun insegnamento trovato per i criteri selezionati</p>';
        return;
    }
    
    // Aggiorna statistiche
    updateStatistiche(data);
    
    // Raggruppa per CdS
    const insegnamentiPerCds = {};
    data.insegnamenti.forEach(ins => {
        const cdsKey = `${ins.cds_codice} - ${ins.cds_nome}`;
        if (!insegnamentiPerCds[cdsKey]) {
            insegnamentiPerCds[cdsKey] = [];
        }
        insegnamentiPerCds[cdsKey].push(ins);
    });
    
    // Crea sezioni per ogni CdS
    Object.keys(insegnamentiPerCds).sort().forEach(cdsKey => {
        const cdsSection = createCdsReportSection(cdsKey, insegnamentiPerCds[cdsKey]);
        reportContainer.appendChild(cdsSection);
    });
}

// Crea sezione report per CdS
function createCdsReportSection(cdsName, insegnamenti) {
    const section = document.createElement('div');
    section.className = 'cds-report-section';
    
    // Ottieni il target dal server
    const targetEsami = reportData.target_esami;
    const conformi = insegnamenti.filter(ins => ins.numero_esami >= targetEsami).length;
    const nonConformi = insegnamenti.length - conformi;
    
    // Crea header delle colonne sessioni
    let sessionHeaders = '';
    if (reportData.sessioni) {
        reportData.sessioni.forEach(sessione => {
            const tipoCapitalized = sessione.tipo.charAt(0).toUpperCase() + sessione.tipo.slice(1);
            sessionHeaders += `<th class="sessione-header">${tipoCapitalized}</th>`;
        });
    }
    
    section.innerHTML = `
        <div class="cds-header">
            <h2>${cdsName}</h2>
            <div class="cds-summary">
                <span class="conformi">✓ ${conformi} conformi</span>
                <span class="non-conformi">⚠ ${nonConformi} non conformi</span>
            </div>
        </div>
        <div class="insegnamenti-table-container">
            <table class="insegnamenti-table">
                <thead>
                    <tr>
                        <th>Insegnamento</th>
                        <th>Docenti</th>
                        <th>Totale Esami</th>
                        ${sessionHeaders}
                        <th>Status</th>
                        <th>Mancanti</th>
                    </tr>
                </thead>
                <tbody id="tbody-${cdsName.replace(/\s+/g, '_')}">
                </tbody>
            </table>
        </div>
    `;
    
    const tbody = section.querySelector('tbody');
    
    // Ordina per numero esami (crescente) e poi per titolo
    insegnamenti.sort((a, b) => {
        if (a.numero_esami !== b.numero_esami) {
            return a.numero_esami - b.numero_esami;
        }
        return a.titolo.localeCompare(b.titolo);
    });
    
    insegnamenti.forEach(ins => {
        const row = createInsegnamentoRow(ins, targetEsami);
        tbody.appendChild(row);
    });
    
    return section;
}

// Crea riga per insegnamento
function createInsegnamentoRow(insegnamento, targetEsami) {
    const row = document.createElement('tr');
    const isConforme = insegnamento.numero_esami >= targetEsami;
    row.className = isConforme ? 'conforme' : 'non-conforme';
    
    const docentiText = insegnamento.docenti.length > 0 
        ? insegnamento.docenti.map(d => `${d.cognome} ${d.nome}`).join(', ')
        : 'Nessun docente assegnato';
    
    const statusText = isConforme ? '✓ Conforme' : '⚠ Non conforme';
    const mancantiText = isConforme ? '-' : (targetEsami - insegnamento.numero_esami).toString();
    
    // Crea celle per le sessioni
    let sessionCells = '';
    if (reportData.sessioni && insegnamento.esami_per_sessione) {
        reportData.sessioni.forEach(sessione => {
            const count = insegnamento.esami_per_sessione[sessione.tipo] || 0;
            sessionCells += `<td class="sessione-count">${count}</td>`;
        });
    }
    
    row.innerHTML = `
        <td>
            <div class="insegnamento-info">
                <span class="titolo">${insegnamento.titolo}</span>
                <span class="codice">${insegnamento.codice}</span>
            </div>
        </td>
        <td class="docenti">${docentiText}</td>
        <td class="numero-esami">${insegnamento.numero_esami}</td>
        ${sessionCells}
        <td class="status ${isConforme ? 'conforme' : 'non-conforme'}">${statusText}</td>
        <td class="mancanti">${mancantiText}</td>
    `;
    
    return row;
}

// Aggiorna statistiche
function updateStatistiche(data) {
    const targetEsami = data.target_esami;
    const conformi = data.insegnamenti.filter(ins => ins.numero_esami >= targetEsami).length;
    const nonConformi = data.insegnamenti.length - conformi;
    
    document.getElementById('totalInsegnamenti').textContent = data.insegnamenti.length;
    document.getElementById('insegnamentiConformi').textContent = conformi;
    document.getElementById('insegnamentiNonConformi').textContent = nonConformi;
    
    // Aggiorna le etichette con il valore del target dinamico
    document.getElementById('targetEsamiLabel').textContent = targetEsami;
    document.getElementById('targetEsamiLabel2').textContent = targetEsami;
}

// Applica filtri
function applyFilters() {
    if (!reportData) return;
    
    const searchQuery = document.getElementById('searchInsegnamento').value.toLowerCase();
    const filterType = document.querySelector('input[name="filterType"]:checked').value;
    const targetEsami = reportData.target_esami;
    
    let filtered = reportData.insegnamenti.filter(ins => {
        // Filtro di ricerca
        const matchesSearch = 
            ins.titolo.toLowerCase().includes(searchQuery) ||
            ins.codice.toLowerCase().includes(searchQuery);
        
        // Filtro tipo
        let matchesType = true;
        if (filterType === 'conformi') {
            matchesType = ins.numero_esami >= targetEsami;
        } else if (filterType === 'non-conformi') {
            matchesType = ins.numero_esami < targetEsami;
        }
        
        return matchesSearch && matchesType;
    });
    
    filteredData = { ...reportData, insegnamenti: filtered };
    visualizzaReport(filteredData);
}

// Utility functions
function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

function showAllSections() {
    document.getElementById('statsSection').style.display = 'block';
    document.getElementById('filtersSection').style.display = 'block';
}

function hideAllSections() {
    document.getElementById('statsSection').style.display = 'none';
    document.getElementById('filtersSection').style.display = 'none';
}

function mostraErrore(message) {
    const reportContainer = document.getElementById('reportContainer');
    reportContainer.innerHTML = `
        <div class="alert alert-danger">
            <strong>Errore:</strong> ${message}
        </div>
    `;
}

function showMessage(type, message) {
    const messageDiv = document.getElementById('responseMessages');
    if (!messageDiv) return;
    
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    
    const alert = document.createElement('div');
    alert.className = `alert ${alertClass}`;
    alert.textContent = message;
    
    messageDiv.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}