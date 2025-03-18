/**
 * Script per la gestione del calendario esami
 * Utilizza JavaScript nativo (no jQuery)
 */
document.addEventListener('DOMContentLoaded', function() {
    // Elementi DOM
    const btnGeneraCalendario = document.getElementById('btnGeneraCalendario');
    const calendarioContainer = document.getElementById('calendarioContainer');
    
    // Inizializza i selettori
    loadAnniAccademici();
    
    // Event listeners
    btnGeneraCalendario.addEventListener('click', generaCalendario);
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
            mostraErrore('Impossibile caricare gli anni accademici');
        });
}

/**
 * Carica i corsi di studio per un anno specifico
 */
function loadCorsiForAnno(anno) {
    if (!anno) {
        document.getElementById('selectCds').innerHTML = '<option value="">Seleziona un corso</option>';
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
            mostraErrore('Impossibile caricare i corsi per l\'anno selezionato');
        });
}

/**
 * Azione quando viene selezionato un CdS
 * In questo caso non facciamo nulla, ma manteniamo la funzione
 * per mantenere lo stesso pattern di gestioneCds.js
 */
function cdsSelected(value) {
    // In questo caso non facciamo nulla di speciale quando viene selezionato il CdS
    // Ma manteniamo la funzione per coerenza con gestioneCds.js
}

/**
 * Genera il calendario degli esami
 */
function generaCalendario() {
    const cdsSelectValue = document.getElementById('selectCds').value;
    
    if (!cdsSelectValue) {
        mostraErrore('Seleziona sia il Corso di Studi che l\'Anno Accademico');
        return;
    }

    // Il valore è in formato "codice_anno"
    const [codiceCds, annoAccademico] = cdsSelectValue.split('_');
    
    // Mostra messaggio di caricamento
    calendarioContainer.innerHTML = '<div class="loading">Generazione calendario in corso...</div>';
    
    // Richiedi il calendario al server
    fetch(`/oh-issa/api/getCalendarioEsami?cds=${codiceCds}&anno=${annoAccademico}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                mostraErrore(data.error);
                return;
            }
            
            // Visualizza il calendario
            visualizzaCalendario(data);
        })
        .catch(error => {
            console.error('Errore nella generazione del calendario:', error);
            mostraErrore('Si è verificato un errore nella generazione del calendario');
        });
}

/**
 * Visualizza il calendario degli esami
 * @param {Object} data - Dati del calendario
 */
function visualizzaCalendario(data) {
    // Pulisci il container
    calendarioContainer.innerHTML = '';
    
    // Se non ci sono dati, mostra un messaggio
    if (!data || !data.insegnamenti || data.insegnamenti.length === 0) {
        calendarioContainer.innerHTML = '<p class="text-center">Nessun dato disponibile per il calendario</p>';
        return;
    }
    
    // Organizziamo gli insegnamenti per anno di corso
    const insegnamentiPerAnno = {};
    
    // Raggruppa gli insegnamenti per anno di corso
    data.insegnamenti.forEach(insegnamento => {
        const anno = insegnamento.anno_corso || 1;
        if (!insegnamentiPerAnno[anno]) {
            insegnamentiPerAnno[anno] = [];
        }
        insegnamentiPerAnno[anno].push(insegnamento);
    });
    
    // Crea una lista ordinata di periodi
    const periodi = data.periodi || [];
    
    // Per ogni anno di corso, crea una tabella separata
    Object.keys(insegnamentiPerAnno).sort().forEach(anno => {
        // Controlla se ci sono insegnamenti per questo anno
        if (insegnamentiPerAnno[anno].length === 0) {
            return;
        }
        
        // Crea un div per l'anno di corso
        const annoDiv = document.createElement('div');
        annoDiv.className = 'anno-corso';
        
        // Aggiungi il titolo dell'anno
        const annoTitle = document.createElement('h3');
        annoTitle.textContent = `${anno}° Anno`;
        annoDiv.appendChild(annoTitle);
        
        // Crea la tabella per questo anno
        const table = document.createElement('table');
        table.className = 'table table-bordered table-calendar';
        
        // Crea l'header della tabella
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Prima cella: Insegnamento
        const thInsegnamento = document.createElement('th');
        thInsegnamento.textContent = 'Insegnamento';
        headerRow.appendChild(thInsegnamento);
        
        // Aggiungi i mesi come header
        periodi.forEach(periodo => {
            const th = document.createElement('th');
            th.textContent = periodo.nome;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Crea il corpo della tabella
        const tbody = document.createElement('tbody');
        
        // Aggiungi gli insegnamenti come righe
        insegnamentiPerAnno[anno].forEach(insegnamento => {
            const row = document.createElement('tr');
            
            // Cella per il nome dell'insegnamento
            const tdNome = document.createElement('td');
            tdNome.textContent = insegnamento.titolo;
            row.appendChild(tdNome);
            
            // Per ogni periodo, verifica se ci sono esami
            periodi.forEach(periodo => {
                const tdEsami = document.createElement('td');
                
                // Filtra gli esami di questo insegnamento per questo periodo
                const esamiPeriodo = (insegnamento.esami || []).filter(esame => {
                    return esame.mese === periodo.mese && esame.anno === periodo.anno;
                });
                
                // Se ci sono esami, mostra i giorni e le durate
                if (esamiPeriodo.length > 0) {
                    // Estrai i giorni e ordinali
                    const giorni = esamiPeriodo.map(esame => {
                        const durata = esame.durata_appello ? ` (${esame.durata_appello} min)` : '';
                        return `${esame.giorno}${durata}`;
                    }).sort((a, b) => parseInt(a) - parseInt(b));
                    
                    // Crea la stringa con i giorni separati da virgola
                    tdEsami.textContent = giorni.join(' - ');
                }
                
                row.appendChild(tdEsami);
            });
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        annoDiv.appendChild(table);
        calendarioContainer.appendChild(annoDiv);
    });
    
    // Aggiungi stili CSS per rendere la tabella più leggibile
    const style = document.createElement('style');
    style.textContent = `
        .table-calendar {
            margin-bottom: 30px;
            border-collapse: collapse;
            width: 100%;
        }
        .table-calendar th, .table-calendar td {
            text-align: center;
            vertical-align: middle;
            border: 1px solid #dee2e6;
            padding: 8px;
        }
        .table-calendar th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        .table-calendar td:first-child {
            text-align: left;
            font-weight: bold;
            background-color: #f8f9fa;
        }
        .anno-corso {
            margin-bottom: 40px;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Mostra un messaggio di errore
 * @param {string} message - Messaggio di errore
 */
function mostraErrore(message) {
    const calendarioContainer = document.getElementById('calendarioContainer');
    calendarioContainer.innerHTML = `
        <div class="alert alert-danger">
            <strong>Errore:</strong> ${message}
        </div>
    `;
}
