document.addEventListener("DOMContentLoaded", () => {
  fetchAndDisplayEsami();
});

function fetchAndDisplayEsami() {
  fetch("/flask/api/mieiEsami")
    .then((response) => response.json())
    .then((data) => {
      const tabsHeader = document.getElementById("tabsHeader");
      const container = document.getElementById("contenitoreEsami");
      container.innerHTML = "";
      tabsHeader.innerHTML = "";
      
      const insegnamenti = Object.keys(data.insegnamenti);
      
      // Crea i pulsanti dei tabs
      insegnamenti.forEach((insegnamento, index) => {
        const tabButton = document.createElement("button");
        tabButton.className = `tab-button ${index === 0 ? 'active' : ''}`;
        tabButton.textContent = insegnamento;
        tabButton.onclick = () => switchTab(insegnamento);
        tabsHeader.appendChild(tabButton);
        
        // Crea il contenuto del tab
        const tabContent = document.createElement("div");
        tabContent.className = `tab-content ${index === 0 ? 'active' : ''}`;
        tabContent.id = `tab-${insegnamento.replace(/\s+/g, "-")}`;
        
        // Aggiungi contenuto al tab
        displayTabelleEsami(data, insegnamento, tabContent);
        displaySessioniEsami(data, insegnamento, tabContent);
        
        container.appendChild(tabContent);
      });
    })
    .catch((error) => console.error("Errore:", error));
}

function switchTab(insegnamento) {
  // Rimuovi active da tutti i tabs
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Attiva il tab selezionato
  const selectedButton = Array.from(document.querySelectorAll('.tab-button')).find(
    button => button.textContent === insegnamento
  );
  const selectedContent = document.querySelector(`#tab-${insegnamento.replace(/\s+/g, "-")}`);
  
  if (selectedButton && selectedContent) {
    selectedButton.classList.add('active');
    selectedContent.classList.add('active');
  }
}

function displayTabelleEsami(data, insegnamento, container) {
  const esamiInsegnamento = data.esami.filter(
    (esame) => esame.insegnamento === insegnamento
  );

  if (esamiInsegnamento.length > 0) {
    const section = document.createElement("div");
    section.className = "section";

    const title = document.createElement("h2");
    title.textContent = insegnamento;
    section.appendChild(title);

    const table = document.createElement("table");
    table.id = `tabella-${insegnamento.replace(/\s+/g, "-")}`;

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

    const tbody = table.querySelector("tbody");
    esamiInsegnamento.forEach((esame) => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = esame.docente;
      row.insertCell(1).textContent = esame.insegnamento;
      row.insertCell(2).textContent = esame.aula;
      row.insertCell(3).textContent = formatDateTime(esame.dataora);
    });

    section.appendChild(table);
    container.appendChild(section);
  }
}

function displaySessioniEsami(data, insegnamento, container) {
  const section = document.createElement("div");
  section.className = "exam-section";
  
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const planningYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
  const nextYear = planningYear + 1;
  
  const sessioni = data.insegnamenti[insegnamento];

  section.innerHTML = `
    <div class="sessions-grid">
        <div class="session-card">
            <h4>Sessione Anticipata (Gen/Feb ${planningYear})</h4>
            <p>${sessioni.Anticipata || 0}/3 esami</p>
        </div>
        <div class="session-card">
            <h4>Pausa Didattica (Mar/Apr ${planningYear})</h4>
            <p>${sessioni["Pausa Didattica Primavera"] || 0}/1 esami</p>
        </div>
        <div class="session-card">
            <h4>Sessione Estiva (Giu/Lug ${planningYear})</h4>
            <p>${sessioni.Estiva || 0}/3 esami</p>
        </div>
        <div class="session-card">
            <h4>Sessione Autunnale (Set ${planningYear})</h4>
            <p>${sessioni.Autunnale || 0}/2 esami</p>
        </div>
        <div class="session-card">
            <h4>Pausa Didattica (Nov ${planningYear})</h4>
            <p>${sessioni["Pausa Didattica Autunno"] || 0}/1 esami</p>
        </div>
        <div class="session-card">
            <h4>Sessione Invernale (Gen/Feb ${nextYear})</h4>
            <p>${sessioni.Invernale || 0}/3 esami</p>
        </div>
    </div>
  `;
  
  container.appendChild(section);
}

// Ordinamento tabella
function sortTable(tableId, colIndex) {
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
    const aValue = a.cells[colIndex].textContent.trim().toLowerCase();
    const bValue = b.cells[colIndex].textContent.trim().toLowerCase();

    return direction === "asc"
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
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