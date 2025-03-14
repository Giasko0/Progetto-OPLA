// Script per la gestione della pagina "I miei esami"

// Quando il documento è pronto
document.addEventListener('DOMContentLoaded', function() {
  // Usa getUserData per ottenere le informazioni sull'utente
  getUserData().then(data => {
    if (data && data.authenticated) {
      const userData = data.user_data;
      
      // Aggiorna il titolo della pagina con il nome dell'utente
      const titolo = document.querySelector('.titolo');
      if (titolo && userData) {
        titolo.textContent = `Esami di ${userData.nome || ''} ${userData.cognome || ''}`.trim();
        if (!userData.nome && !userData.cognome) {
          titolo.textContent = `I miei esami`;
        }
      }
      
      // Carica gli esami dell'utente usando l'API
      fetch(`/api/mieiEsami?docente=${encodeURIComponent(userData.username)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Errore nel caricamento degli esami');
          }
          return response.json();
        })
        .then(data => {
          // Visualizza i dati degli esami
          visualizzaEsami(data);
        })
        .catch(error => {
          console.error('Errore:', error);
          // Mostra un messaggio di errore all'utente
          document.getElementById('contenitoreEsami').innerHTML = 
            `<div class="error-message">Si è verificato un errore nel caricamento degli esami: ${error.message}</div>`;
        });
    } else {
      // Reindirizza alla pagina di login se l'utente non è autenticato
      window.location.href = 'login.html';
    }
  }).catch(error => {
    console.error('Errore nell\'autenticazione:', error);
    window.location.href = 'login.html';
  });
});

/**
 * Visualizza gli esami nel contenitore appropriato
 * @param {Array} esami - Array di oggetti esame
 */
function visualizzaEsami(esami) {
  const contenitoreEsami = document.getElementById('contenitoreEsami');
  const tabsHeader = document.getElementById('tabsHeader');
  
  if (!esami || esami.length === 0) {
    contenitoreEsami.innerHTML = '<p>Non hai esami programmati.</p>';
    return;
  }
  
  // Implementazione della visualizzazione esami
  fetchAndDisplayEsami();
  
  // Funzionalità dei tab per periodo
  const allExamsButton = document.getElementById('allExamsButton');
  if (allExamsButton) {
    allExamsButton.addEventListener('click', function() {
      // Mostra tutti gli esami
      showAllExams();
    });
  }
}

function fetchAndDisplayEsami() {
  fetch("/api/mieiEsami")
    .then((response) => response.json())
    .then((data) => {
      const tabsHeader = document.getElementById("tabsHeader");
      const container = document.getElementById("contenitoreEsami");
      // Manteniamo il pulsante "Tutti gli appelli"
      const allExamsButton = document.getElementById("allExamsButton");
      container.innerHTML = "";
      
      // Manteniamo solo il pulsante "Tutti gli appelli"
      tabsHeader.innerHTML = "";
      tabsHeader.appendChild(allExamsButton);
      
      const insegnamenti = Object.keys(data.insegnamenti);
      
      // Salviamo i dati come proprietà globale per usarli nel tab "Tutti gli appelli"
      window.esamiData = data;
      
      // Crea i pulsanti dei tabs
      insegnamenti.forEach((insegnamento, index) => {
        const tabButton = document.createElement("button");
        tabButton.className = "tab-button";
        tabButton.textContent = insegnamento;
        tabButton.onclick = () => switchTab(insegnamento);
        tabsHeader.appendChild(tabButton);
        
        // Crea il contenuto del tab
        const tabContent = document.createElement("div");
        tabContent.className = "tab-content";
        tabContent.style.display = 'none'; // Tutti i tab sono nascosti inizialmente
        tabContent.id = `tab-${insegnamento.replace(/\s+/g, "-")}`;
        
        // Aggiungi contenuto al tab
        displaySessioniEsami(data, insegnamento, tabContent);
        displayTabelleEsami(data, insegnamento, tabContent);
        
        container.appendChild(tabContent);
      });
      
      // Crea il tab per "Tutti gli appelli"
      const allExamsTab = document.createElement("div");
      allExamsTab.className = "tab-content";
      allExamsTab.id = "tab-all-exams";
      // Mostra questo tab per default
      allExamsTab.style.display = 'block';
      displayAllExams(data, allExamsTab);
      container.appendChild(allExamsTab);
      
      // Evidenzia il pulsante "Tutti gli appelli" come selezionato
      allExamsButton.classList.add('active');
    })
    .catch((error) => console.error("Errore:", error));
}

function switchTab(insegnamento) {
  // Modifica per rimuovere la logica delle classi active
  document.querySelectorAll('.tab-content').forEach(content => {
    content.style.display = 'none';
  });
  
  // Rimuovi la classe active da tutti i pulsanti
  document.querySelectorAll('.tab-button, .all-exams-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Mostra solo il tab selezionato senza usare classi active
  const selectedContent = document.querySelector(`#tab-${insegnamento.replace(/\s+/g, "-")}`);
  
  if (selectedContent) {
    selectedContent.style.display = 'block';
  }
  
  // Trova e attiva il pulsante corrispondente
  const buttons = document.querySelectorAll('.tab-button');
  buttons.forEach(button => {
    if (button.textContent === insegnamento) {
      button.classList.add('active');
    }
  });
}

function showAllExams() {
  // Modifica per rimuovere la logica delle classi active
  document.querySelectorAll('.tab-content').forEach(content => {
    content.style.display = 'none';
  });
  
  // Rimuovi la classe active da tutti i pulsanti
  document.querySelectorAll('.tab-button, .all-exams-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Mostra solo il tab "Tutti gli appelli" senza usare classi active
  const allExamsTab = document.getElementById("tab-all-exams");
  if (allExamsTab) {
    allExamsTab.style.display = 'block';
  }
  
  // Aggiungi la classe active al pulsante "Tutti gli appelli"
  document.getElementById('allExamsButton').classList.add('active');
}

function displayTabelleEsami(data, insegnamento, container) {
  const esamiInsegnamento = data.esami.filter(
    (esame) => esame.insegnamento === insegnamento
  );

  if (esamiInsegnamento.length > 0) {
    const section = document.createElement("div");
    section.className = "section";

    const table = document.createElement("table");
    table.id = `tabella-${insegnamento.replace(/\s+/g, "-")}`;

    table.innerHTML = `
      <thead>
          <tr>
              <th onclick="sortTable('${table.id}', 0)">CDS</th>
              <th onclick="sortTable('${table.id}', 1)">Insegnamento</th>
              <th onclick="sortTable('${table.id}', 2, 'date')">Data</th>
              <th onclick="sortTable('${table.id}', 3)">Aula</th>
              <th onclick="sortTable('${table.id}', 4)">Durata (min)</th>
          </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");
    
    esamiInsegnamento.forEach((esame) => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = esame.cds || "N/A";
      row.insertCell(1).textContent = esame.insegnamento;
      
      // Aggiungo il data-datetime come attributo nascosto per l'ordinamento
      const dataCell = row.insertCell(2);
      dataCell.textContent = formatDateTime(esame.dataora);
      dataCell.setAttribute('data-datetime', esame.dataora);
      
      row.insertCell(3).textContent = esame.aula;
      row.insertCell(4).textContent = esame.durata_appello || "120";
    });

    section.appendChild(table);
    container.appendChild(section);
  }
}

function displaySessioniEsami(data, insegnamento, container) {
  const section = document.createElement("div");
  section.className = "exam-section";

  // Aggiungi il titolo
  const title = document.createElement("h2");
  title.textContent = insegnamento;
  section.appendChild(title);
  
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const planningYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
  const nextYear = planningYear + 1;
  
  const sessioni = data.insegnamenti[insegnamento];

  // Crea il contenitore della griglia
  const gridContainer = document.createElement("div");
  gridContainer.className = "sessions-grid";

  // Array delle sessioni da visualizzare
  const sessioniDaVisualizzare = [
    {
      nome: "Sessione Anticipata",
      periodo: `Gen/Feb ${planningYear}`,
      count: sessioni.Anticipata || 0,
      max: 3
    },
    {
      nome: "Pausa Didattica",
      periodo: `Mar/Apr ${planningYear}`,
      count: sessioni["Pausa Didattica"] || 0,
      max: 1
    },
    {
      nome: "Sessione Estiva",
      periodo: `Giu/Lug ${planningYear}`,
      count: sessioni.Estiva || 0,
      max: 3
    },
    {
      nome: "Sessione Autunnale",
      periodo: `Set ${planningYear}`,
      count: sessioni.Autunnale || 0,
      max: 2
    },
    {
      nome: "Pausa Didattica",
      periodo: `Nov ${planningYear}`,
      count: sessioni["Pausa Didattica"] || 0,
      max: 1
    },
    {
      nome: "Sessione Invernale",
      periodo: `Gen/Feb ${nextYear}`,
      count: sessioni.Invernale || 0,
      max: 3
    }
  ];

  // Crea le cards delle sessioni
  sessioniDaVisualizzare.forEach(sessione => {
    const card = document.createElement("div");
    card.className = "session-card";
    
    const heading = document.createElement("h4");
    heading.textContent = `${sessione.nome} (${sessione.periodo})`;
    
    const count = document.createElement("p");
    count.textContent = `${sessione.count}/${sessione.max} esami`;
    
    card.appendChild(heading);
    card.appendChild(count);
    gridContainer.appendChild(card);
  });

  section.appendChild(gridContainer);
  container.appendChild(section);
}

function displayAllExams(data, container) {
  // Aggiungi il riepilogo delle sessioni per tutti gli insegnamenti
  const sessionsSection = document.createElement("div");
  sessionsSection.className = "exam-section";
  
  const sessionsTitle = document.createElement("h2");
  sessionsTitle.textContent = "Riepilogo insegnamenti";
  sessionsSection.appendChild(sessionsTitle);
  
  // Crea una griglia per mostrare tutti gli insegnamenti (stile simile a exam-session)
  const sessionsGrid = document.createElement("div");
  sessionsGrid.className = "sessions-grid";
  
  // Per ogni insegnamento, crea una card simile a quelle usate in displaySessioniEsami
  const insegnamenti = Object.keys(data.insegnamenti);
  insegnamenti.forEach(insegnamento => {
    const sessioni = data.insegnamenti[insegnamento];
    const totaleEsami = Object.values(sessioni).reduce((sum, val) => sum + (val || 0), 0);
    
    const cardElement = document.createElement("div");
    cardElement.className = "session-card";
    
    // Aggiungiamo una classe in base al numero di esami
    if (totaleEsami < 8) {
      cardElement.classList.add("warning-card");
    } else {
      cardElement.classList.add("success-card");
    }
    
    cardElement.innerHTML = `
      <h4>${insegnamento}</h4>
      <p>${totaleEsami} esami inseriti</p>
      <p class="exams-requirement">Min: 8 - Max: 13</p>
    `;
    
    // Aggiungi il click handler
    cardElement.addEventListener('click', () => {
      // Trova e clicca il tab button corrispondente
      const tabButton = Array.from(document.querySelectorAll('.tab-button'))
        .find(button => button.textContent === insegnamento);
      if (tabButton) {
        tabButton.click();
      }
    });
    
    sessionsGrid.appendChild(cardElement);
  });
  
  sessionsSection.appendChild(sessionsGrid);
  container.appendChild(sessionsSection);
  
  // Continua con la tabella dettagliata di tutti gli appelli
  const section = document.createElement("div");
  section.className = "section";

  const tableAllExams = document.createElement("table");
  tableAllExams.id = "tabella-tutti-appelli";

  tableAllExams.innerHTML = `
    <thead>
        <tr>
            <th onclick="sortTable('${tableAllExams.id}', 0)">CDS</th>
            <th onclick="sortTable('${tableAllExams.id}', 1)">Insegnamento</th>
            <th onclick="sortTable('${tableAllExams.id}', 2, 'date')">Data</th>
            <th onclick="sortTable('${tableAllExams.id}', 3)">Aula</th>
            <th onclick="sortTable('${tableAllExams.id}', 4)">Durata (min)</th>
        </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbodyAllExams = tableAllExams.querySelector("tbody");
  // Ordina gli esami per data
  const esamiOrdinati = [...data.esami].sort((a, b) => {
    const dateA = new Date(a.dataora);
    const dateB = new Date(b.dataora);
    return dateA - dateB;
  });
  
  esamiOrdinati.forEach((esame) => {
    const row = tbodyAllExams.insertRow();
    row.insertCell(0).textContent = esame.cds || "N/A";
    row.insertCell(1).textContent = esame.insegnamento;
    
    // Aggiungo il data-datetime come attributo nascosto per l'ordinamento
    const dataCell = row.insertCell(2);
    dataCell.textContent = formatDateTime(esame.dataora);
    dataCell.setAttribute('data-datetime', esame.dataora);
    
    row.insertCell(3).textContent = esame.aula;
    row.insertCell(4).textContent = esame.durata_appello || "120";
  });

  section.appendChild(tableAllExams);
  container.appendChild(section);
}

// Ordinamento tabella migliorato per gestire correttamente le date
function sortTable(tableId, colIndex, type = 'text') {
  const table = document.getElementById(tableId);
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows);
  let direction = "asc";

  // Verifica se stiamo invertendo la direzione dell'ordinamento
  if (
    table.getAttribute("data-sort-col") === colIndex.toString() &&
    table.getAttribute("data-sort-dir") === "asc"
  ) {
    direction = "desc";
  }

  // Memorizza lo stato dell'ordinamento
  table.setAttribute("data-sort-col", colIndex);
  table.setAttribute("data-sort-dir", direction);

  // Esegue l'ordinamento
  rows.sort((a, b) => {
    let aValue, bValue;
    
    if (type === 'date') {
      // Usa il valore dell'attributo data-datetime per le date
      aValue = a.cells[colIndex].getAttribute('data-datetime') || a.cells[colIndex].textContent.trim();
      bValue = b.cells[colIndex].getAttribute('data-datetime') || b.cells[colIndex].textContent.trim();
      
      // Converti in oggetti Date per il confronto
      const dateA = new Date(aValue);
      const dateB = new Date(bValue);
      
      return direction === "asc" 
        ? dateA - dateB 
        : dateB - dateA;
    } else {
      // Per i campi di testo, usa il metodo esistente
      aValue = a.cells[colIndex].textContent.trim().toLowerCase();
      bValue = b.cells[colIndex].textContent.trim().toLowerCase();
      
      return direction === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
  });

  // Ricostruisce la tabella con le righe ordinate
  rows.forEach((row) => tbody.appendChild(row));
}

// Funzione per formattare data e ora
function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return "Data non disponibile";
  
  try {
    const date = new Date(dateTimeStr);
    
    if (isNaN(date.getTime())) {
      // Gestione fallback per formati di data non standard
      return dateTimeStr;
    }
    
    // Formattazione in stile italiano: DD/MM/YYYY, HH:MM
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // +1 perché i mesi sono 0-based
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  } catch (error) {
    console.error("Errore nella formattazione della data:", error);
    return dateTimeStr; // Restituisci la stringa originale in caso di errore
  }
}

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;