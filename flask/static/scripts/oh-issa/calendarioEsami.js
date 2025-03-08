$(document).ready(function() {
    // Carica i corsi di studio all'avvio della pagina
    caricaCdS();
    
    // Carica gli anni accademici disponibili
    caricaAnniAccademici();
    
    // Gestisce il click sul pulsante "Genera Calendario"
    $('#btnGeneraCalendario').click(function() {
        const cds = $('#cdsSelector').val();
        const annoAccademico = $('#annoAccademicoSelector').val();
        
        if (!cds || !annoAccademico) {
            alert('Seleziona un corso di studi e un anno accademico');
            return;
        }
        
        generaCalendario(cds, annoAccademico);
    });
});

// Funzione per caricare i corsi di studio
function caricaCdS() {
    $.ajax({
        // Utilizziamo l'API distinta per il calendario esami
        url: '/flask/admin/api/getCdSDistinct',
        type: 'GET',
        success: function(data) {
            const selector = $('#cdsSelector');
            selector.empty();
            selector.append('<option value="">Seleziona un CdS</option>');
            
            data.forEach(function(cds) {
                selector.append(`<option value="${cds.codice}">${cds.nome_corso} (${cds.codice})</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Errore nel caricamento dei CdS:', error);
            alert('Errore nel caricamento dei corsi di studio');
        }
    });
}

// Funzione per caricare gli anni accademici
function caricaAnniAccademici() {
    $.ajax({
        url: '/flask/api/getAnniAccademici',
        type: 'GET',
        success: function(data) {
            const selector = $('#annoAccademicoSelector');
            selector.empty();
            selector.append('<option value="">Seleziona un Anno Accademico</option>');
            
            data.forEach(function(anno) {
                selector.append(`<option value="${anno}">${anno}/${anno+1}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Errore nel caricamento degli anni accademici:', error);
            alert('Errore nel caricamento degli anni accademici');
        }
    });
}

// Funzione per generare il calendario
function generaCalendario(cds, annoAccademico) {
    const container = $('#calendarioContainer');
    container.html('<div class="loading"><div class="spinner-border text-primary" role="status"><span class="sr-only">Caricamento...</span></div></div>');
    
    $.ajax({
        url: '/flask/admin/api/getCalendarioEsami',
        type: 'GET',
        data: {
            cds: cds,
            anno: annoAccademico
        },
        success: function(data) {
            // Svuota il container
            container.empty();
            
            if (!data.durata || !data.periodi || !data.insegnamenti) {
                container.html('<p class="text-center">Nessun dato disponibile per questo corso di studi.</p>');
                return;
            }
            
            // Crea una tabella per ogni anno di corso
            for (let anno = 1; anno <= data.durata; anno++) {
                const insegnamentiAnno = data.insegnamenti.filter(i => i.anno_corso === anno);
                
                if (insegnamentiAnno.length === 0) continue;
                
                // Crea la tabella per l'anno corrente
                const tableDiv = $('<div class="table-responsive"></div>');
                const table = $(`<table class="table table-bordered table-sm table-year" id="table-year-${anno}"></table>`);
                const thead = $('<thead></thead>');
                const tbody = $('<tbody></tbody>');
                
                // Aggiungi l'intestazione dell'anno
                const yearRow = $('<tr></tr>');
                yearRow.append(`<th colspan="${data.periodi.length + 1}" class="year-header">Anno ${anno}</th>`);
                thead.append(yearRow);
                
                // Aggiungi la riga con le intestazioni dei mesi
                const headerRow = $('<tr></tr>');
                headerRow.append('<th>Insegnamento</th>');
                
                data.periodi.forEach(periodo => {
                    // La larghezza delle colonne può essere ridotta perché i nomi sono più corti
                    headerRow.append(`<th class="month-header" style="width: 80px;">${periodo.nome}</th>`);
                });
                
                thead.append(headerRow);
                table.append(thead);
                
                // Aggiungi le righe degli insegnamenti
                insegnamentiAnno.forEach(insegnamento => {
                    const row = $('<tr></tr>');
                    row.append(`<td>${insegnamento.titolo}</td>`);
                    
                    data.periodi.forEach(periodo => {
                        const esami = insegnamento.esami.filter(e => {
                            // Recupera il periodo dell'esame dal nome preciso (non dal confronto)
                            return e.periodo === periodo.nome;
                        });
                        
                        if (esami.length > 0) {
                            const giorni = esami.map(e => e.giorno).sort((a, b) => a - b).join(' - ');
                            row.append(`<td class="exam-day">${giorni}</td>`);
                        } else {
                            row.append('<td></td>');
                        }
                    });
                    
                    tbody.append(row);
                });
                
                table.append(tbody);
                tableDiv.append(table);
                container.append(tableDiv);
            }
            
            // Aggiungi le legende per le sessioni e pause didattiche
            aggiungiLegende(container, data.sessioni);
        },
        error: function(xhr, status, error) {
            console.error('Errore nella generazione del calendario:', error);
            container.html('<div class="alert alert-danger">Errore nella generazione del calendario. Riprova più tardi.</div>');
        }
    });
}

// Funzione per aggiungere le legende delle sessioni e pause didattiche
function aggiungiLegende(container, sessioni) {
    if (!sessioni || sessioni.length === 0) return;
    
    const legendDiv = $('<div class="mt-4"></div>');
    legendDiv.append('<h4>Legende</h4>');
    
    const sessioniList = $('<ul class="list-group"></ul>');
    
    sessioni.forEach(sessione => {
        sessioniList.append(`
            <li class="list-group-item">
                <strong>${sessione.nome}:</strong> 
                dal ${formatDate(sessione.inizio)} al ${formatDate(sessione.fine)}
            </li>
        `);
    });
    
    legendDiv.append(sessioniList);
    container.append(legendDiv);
}

// Funzione per formattare le date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}
