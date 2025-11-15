// Script per la gestione del calendario esami
document.addEventListener('DOMContentLoaded', async function() {
    // Elementi DOM
    const btnGeneraCalendario = document.getElementById('btnGeneraCalendario');
    const btnEsportaXLSX = document.getElementById('btnEsportaXLSX');
    
    // Prima inizializza l'anno accademico
    await window.AnnoAccademicoManager.initSelectedAcademicYear();
    
    // Poi carica gli anni accademici
    loadAnniAccademici();
    
    // Event listeners
    btnGeneraCalendario.addEventListener('click', generaCalendario);
    btnEsportaXLSX.addEventListener('click', esportaXLSX);
});

// Carica gli anni accademici per il selettore
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
        document.getElementById('selectCurriculum').innerHTML = '<option value="">Seleziona un curriculum</option>';
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
                data.forEach(cds => {
                    const option = document.createElement('option');
                    option.value = cds.codice;
                    option.textContent = `${cds.codice} - ${cds.nome_corso}`;
                    select.appendChild(option);
                });
            }
            
            // Aggiungi event listener per caricare i curriculum quando cambia il corso
            select.addEventListener('change', function() {
                loadCurriculumForCds(this.value, anno);
            });
            
            // Reset curriculum selector
            document.getElementById('selectCurriculum').innerHTML = '<option value="">Seleziona un curriculum</option>';
        })
        .catch(error => {
            console.error('Errore nel caricamento dei corsi:', error);
            mostraErrore('Impossibile caricare i corsi per l\'anno selezionato');
        });
}

// Carica i curriculum per un corso di studi specifico
function loadCurriculumForCds(cdsCode, anno) {
    if (!cdsCode || !anno) {
        document.getElementById('selectCurriculum').innerHTML = '<option value="">Seleziona un curriculum</option>';
        return;
    }
    
    fetch(`/api/oh-issa/get-curriculum-by-cds?cds=${cdsCode}&anno=${anno}`)
        .then(response => response.json())
        .then(data => { // data è un array di oggetti curriculum, es: [{"codice": "GEN", "nome": "CORSO GENERICO"}, {"codice": "E01", "nome": "CYBERSECURITY"}]
            const select = document.getElementById('selectCurriculum');
            select.innerHTML = '<option value="">Seleziona un curriculum</option>';
            
            if (!data || data.length === 0) { // Nessun curriculum per questo CdS/Anno
                const option = document.createElement('option');
                option.disabled = true;
                option.textContent = "Nessun curriculum disponibile";
                select.appendChild(option);
                return;
            }

            // Popola il selettore con tutti i curriculum, ordinati per nome
            data.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(curriculum => {
                const option = document.createElement('option');
                option.value = curriculum.codice; // Usa il codice come valore
                option.textContent = curriculum.nome; // Mostra il nome all'utente
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Errore nel caricamento dei curriculum:', error);
            mostraErrore('Impossibile caricare i curriculum per il corso selezionato');
        });
}

// Genera il calendario degli esami
function generaCalendario() {
    const cdsValue = document.getElementById('selectCds').value;
    const annoAccademicoValue = document.getElementById('selectAnnoAccademico').value;
    const curriculumValue = document.getElementById('selectCurriculum').value;
    const calendarioContainer = document.getElementById('calendarioContainer');
    
    // Verifica tutti i valori
    if (!cdsValue || !annoAccademicoValue || !curriculumValue) {
        mostraErrore('Seleziona Anno Accademico, Corso di Studi e Curriculum');
        return;
    }
    
    // Mostra messaggio di caricamento
    calendarioContainer.innerHTML = '<div class="loading">Generazione calendario in corso...</div>';
        
    // Richiedi il calendario al server
    fetch(`/api/oh-issa/get-calendario-esami?cds=${cdsValue}&anno=${annoAccademicoValue}&curriculum=${encodeURIComponent(curriculumValue)}`)
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
            
            // Mostra il pulsante di esportazione
            document.getElementById('btnEsportaXLSX').style.display = 'inline-block';
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
    
    // Ordina insegnamenti per semestre (3, 1, 2) e poi alfabeticamente
    const semestre_order = {3: 0, 1: 1, 2: 2};
    Object.keys(insegnamentiPerAnno).forEach(anno => {
        insegnamentiPerAnno[anno].sort((a, b) => {
            const semestreA = semestre_order[a.semestre] !== undefined ? semestre_order[a.semestre] : 999;
            const semestreB = semestre_order[b.semestre] !== undefined ? semestre_order[b.semestre] : 999;
            if (semestreA !== semestreB) {
                return semestreA - semestreB;
            }
            return a.titolo.localeCompare(b.titolo);
        });
    });
    
    // Se non ci sono sessioni, mostra un messaggio
    if (!data.sessioni || Object.keys(data.sessioni).length === 0) {
        calendarioContainer.innerHTML = '<p class="alert alert-warning text-center">Nessuna sessione di esame definita per questo corso di studi</p>';
        return;
    }
    
    // Aggiungi la descrizione del corso con curriculum
    if (data.nome_corso) {
        const corsoInfo = document.createElement('div');
        corsoInfo.className = 'corso-info';
        const titoloCurriculum = data.curriculum ? ` - ${data.curriculum}` : '';
        corsoInfo.innerHTML = `<h2>Calendario esami: ${data.nome_corso}${titoloCurriculum}</h2>`;
        calendarioContainer.appendChild(corsoInfo);
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
            
            // Cella per il nome dell'insegnamento con semestre
            const tdNome = document.createElement('td');
            const nomeSpan = document.createElement('span');
            nomeSpan.textContent = insegnamento.titolo;
            tdNome.appendChild(nomeSpan);
            
            // Aggiungi il semestre su nuova riga se presente
            const semestre = insegnamento.semestre;
            if (semestre) {
                let semestreStr = '';
                if (semestre === 1) semestreStr = 'Primo semestre';
                else if (semestre === 2) semestreStr = 'Secondo semestre';
                else if (semestre === 3) semestreStr = 'Annuale';
                
                if (semestreStr) {
                    const br = document.createElement('br');
                    tdNome.appendChild(br);
                    const semestreSpan = document.createElement('span');
                    semestreSpan.textContent = semestreStr;
                    semestreSpan.style.fontSize = '0.9em';
                    semestreSpan.style.color = '#808080';
                    semestreSpan.style.fontWeight = 'normal';
                    tdNome.appendChild(semestreSpan);
                }
            }
            
            row.appendChild(tdNome);
            
            // Per ogni sessione, verifica se ci sono esami
            ordineSessioni.forEach(tipoSessione => {
                if (data.sessioni[tipoSessione] && data.sessioni[tipoSessione].inizio) {
                    const tdEsami = document.createElement('td');
                    tdEsami.style.textAlign = 'center';
                    
                    // Filtra gli esami di questo insegnamento per questa sessione
                    const esamiSessione = (insegnamento.esami || []).filter(esame => {
                        const dataEsame = new Date(esame.data_appello);
                        const inizioSessione = new Date(data.sessioni[tipoSessione].inizio);
                        const fineSessione = new Date(data.sessioni[tipoSessione].fine);
                        return dataEsame >= inizioSessione && dataEsame <= fineSessione;
                    });
                    
                    // Se ci sono esami, mostra le date
                    if (esamiSessione.length > 0) {
                        // Ordina cronologicamente
                        esamiSessione.sort((a, b) => new Date(a.data_appello) - new Date(b.data_appello));
                        
                        // Per anticipata annuali: data blu, altrimenti nero
                        const isAnnualeAnticipata = semestre === 3 && tipoSessione === 'anticipata';
                        
                        const dateEsami = esamiSessione.map(esame => {
                            const data = new Date(esame.data_appello);
                            const giorno = data.getDate().toString().padStart(2, '0');
                            const mese = (data.getMonth() + 1).toString().padStart(2, '0');
                            const anno = data.getFullYear();
                            const dateStr = `${giorno}/${mese}/${anno}`;
                            
                            if (isAnnualeAnticipata) {
                                const span = document.createElement('span');
                                span.textContent = dateStr;
                                span.style.color = '#0000FF';
                                return span;
                            }
                            return dateStr;
                        });
                        
                        dateEsami.forEach((elem, idx) => {
                            if (idx > 0) {
                                tdEsami.appendChild(document.createElement('br'));
                            }
                            if (typeof elem === 'string') {
                                tdEsami.appendChild(document.createTextNode(elem));
                            } else {
                                tdEsami.appendChild(elem);
                            }
                        });
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
}

// Esporta il calendario in formato XLSX
function esportaXLSX() {
    const cdsValue = document.getElementById('selectCds').value;
    const annoAccademicoValue = document.getElementById('selectAnnoAccademico').value;
    const curriculumValue = document.getElementById('selectCurriculum').value;
    
    if (!cdsValue || !annoAccademicoValue || !curriculumValue) {
        mostraErrore('Seleziona Anno Accademico, Corso di Studi e Curriculum prima di esportare');
        return;
    }
    
    // Mostra messaggio di caricamento
    const calendarioContainer = document.getElementById('calendarioContainer');
    const originalContent = calendarioContainer.innerHTML;
    calendarioContainer.innerHTML = '<div class="loading">Generazione file Excel in corso...</div>';
    
    // Crea l'URL per il download
    const url = `/api/oh-issa/esporta-calendario-esami?cds=${cdsValue}&anno=${annoAccademicoValue}&curriculum=${encodeURIComponent(curriculumValue)}`;
    
    // Usa fetch per controllare la risposta prima del download
    fetch(url)
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.error || `Errore HTTP: ${response.status}`);
                });
            }
            
            // Se la risposta è OK, scarica il file
            return response.blob();
        })
        .then(blob => {
            // Crea un URL per il blob e scarica il file
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `calendario_esami_${cdsValue}_${annoAccademicoValue}_${curriculumValue.replace(/\s+/g, '_')}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Pulisci l'URL del blob
            window.URL.revokeObjectURL(downloadUrl);
            
            // Ripristina il contenuto originale
            calendarioContainer.innerHTML = originalContent;
            
            // Mostra messaggio di successo
            const successMsg = document.createElement('div');
            successMsg.className = 'alert alert-success';
            successMsg.innerHTML = '<strong>Successo:</strong> File Excel scaricato correttamente!';
            calendarioContainer.insertBefore(successMsg, calendarioContainer.firstChild);
            
            // Rimuovi il messaggio dopo 3 secondi
            setTimeout(() => {
                if (successMsg.parentNode) {
                    successMsg.parentNode.removeChild(successMsg);
                }
            }, 3000);
        })
        .catch(error => {
            console.error('Errore nel download del file:', error);
            calendarioContainer.innerHTML = originalContent;
            mostraErrore('Errore nel download del file: ' + error.message);
        });
}

// Mostra un messaggio di errore
function mostraErrore(message) {
    const calendarioContainer = document.getElementById('calendarioContainer');
    calendarioContainer.innerHTML = `
        <div class="alert alert-danger">
            <strong>Errore:</strong> ${message}
        </div>
    `;
    
    // Nascondi il pulsante di esportazione in caso di errore
    document.getElementById('btnEsportaXLSX').style.display = 'none';
}
