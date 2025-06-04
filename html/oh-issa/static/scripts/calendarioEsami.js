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
    
    // Se non ci sono sessioni, mostra un messaggio
    if (!data.sessioni || Object.keys(data.sessioni).length === 0) {
        calendarioContainer.innerHTML = '<p class="alert alert-warning text-center">Nessuna sessione di esame definita per questo corso di studi</p>';
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
        
        // Aggiungi le sessioni come header
        const ordineSessioni = ['anticipata', 'estiva', 'autunnale', 'invernale'];
        ordineSessioni.forEach(tipoSessione => {
            if (data.sessioni[tipoSessione] && data.sessioni[tipoSessione].inizio) {
                const th = document.createElement('th');
                th.textContent = data.sessioni[tipoSessione].nome;
                headerRow.appendChild(th);
            }
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
            
            // Per ogni sessione, verifica se ci sono esami
            ordineSessioni.forEach(tipoSessione => {
                if (data.sessioni[tipoSessione] && data.sessioni[tipoSessione].inizio) {
                    const tdEsami = document.createElement('td');
                    
                    // Filtra gli esami di questo insegnamento per questa sessione
                    const esamiSessione = (insegnamento.esami || []).filter(esame => {
                        const dataEsame = new Date(esame.data_appello);
                        const inizioSessione = new Date(data.sessioni[tipoSessione].inizio);
                        const fineSessione = new Date(data.sessioni[tipoSessione].fine);
                        return dataEsame >= inizioSessione && dataEsame <= fineSessione;
                    });
                    
                    // Se ci sono esami, mostra le date complete
                    if (esamiSessione.length > 0) {
                        const dateEsami = esamiSessione.map(esame => {
                            const data = new Date(esame.data_appello);
                            const giorno = data.getDate().toString().padStart(2, '0');
                            const mese = (data.getMonth() + 1).toString().padStart(2, '0');
                            
                            // Per la sessione invernale, mostra anche l'anno se diverso dall'anno di inizio
                            if (tipoSessione === 'invernale') {
                                const annoEsame = data.getFullYear();
                                const annoInizioSessione = new Date(data.sessioni[tipoSessione].inizio).getFullYear();
                                if (annoEsame !== annoInizioSessione) {
                                    return `${giorno}/${mese}/${annoEsame}`;
                                }
                            }
                            
                            return `${giorno}/${mese}`;
                        }).sort();
                        
                        tdEsami.textContent = dateEsami.join(' - ');
                    }
                    
                    row.appendChild(tdEsami);
                }
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
