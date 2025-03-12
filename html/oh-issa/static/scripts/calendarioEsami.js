/**
 * Script per la gestione del calendario esami
 * Utilizza JavaScript nativo (no jQuery)
 */
document.addEventListener('DOMContentLoaded', function() {
    // Elementi DOM
    const cdsSelector = document.getElementById('cdsSelector');
    const annoAccademicoSelector = document.getElementById('annoAccademicoSelector');
    const btnGeneraCalendario = document.getElementById('btnGeneraCalendario');
    const calendarioContainer = document.getElementById('calendarioContainer');
    
    // Inizializza i selettori
    initSelectors();
    
    // Event listeners
    btnGeneraCalendario.addEventListener('click', generaCalendario);
    cdsSelector.addEventListener('change', aggiornaAnniAccademici);
    
    /**
     * Inizializza i selettori con i dati disponibili
     */
    function initSelectors() {
        // Carica la lista dei corsi di studio
        fetch('/oh-issa/api/getCdS')
            .then(response => response.json())
            .then(data => {
                // Raggruppa i CdS per codice
                const cdsMap = {};
                
                data.forEach(cds => {
                    if (!cdsMap[cds.codice]) {
                        cdsMap[cds.codice] = {
                            codice: cds.codice,
                            nome_corso: cds.nome_corso,
                            anni_accademici: []
                        };
                    }
                    
                    cdsMap[cds.codice].anni_accademici.push({
                        anno: cds.anno_accademico,
                        formattato: `${cds.anno_accademico}/${cds.anno_accademico + 1}`
                    });
                });
                
                // Pulisci il selettore
                cdsSelector.innerHTML = '<option value="">Seleziona un CdS</option>';
                
                // Aggiungi le opzioni al selettore
                Object.values(cdsMap).forEach(cds => {
                    const option = document.createElement('option');
                    option.value = cds.codice;
                    option.textContent = `${cds.codice} - ${cds.nome_corso}`;
                    option.dataset.anniAccademici = JSON.stringify(cds.anni_accademici);
                    cdsSelector.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Errore nel caricamento dei corsi di studio:', error);
                mostraErrore('Impossibile caricare i corsi di studio');
            });
    }
    
    /**
     * Aggiorna il selettore degli anni accademici in base al CdS selezionato
     */
    function aggiornaAnniAccademici() {
        // Pulisci il selettore degli anni accademici
        annoAccademicoSelector.innerHTML = '<option value="">Seleziona un Anno Accademico</option>';
        
        // Se non è selezionato alcun CdS, esci
        if (!cdsSelector.value) {
            return;
        }
        
        // Ottieni l'opzione selezionata
        const selectedOption = cdsSelector.options[cdsSelector.selectedIndex];
        
        // Ottieni gli anni accademici dal data attribute
        const anniAccademici = JSON.parse(selectedOption.dataset.anniAccademici || '[]');
        
        // Ordina gli anni accademici (più recenti prima)
        anniAccademici.sort((a, b) => b.anno - a.anno);
        
        // Aggiungi le opzioni al selettore
        anniAccademici.forEach(anno => {
            const option = document.createElement('option');
            option.value = anno.anno;
            option.textContent = anno.formattato;
            annoAccademicoSelector.appendChild(option);
        });
    }
    
    /**
     * Genera il calendario degli esami
     */
    function generaCalendario() {
        const codiceCds = cdsSelector.value;
        const annoAccademico = annoAccademicoSelector.value;
        
        if (!codiceCds || !annoAccademico) {
            mostraErrore('Seleziona sia il Corso di Studi che l\'Anno Accademico');
            return;
        }
        
        // Mostra messaggio di caricamento
        calendarioContainer.innerHTML = '<div class="loading">Generazione calendario in corso...</div>';
        
        // Richiedi il calendario al server - corretti i nomi dei parametri
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
        
        // Ottieni la durata del corso
        const durata = data.durata || 3;
        
        // Organizziamo gli insegnamenti per anno di corso
        const insegnamentiPerAnno = {};
        for (let i = 1; i <= durata; i++) {
            insegnamentiPerAnno[i] = [];
        }
        
        // Raggruppa gli insegnamenti per anno di corso
        data.insegnamenti.forEach(insegnamento => {
            const anno = insegnamento.anno_corso || 1;
            if (anno <= durata) {
                insegnamentiPerAnno[anno].push(insegnamento);
            }
        });
        
        // Crea una lista ordinata di periodi
        const periodi = data.periodi || [];
        
        // Per ogni anno di corso, crea una tabella separata
        for (let anno = 1; anno <= durata; anno++) {
            // Controlla se ci sono insegnamenti per questo anno
            if (insegnamentiPerAnno[anno].length === 0) {
                continue;
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
                        const giorni = esamiPeriodo.map(esame => esame.giorno).sort((a, b) => a - b);
                        
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
        }
        
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
        calendarioContainer.innerHTML = `
            <div class="alert alert-danger">
                <strong>Errore:</strong> ${message}
            </div>
        `;
    }
});
