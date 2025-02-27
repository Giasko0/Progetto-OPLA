/**
 * Script per la gestione della visualizzazione e filtro esami
 */

// Costanti
const API_ENDPOINT = '/flask/api/filtraEsami';
const DISPLAY_BLOCK = 'block';
const DISPLAY_NONE = 'none';

// Inizializzazione al caricamento del DOM
document.addEventListener("DOMContentLoaded", () => {
    caricaEsamiPersonali();
    caricaTuttiEsami();
    configuraMenuAnnuale();
});

/**
 * Funzioni di utilità
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function gestisciErroreAPI(error) {
    console.error('Errore durante la richiesta API:', error);
    // Si potrebbe aggiungere un messaggio visibile all'utente
}

/**
 * Gestione menu dropdown
 */
function configuraMenuAnnuale() {
    const button = document.getElementById("selezioneAnnoButton");
    const menu = document.getElementById("selezioneAnnoMenu");

    button.addEventListener("click", () => {
        menu.style.display = menu.style.display === DISPLAY_BLOCK ? DISPLAY_NONE : DISPLAY_BLOCK;
    });

    document.addEventListener("click", (e) => {
        if (!button.contains(e.target) && !menu.contains(e.target)) {
            menu.style.display = DISPLAY_NONE;
        }
    });
}

/**
 * Caricamento dati esami
 */
function caricaEsamiPersonali() {
    const username = getCookie('username');
    if (!username) return;

    // Prima ottieni gli insegnamenti del docente
    fetch(`/flask/api/ottieniInsegnamenti?username=${username}`)
        .then(response => response.json())
        .then(insegnamenti => {
            // Poi ottieni gli esami
            fetch(`${API_ENDPOINT}?docente=${username}`)
                .then(response => response.json())
                .then(esami => {
                    creaTabelleSeparate(esami, insegnamenti);
                })
                .catch(gestisciErroreAPI);
        })
        .catch(gestisciErroreAPI);
}

function caricaTuttiEsami() {
    fetch(API_ENDPOINT)
        .then(response => {
            if (!response.ok) throw new Error('Risposta del server non valida');
            return response.json();
        })
        .then(data => {
            popolaTabella(data, "corpoTabellaTutti");
        })
        .catch(gestisciErroreAPI);
}

function aggiornaEsami() {
    const formData = new FormData(document.getElementById("filterForm"));
    const params = new URLSearchParams();
    
    for (let [key, value] of formData.entries()) {
        params.append(key, value);
    }

    fetch(`${API_ENDPOINT}?${params.toString()}`)
        .then(response => {
            if (!response.ok) throw new Error('Risposta del server non valida');
            return response.json();
        })
        .then(data => {
            popolaTabella(data, "corpoTabellaTutti");
        })
        .catch(gestisciErroreAPI);
}

/**
 * Funzioni di popolazione tabella
 */
function formatDateForDisplay(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString('it-IT');
}

function popolaTabella(esami, idTabella) {
    const tabella = document.getElementById(idTabella);
    tabella.innerHTML = '';
    
    esami.forEach(esame => {
        const riga = tabella.insertRow(-1);
        const celle = [
            riga.insertCell(0),
            riga.insertCell(1),
            riga.insertCell(2),
            riga.insertCell(3)
        ];
        
        celle[0].innerHTML = esame.docente;
        celle[1].innerHTML = esame.title;
        celle[2].innerHTML = esame.aula;
        celle[3].innerHTML = formatDateForDisplay(esame.start);
    });
}

function creaTabelleSeparate(esami, insegnamenti) {
    const container = document.getElementById('tabelleInsegnamenti');
    container.innerHTML = ''; // Pulisci il contenitore

    insegnamenti.forEach(insegnamento => {
        const esamiInsegnamento = esami.filter(esame => esame.title === insegnamento);
        
        if (esamiInsegnamento.length > 0) {
            // Crea sezione per l'insegnamento
            const section = document.createElement('div');
            section.className = 'section';
            
            // Aggiungi titolo insegnamento
            const title = document.createElement('h3');
            title.textContent = insegnamento;
            section.appendChild(title);
            
            // Crea tabella
            const table = document.createElement('table');
            table.id = `tabella-${insegnamento.replace(/\s+/g, '-')}`;
            
            // Aggiungi intestazione
            table.innerHTML = `
                <thead>
                    <tr>
                        <th onclick="sortTable('${table.id}', 0)">Docente</th>
                        <th onclick="sortTable('${table.id}', 1)">Insegnamento</th>
                        <th onclick="sortTable('${table.id}', 2)">Aula</th>
                        <th onclick="sortTable('${table.id}', 3)">Data</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            
            // Popola tabella
            const tbody = table.querySelector('tbody');
            esamiInsegnamento.forEach(esame => {
                const row = tbody.insertRow();
                row.insertCell(0).textContent = esame.docente;
                row.insertCell(1).textContent = esame.title;
                row.insertCell(2).textContent = esame.aula;
                row.insertCell(3).textContent = formatDateForDisplay(esame.start);
            });
            
            section.appendChild(table);
            container.appendChild(section);
        }
    });
}

/**
 * Funzione di ordinamento tabella
 */
function sortTable(tableId, colIndex) {
    const table = document.getElementById(tableId);
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    let direction = "asc";
    
    // Verifica se stiamo invertendo la direzione dell'ordinamento
    if (table.getAttribute("data-sort-col") === colIndex.toString() && 
        table.getAttribute("data-sort-dir") === "asc") {
        direction = "desc";
    }
    
    // Memorizza lo stato dell'ordinamento
    table.setAttribute("data-sort-col", colIndex);
    table.setAttribute("data-sort-dir", direction);
    
    // Esegue l'ordinamento
    rows.sort((a, b) => {
        const aValue = a.cells[colIndex].textContent.trim().toLowerCase();
        const bValue = b.cells[colIndex].textContent.trim().toLowerCase();
        
        return direction === "asc" 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
    });
    
    // Ricostruisce la tabella con le righe ordinate
    rows.forEach(row => tbody.appendChild(row));
}

/**
 * Funzioni esposte globalmente
 */
window.toggleCheckbox = function(id) {
    const checkbox = document.getElementById(id);
    checkbox.checked = !checkbox.checked;
    aggiornaEsami();
};

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;