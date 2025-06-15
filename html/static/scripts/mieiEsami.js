// Script per la gestione della pagina "I miei esami"

// Quando il documento è pronto
document.addEventListener("DOMContentLoaded", function () {
  window.preloadUserData();
  
  // Inizializza il dropdown dell'anno accademico
  window.AnnoAccademicoManager.initSelectedAcademicYear();
  
  window.AnnoAccademicoManager.createDropdownHTML('annoAccademicoContainer', 'annoAccademicoSelect')
    .then(() => {
      window.AnnoAccademicoManager.onYearChange(fetchAndDisplayEsami);
      fetchAndDisplayEsami();
    })
    .catch(error => {
      console.error('Errore nella creazione del dropdown anno:', error);
      fetchAndDisplayEsami();
    });
  
  window.updatePageTitle();
  
  // Configura il pulsante "Tutti gli appelli"
  const allExamsButton = document.getElementById("allExamsButton");
  if (allExamsButton) {
    allExamsButton.onclick = () => window.location.href = window.location.pathname;
  }
});

// Carica gli esami dell'utente e li visualizza
function fetchAndDisplayEsami() {
  const contenitoreEsami = document.getElementById("contenitoreEsami");
  
  getUserData()
    .then((data) => {
      const selectedYear = window.AnnoAccademicoManager.getSelectedAcademicYear();
      
      if (!selectedYear) {
        contenitoreEsami.innerHTML = '<div class="error-message">Seleziona un anno accademico per visualizzare gli esami</div>';
        return;
      }

      const params = new URLSearchParams({
        docente: data.user_data.username,
        anno: selectedYear
      });

      Promise.all([
        fetch(`/api/get-insegnamenti-docente?${params}`).then(r => r.json()),
        fetch(`/api/get-esami?${params}`).then(r => r.json())
      ])
      .then(([insegnamentiResponse, esamiData]) => {
        const processedData = processDataForDisplay(insegnamentiResponse.cds, esamiData, data.user_data.username);
        displayEsamiData(processedData);
      })
      .catch((error) => {
        console.error("Errore:", error);
        contenitoreEsami.innerHTML = `<div class="error-message">Si è verificato un errore nel caricamento degli esami: ${error.message}</div>`;
      });
    })
    .catch((error) => {
      console.error("Errore nell'ottenimento dati utente:", error);
      contenitoreEsami.innerHTML = `<div class="error-message">Si è verificato un errore nell'ottenimento dei dati: ${error.message}</div>`;
    });
}

// Processa i dati per mantenerli compatibili con il formato esistente
function processDataForDisplay(cdsData, esamiData, username) {
  const insegnamenti = {};
  const esamiProcessed = [];
  
  // Estrai tutti gli insegnamenti del docente con informazioni CdS
  const insegnamentiDocente = new Map();
  cdsData.forEach(cds => {
    cds.insegnamenti.forEach(ins => {
      insegnamentiDocente.set(ins.titolo, {
        codice: ins.codice,
        cds_codice: ins.cds_codice || cds.codice,
        cds_nome: ins.cds_nome || cds.nome
      });
      
      // Inizializza il conteggio esami per ogni insegnamento
      if (!insegnamenti[ins.titolo]) {
        insegnamenti[ins.titolo] = {
          'Anticipata': 0,
          'Estiva': 0, 
          'Autunnale': 0,
          'Invernale': 0
        };
      }
    });
  });

  // Processa gli esami del docente
  esamiData.forEach(esame => {
    // Considera solo gli esami del docente corrente che sono suoi insegnamenti
    if (esame.extendedProps.insegnamentoDocente && esame.extendedProps.docente === username) {
      const dataEsame = new Date(esame.start);
      const sessione = determinaSessioneEsame(dataEsame);
      const insegnamentoInfo = insegnamentiDocente.get(esame.title) || {};
      
      // Formato compatibile con il codice esistente
      const esameFormatted = {
        id: esame.id,
        docente: esame.extendedProps.docente,
        docenteNome: esame.extendedProps.docenteNome,
        insegnamento: esame.title,
        aula: esame.aula || 'N/A',
        dataora: esame.start,
        cds: esame.extendedProps.nome_cds || insegnamentoInfo.cds_nome || 'N/A',
        codice_cds: esame.extendedProps.codice_cds || insegnamentoInfo.cds_codice || 'N/A',
        durata_appello: esame.extendedProps.durata_appello || 120,
        tipo_appello: esame.extendedProps.tipo_appello || 'F'
      };
      
      esamiProcessed.push(esameFormatted);
      
      // Conta gli esami per sessione (escludi prove parziali)
      if (esame.extendedProps.tipo_appello !== 'PP' && sessione && insegnamenti[esame.title]) {
        insegnamenti[esame.title][sessione]++;
      }
    }
  });

  return { esami: esamiProcessed, insegnamenti };
}

// Determina la sessione in base alla data dell'esame
function determinaSessioneEsame(dataEsame) {
  const mese = dataEsame.getMonth() + 1;
  const anno = dataEsame.getFullYear();
  
  if (mese >= 1 && mese <= 2) {
    const selectedYear = parseInt(window.AnnoAccademicoManager.getSelectedAcademicYear());
    return anno === selectedYear + 1 ? 'Invernale' : 'Anticipata';
  } else if (mese >= 6 && mese <= 7) {
    return 'Estiva';
  } else if (mese === 9) {
    return 'Autunnale';
  }
  
  return null;
}

// Visualizza i dati usando la logica esistente
function displayEsamiData(data) {
  const tabsHeader = document.getElementById("tabsHeader");
  const container = document.getElementById("contenitoreEsami");
  const allExamsButton = document.getElementById("allExamsButton");
  
  container.innerHTML = "";
  tabsHeader.innerHTML = "";
  tabsHeader.appendChild(allExamsButton);

  const insegnamenti = Object.keys(data.insegnamenti);

  // Crea i pulsanti dei tabs e il contenuto
  insegnamenti.forEach((insegnamento) => {
    const tabButton = document.createElement("button");
    tabButton.className = "tab-button";
    tabButton.textContent = insegnamento;
    tabButton.onclick = () => window.location.href = `?insegnamento=${encodeURIComponent(insegnamento)}`;
    tabsHeader.appendChild(tabButton);

    const tabContent = document.createElement("div");
    tabContent.className = "tab-content";
    tabContent.style.display = "none";
    tabContent.id = `tab-${insegnamento.replace(/\s+/g, "-")}`;

    displaySessioniEsami(data, insegnamento, tabContent);
    displayTabelleEsami(data, insegnamento, tabContent);

    container.appendChild(tabContent);
  });

  // Crea il tab per "Tutti gli appelli"
  const allExamsTab = document.createElement("div");
  allExamsTab.className = "tab-content";
  allExamsTab.id = "tab-all-exams";
  allExamsTab.style.display = "none";
  displayAllExams(data, allExamsTab);
  container.appendChild(allExamsTab);

  // Gestione parametri URL per mostrare il tab corretto
  const urlParams = new URLSearchParams(window.location.search);
  const insegnamentoParam = urlParams.get("insegnamento");

  if (insegnamentoParam) {
    const tabId = `tab-${insegnamentoParam.replace(/\s+/g, "-")}`;
    const tab = document.getElementById(tabId);

    if (tab) {
      tab.style.display = "block";
      document.querySelectorAll(".tab-button").forEach((button) => {
        if (button.textContent === insegnamentoParam) {
          button.classList.add("active");
        }
      });
    } else {
      allExamsTab.style.display = "block";
      allExamsButton.classList.add("active");
    }
  } else {
    allExamsTab.style.display = "block";
    allExamsButton.classList.add("active");
  }
}

// Crea la struttura HTML della tabella
function createTableStructure(tableId, headers) {
  const headerCells = headers.map((header, index) => {
    const sortType = header.text === 'Data' ? 'date' : 'text';
    const onClick = header.sortable !== false ? `onclick="sortTable('${tableId}', ${index}${sortType === 'date' ? ", 'date'" : ''})"` : '';
    return `<th class="esami-th" ${onClick}>${header.text}</th>`;
  }).join('');

  return `
    <thead class="esami-thead">
      <tr class="esami-tr">${headerCells}</tr>
    </thead>
    <tbody class="esami-tbody"></tbody>
  `;
}

// Crea una riga della tabella
function createTableRow(esame) {
  const row = document.createElement("tr");
  row.className = "esami-tr";
  
  const cellsData = [
    esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale",
    esame.cds,
    esame.insegnamento,
    esame.docenteNome,
    { content: formatDateTime(esame.dataora), datetime: esame.dataora },
    esame.aula,
    formatDurata(esame.durata_appello)
  ];

  cellsData.forEach((cellData, index) => {
    const cell = row.insertCell(index);
    cell.className = "esami-td";
    
    if (typeof cellData === 'object' && cellData.datetime) {
      cell.textContent = cellData.content;
      cell.setAttribute("data-datetime", cellData.datetime);
    } else {
      cell.textContent = cellData;
    }
  });

  return row;
}

// Funzione per visualizzare le tabelle degli esami
function displayTabelleEsami(data, insegnamento, container) {
  const esamiInsegnamento = data.esami.filter(esame => esame.insegnamento === insegnamento);

  if (esamiInsegnamento.length === 0) {
    const noExamsMsg = document.createElement("p");
    noExamsMsg.style.textAlign = "center";
    noExamsMsg.textContent = "Inserisci degli appelli d'esame per visualizzarli qui!";
    container.appendChild(noExamsMsg);
    return;
  }

  const section = document.createElement("div");
  section.className = "section";

  const table = document.createElement("table");
  table.id = `tabella-${insegnamento.replace(/\s+/g, "-")}`;
  table.className = "esami-table";

  const headers = [
    { text: "Tipo prova" },
    { text: "CDS" },
    { text: "Insegnamento" },
    { text: "Docente" },
    { text: "Data" },
    { text: "Aula" },
    { text: "Durata (min)" }
  ];

  table.innerHTML = createTableStructure(table.id, headers);
  const tbody = table.querySelector("tbody");

  esamiInsegnamento.forEach(esame => {
    tbody.appendChild(createTableRow(esame));
  });

  section.appendChild(table);
  container.appendChild(section);
}

function displaySessioniEsami(data, insegnamento, container) {
  const section = document.createElement("div");
  section.className = "exam-section";

  const title = document.createElement("h2");
  title.textContent = insegnamento;
  section.appendChild(title);

  const selectedYear = parseInt(window.AnnoAccademicoManager.getSelectedAcademicYear());
  const sessioni = data.insegnamenti[insegnamento];

  const gridContainer = document.createElement("div");
  gridContainer.className = "sessions-grid";

  const sessioniDaVisualizzare = [
    { nome: "Sessione Anticipata", periodo: `Gen/Feb ${selectedYear}`, count: sessioni.Anticipata || 0, max: 3 },
    { nome: "Sessione Estiva", periodo: `Giu/Lug ${selectedYear}`, count: sessioni.Estiva || 0, max: 3 },
    { nome: "Sessione Autunnale", periodo: `Set ${selectedYear}`, count: sessioni.Autunnale || 0, max: 2 },
    { nome: "Sessione Invernale", periodo: `Gen/Feb ${selectedYear + 1}`, count: sessioni.Invernale || 0, max: 3 }
  ];

  sessioniDaVisualizzare.forEach((sessione) => {
    const card = document.createElement("div");
    card.className = "session-card static";
    card.innerHTML = `
      <h4>${sessione.nome} (${sessione.periodo})</h4>
      <p>${sessione.count}/${sessione.max} esami</p>
    `;
    gridContainer.appendChild(card);
  });

  section.appendChild(gridContainer);
  container.appendChild(section);
}

function displayAllExams(data, container) {
  // Sezione riepilogo insegnamenti
  const sessionsSection = document.createElement("div");
  sessionsSection.className = "exam-section";

  const sessionsTitle = document.createElement("h2");
  sessionsTitle.textContent = "Riepilogo insegnamenti";
  sessionsSection.appendChild(sessionsTitle);

  const sessionsGrid = document.createElement("div");
  sessionsGrid.className = "sessions-grid";

  Object.keys(data.insegnamenti).forEach((insegnamento) => {
    const sessioni = data.insegnamenti[insegnamento];
    const totaleEsami = Object.values(sessioni).reduce((sum, val) => sum + (val || 0), 0);

    const cardElement = document.createElement("div");
    cardElement.className = `session-card ${totaleEsami < 8 ? 'warning-card' : 'success-card'}`;
    cardElement.innerHTML = `
      <h4>${insegnamento}</h4>
      <p>${totaleEsami} esami inseriti</p>
      <p class="exams-requirement">Min: 8 - Max: 13</p>
    `;

    cardElement.addEventListener("click", () => {
      window.location.href = `?insegnamento=${encodeURIComponent(insegnamento)}`;
    });

    sessionsGrid.appendChild(cardElement);
  });

  sessionsSection.appendChild(sessionsGrid);
  container.appendChild(sessionsSection);

  if (data.esami.length === 0) {
    const noExamsMsg = document.createElement("p");
    noExamsMsg.style.textAlign = "center";
    noExamsMsg.textContent = "Inserisci degli appelli d'esame per visualizzarli qui!";
    container.appendChild(noExamsMsg);
    return;
  }

  // Tabella di tutti gli esami
  const section = document.createElement("div");
  section.className = "section";

  const tableAllExams = document.createElement("table");
  tableAllExams.id = "tabella-tutti-appelli";
  tableAllExams.className = "esami-table";

  const headers = [
    { text: "Tipo prova" },
    { text: "CDS" },
    { text: "Insegnamento" },
    { text: "Docente" },
    { text: "Data" },
    { text: "Aula" },
    { text: "Durata" }
  ];

  tableAllExams.innerHTML = createTableStructure(tableAllExams.id, headers);
  const tbody = tableAllExams.querySelector("tbody");

  // Ordina per data e crea le righe
  const esamiOrdinati = [...data.esami].sort((a, b) => new Date(a.dataora) - new Date(b.dataora));
  esamiOrdinati.forEach(esame => {
    tbody.appendChild(createTableRow(esame));
  });

  section.appendChild(tableAllExams);
  container.appendChild(section);
}

// Ordinamento tabella
function sortTable(tableId, colIndex, type = "text") {
  const table = document.getElementById(tableId);
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows);
  
  // Determina direzione ordinamento
  const currentDir = table.getAttribute("data-sort-dir");
  const direction = (table.getAttribute("data-sort-col") === colIndex.toString() && currentDir === "asc") ? "desc" : "asc";
  
  table.setAttribute("data-sort-col", colIndex);
  table.setAttribute("data-sort-dir", direction);

  // Funzione di confronto
  const compare = (a, b) => {
    let aValue, bValue;

    if (type === "date") {
      aValue = a.cells[colIndex].getAttribute("data-datetime") || a.cells[colIndex].textContent.trim();
      bValue = b.cells[colIndex].getAttribute("data-datetime") || b.cells[colIndex].textContent.trim();
      const comparison = new Date(aValue) - new Date(bValue);
      return direction === "asc" ? comparison : -comparison;
    } else {
      aValue = a.cells[colIndex].textContent.trim().toLowerCase();
      bValue = b.cells[colIndex].textContent.trim().toLowerCase();
      const comparison = aValue.localeCompare(bValue);
      return direction === "asc" ? comparison : -comparison;
    }
  };

  // Ordina e ricostruisci
  rows.sort(compare).forEach(row => tbody.appendChild(row));
}

// Funzione per formattare data e ora
function formatDateTime(dateTimeStr) {
  const date = new Date(dateTimeStr);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

// Funzione per formattare la durata in ore e minuti
function formatDurata(durataMinuti) {
  const durata = parseInt(durataMinuti, 10);
  const ore = Math.floor(durata / 60);
  const minuti = durata % 60;
  
  if (ore === 0) return `${minuti} min`;
  if (minuti === 0) return `${ore} ${ore === 1 ? 'ora' : 'ore'}`;
  return `${ore} ${ore === 1 ? 'ora' : 'ore'} e ${minuti} min`;
}

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;