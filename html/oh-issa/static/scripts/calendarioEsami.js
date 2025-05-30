// Script per la gestione del calendario esami
document.addEventListener('DOMContentLoaded', function() {
    // Elementi DOM
    const btnGeneraCalendario = document.getElementById('btnGeneraCalendario');
    
    // Inizializza i selettori
    loadAnniAccademici();
    
    // Event listeners
    btnGeneraCalendario.addEventListener('click', generaCalendario);
});

// Carica gli anni accademici per il selettore
function loadAnniAccademici() {
    fetch('/api/oh-issa/get-anni-accademici')
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
            
            // Aggiungi event listener per caricare i corsi quando cambia l'anno
            select.addEventListener('change', function() {
                loadCorsiForAnno(this.value);
            });
        })
        .catch(error => {
            console.error('Errore nel caricamento degli anni accademici:', error);
            mostraErrore('Impossibile caricare gli anni accademici');
        });
}

// Carica i corsi di studio per un anno specifico
function loadCorsiForAnno(anno) {
    if (!anno) {
        document.getElementById('selectCds').innerHTML = '<option value="">Seleziona un corso</option>';
        return;
    }
    
    fetch(`/api/oh-issa/getCdSByAnno?anno=${anno}`)
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

// Genera il calendario degli esami
function generaCalendario() {
    const cdsSelectValue = document.getElementById('selectCds').value;
    const annoAccademicoValue = document.getElementById('selectAnnoAccademico').value;
    const calendarioContainer = document.getElementById('calendarioContainer');
    
    // Verifica entrambi i valori
    if (!cdsSelectValue || !annoAccademicoValue) {
        mostraErrore('Seleziona sia il Corso di Studi che l\'Anno Accademico');
        return;
    }

    // Il valore è in formato "codice_anno"
    const [codiceCds, annoAccademico] = cdsSelectValue.split('_');
    
    // Mostra messaggio di caricamento
    calendarioContainer.innerHTML = '<div class="loading">Generazione calendario in corso...</div>';
        
    // Richiedi il calendario al server
    fetch(`/api/oh-issa/getCalendarioEsami?cds=${codiceCds}&anno=${annoAccademico}`)
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
            
            if (!data || !data.insegnamenti || data.insegnamenti.length === 0) {
                mostraErrore('Nessun dato disponibile per il calendario con i parametri specificati');
                return;
            }
            
            // Visualizza il calendario
            visualizzaCalendario(data);
        })
        .catch(error => {
            console.error('Errore nella generazione del calendario:', error);
            mostraErrore('Si è verificato un errore nella generazione del calendario: ' + error.message);
        });
}

// Visualizza il calendario degli esami
function visualizzaCalendario(data) {
    const calendarioContainer = document.getElementById('calendarioContainer');
    
    // Pulisci il container
    calendarioContainer.innerHTML = '';
    
    // Se non ci sono dati o non ci sono insegnamenti, mostra un messaggio
    if (!data || !data.insegnamenti || data.insegnamenti.length === 0) {
        calendarioContainer.innerHTML = '<p class="alert alert-warning text-center">Nessun dato disponibile per il calendario</p>';
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
    
    // Se non ci sono periodi, mostra un messaggio
    if (periodi.length === 0) {
        calendarioContainer.innerHTML = '<p class="alert alert-warning text-center">Nessun periodo di esame definito per questo corso di studi</p>';
        return;
    }
    
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
                
                // Se ci sono esami, mostra i giorni
                if (esamiPeriodo.length > 0) {
                    // Estrai i giorni e ordinali
                    const giorni = esamiPeriodo.map(esame => {
                        return `${esame.giorno}`;
                    }).sort((a, b) => parseInt(a) - parseInt(b));
                    
                    // Crea la stringa con i giorni separati da trattino
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
    
    // Aggiungi la descrizione del corso
    if (data.nome_corso) {
        const corsoInfo = document.createElement('div');
        corsoInfo.className = 'corso-info';
        corsoInfo.innerHTML = `<h2>Calendario esami: ${data.nome_corso}</h2>`;
        calendarioContainer.prepend(corsoInfo);
    }
}

// Mostra un messaggio di errore
function mostraErrore(message) {
    const calendarioContainer = document.getElementById('calendarioContainer');
    calendarioContainer.innerHTML = `
        <div class="alert alert-danger">
            <strong>Errore:</strong> ${message}
        </div>
    `;
}
