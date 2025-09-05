// Script per la gestione della pagina "I miei esami"

// Quando il documento è pronto
document.addEventListener("DOMContentLoaded", async function () {
  window.preloadUserData();
  
  // Prima inizializza l'anno accademico
  await window.AnnoAccademicoManager.initSelectedAcademicYear();
  
  // Poi crea il dropdown e configura i callback
  await window.AnnoAccademicoManager.createDropdownHTML('annoAccademicoContainer', 'annoAccademicoSelect');
  
  window.AnnoAccademicoManager.onYearChange(fetchAndDisplayEsami);
  fetchAndDisplayEsami();
  
  window.updatePageTitle();
});

// Carica gli esami dell'utente e li visualizza
async function fetchAndDisplayEsami() {
  const contenitoreEsami = document.getElementById("contenitoreEsami");
  
  try {
    const userData = await window.getUserData();
    const selectedYear = window.AnnoAccademicoManager.getSelectedAcademicYear();
    
    if (!selectedYear) {
      contenitoreEsami.innerHTML = '<div class="error-message">Seleziona un anno accademico per visualizzare gli esami</div>';
      return;
    }

    const params = new URLSearchParams({
      docente: userData.user_data.username,
      anno: selectedYear
    });

    const [insegnamentiResponse, esamiData, targetEsamiData] = await Promise.all([
      fetch(`/api/get-insegnamenti-docente?${params}`).then(r => r.json()),
      fetch(`/api/get-esami?${params}`).then(r => r.json()),
      getTargetEsamiESessioni(userData.user_data.username, selectedYear)
    ]);

    const processedData = processDataForDisplay(insegnamentiResponse.cds, esamiData, userData.user_data.username);
    displayEsamiData(processedData, targetEsamiData.target_esami_default, targetEsamiData.sessioni);
  } catch (error) {
    console.error("Errore:", error);
    contenitoreEsami.innerHTML = `<div class="error-message">Si è verificato un errore nel caricamento degli esami: ${error.message}</div>`;
  }
}

// Processa i dati per mantenerli compatibili con il formato esistente
function processDataForDisplay(cdsData, esamiData, username) {
  const insegnamenti = {};
  const esamiProcessed = [];
  const insegnamentiCdsInfo = new Map();
  
  // Processa i dati CdS per creare le mappe di informazioni
  cdsData.forEach(cds => {
    cds.insegnamenti.forEach(ins => {
      const cdsInfo = {
        cds_codice: ins.cds_codice,
        cds_nome: ins.cds_nome,
        cds_info: `${ins.cds_nome} - ${ins.cds_codice}`
      };
      
      insegnamentiCdsInfo.set(ins.titolo, cdsInfo);
      
      // Inizializza il conteggio esami per ogni insegnamento
      if (!insegnamenti[ins.titolo]) {
        insegnamenti[ins.titolo] = {
          'Anticipata': { ufficiali: 0, totali: 0 },
          'Estiva': { ufficiali: 0, totali: 0 }, 
          'Autunnale': { ufficiali: 0, totali: 0 },
          'Invernale': { ufficiali: 0, totali: 0 }
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
      
      // Determina se l'esame è ufficiale
      const isUfficiale = esame.extendedProps.mostra_nel_calendario === true;
      
      // Formato compatibile con il codice esistente
      const esameFormatted = {
        id: esame.id,
        docente: esame.extendedProps.docente,
        docenteNome: esame.extendedProps.docenteNome,
        insegnamento: esame.title,
        aula: esame.aula || "Non definita",
        dataora: esame.start,
        cds: esame.extendedProps.nome_cds,
        codice_cds: esame.extendedProps.codice_cds,
        durata_appello: esame.extendedProps.durata_appello,
        tipo_appello: esame.extendedProps.tipo_appello,
        mostra_nel_calendario: esame.extendedProps.mostra_nel_calendario
      };
      
      esamiProcessed.push(esameFormatted);
      
      // Conta gli esami per sessione
      if (sessione && insegnamenti[esame.title]) {
        // Conta sempre nel totale
        insegnamenti[esame.title][sessione].totali++;
        
        // Conta negli ufficiali solo se è un esame ufficiale
        if (isUfficiale) {
          insegnamenti[esame.title][sessione].ufficiali++;
        }
      }
    }
  });

  return { esami: esamiProcessed, insegnamenti, insegnamentiCdsInfo };
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
function displayEsamiData(data, targetEsami, sessioniInfo) {
  const container = document.getElementById("contenitoreEsami");
  const insegnamentoSelect = document.getElementById("insegnamentoSelect");
  
  container.innerHTML = "";

  const insegnamenti = Object.keys(data.insegnamenti);

  // Popola il dropdown degli insegnamenti
  insegnamentoSelect.innerHTML = '<option value="">Tutti gli appelli</option>';
  insegnamenti.forEach((insegnamento) => {
    const option = document.createElement("option");
    option.value = insegnamento;
    const cdsInfo = data.insegnamentiCdsInfo.get(insegnamento);
    const displayText = cdsInfo ? `${insegnamento} (${cdsInfo.cds_info})` : insegnamento;
    option.textContent = displayText;
    insegnamentoSelect.appendChild(option);
  });

  // Mostra il dropdown se ci sono insegnamenti
  if (insegnamenti.length > 0) {
    insegnamentoSelect.style.display = "inline-block";
  }

  // Gestione cambio selezione dropdown
  insegnamentoSelect.onchange = (event) => {
    const selectedInsegnamento = event.target.value;
    if (selectedInsegnamento) {
      window.location.href = `?insegnamento=${encodeURIComponent(selectedInsegnamento)}`;
    } else {
      window.location.href = window.location.pathname;
    }
  };

  // Crea i contenuti dei tab per ogni insegnamento
  insegnamenti.forEach((insegnamento) => {
    const tabContent = document.createElement("div");
    tabContent.className = "tab-content";
    tabContent.style.display = "none";
    tabContent.id = `tab-${insegnamento.replace(/\s+/g, "-")}`;

    displaySessioniEsami(data, insegnamento, tabContent, targetEsami, sessioniInfo);
    displayTabelleEsami(data, insegnamento, tabContent);

    container.appendChild(tabContent);
  });

  // Crea il tab per "Tutti gli appelli"
  const allExamsTab = document.createElement("div");
  allExamsTab.className = "tab-content";
  allExamsTab.id = "tab-all-exams";
  allExamsTab.style.display = "none";
  displayAllExams(data, allExamsTab, targetEsami, sessioniInfo);
  container.appendChild(allExamsTab);

  // Gestione parametri URL per mostrare il tab corretto
  const urlParams = new URLSearchParams(window.location.search);
  const insegnamentoParam = urlParams.get("insegnamento");

  if (insegnamentoParam) {
    const tabId = `tab-${insegnamentoParam.replace(/\s+/g, "-")}`;
    const tab = document.getElementById(tabId);

    if (tab) {
      tab.style.display = "block";
      insegnamentoSelect.value = insegnamentoParam;
    } else {
      allExamsTab.style.display = "block";
      insegnamentoSelect.value = "";
    }
  } else {
    allExamsTab.style.display = "block";
    insegnamentoSelect.value = "";
  }
}

// Crea la struttura HTML della tabella
function createTableStructure(tableId, headers) {
  const headerCells = headers.map((header, index) => {
    const sortType = header.text === 'Data' ? 'date' : 'text';
    const onClick = header.sortable !== false ? `onclick="sortTable('${tableId}', ${index}${sortType === 'date' ? ", 'date'" : ''})"` : '';
    const hideClass = header.hideOnMobile ? 'col-responsive-hide' : '';
    return `<th class="esami-th ${hideClass}" ${onClick}>${header.text}</th>`;
  }).join('');

  return `
    <thead class="esami-thead">
      <tr class="esami-tr">${headerCells}</tr>
    </thead>
    <tbody class="esami-tbody"></tbody>
  `;
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

  // Container scrollabile per la tabella
  const tableContainer = document.createElement("div");
  tableContainer.className = "table-container";

  const table = document.createElement("table");
  table.id = `tabella-${insegnamento.replace(/\s+/g, "-")}`;
  table.className = "esami-table";

  const headers = [
    { text: "Appare in calendario", hideOnMobile: true },
    { text: "Tipo prova", hideOnMobile: true },
    { text: "CDS", hideOnMobile: true },
    { text: "Insegnamento", hideOnMobile: false },
    { text: "Docente", hideOnMobile: true },
    { text: "Data", hideOnMobile: false },
    { text: "Aula", hideOnMobile: false },
    { text: "Durata", hideOnMobile: true }
  ];

  table.innerHTML = createTableStructure(table.id, headers);
  const tbody = table.querySelector("tbody");

  esamiInsegnamento.forEach(esame => {
    const row = document.createElement("tr");
    row.className = "esami-tr";
    
    const cellsData = [
      esame.mostra_nel_calendario ? "Sì" : "No",
      esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale",
      esame.cds,
      esame.insegnamento,
      esame.docenteNome,
      formatDateTime(esame.dataora),
      esame.aula,
      formatDurata(esame.durata_appello)
    ];

    cellsData.forEach((content, index) => {
      const cell = row.insertCell(index);
      const hideClass = (index === 0 || index === 1 || index === 2 || index === 4 || index === 7) ? 'col-responsive-hide' : '';
      cell.className = `esami-td ${hideClass}`;
      cell.textContent = content;
      
      if (index === 5) { // Data column (ora è spostata a indice 5)
        cell.setAttribute("data-datetime", esame.dataora);
      }
    });

    tbody.appendChild(row);
  });

  tableContainer.appendChild(table);
  section.appendChild(tableContainer);
  container.appendChild(section);
}

function displaySessioniEsami(data, insegnamento, container, targetEsami, sessioniInfo) {
  const section = document.createElement("div");
  section.className = "exam-section";

  const title = document.createElement("h2");
  // Aggiungi informazioni CdS al titolo tra parentesi
  const cdsInfo = data.insegnamentiCdsInfo.get(insegnamento);
  const titleText = cdsInfo ? `${insegnamento} (${cdsInfo.cds_info})` : insegnamento;
  title.textContent = titleText;
  section.appendChild(title);

  const selectedYear = parseInt(window.AnnoAccademicoManager.getSelectedAcademicYear());
  const sessioni = data.insegnamenti[insegnamento];

  const gridContainer = document.createElement("div");
  gridContainer.className = "sessions-grid";

  const sessioniDaVisualizzare = [
    { nome: "Sessione Anticipata", periodo: `Gen/Feb ${selectedYear}`, count: sessioni.Anticipata || { ufficiali: 0, totali: 0 }, max: sessioniInfo.anticipata.max },
    { nome: "Sessione Estiva", periodo: `Giu/Lug ${selectedYear}`, count: sessioni.Estiva || { ufficiali: 0, totali: 0 }, max: sessioniInfo.estiva.max },
    { nome: "Sessione Autunnale", periodo: `Set ${selectedYear}`, count: sessioni.Autunnale || { ufficiali: 0, totali: 0 }, max: sessioniInfo.autunnale.max },
    { nome: "Sessione Invernale", periodo: `Gen/Feb ${selectedYear + 1}`, count: sessioni.Invernale || { ufficiali: 0, totali: 0 }, max: sessioniInfo.invernale.max }
  ];

  sessioniDaVisualizzare.forEach((sessione) => {
    const card = document.createElement("div");
    card.className = "session-card static";
    card.innerHTML = `
      <h4>${sessione.nome} (${sessione.periodo})</h4>
      <p>${sessione.count.ufficiali}/${sessione.max} appelli ufficiali</p>
      <p>${sessione.count.totali} appelli totali</p>
    `;
    gridContainer.appendChild(card);
  });

  section.appendChild(gridContainer);
  container.appendChild(section);
}

function displayAllExams(data, container, targetEsami, sessioniInfo) {
  // Sezione riepilogo insegnamenti
  const sessionsSection = document.createElement("div");
  sessionsSection.className = "exam-section";

  const sessionsTitle = document.createElement("h2");
  sessionsTitle.textContent = "Riepilogo insegnamenti";
  sessionsSection.appendChild(sessionsTitle);

  const sessionsGrid = document.createElement("div");
  sessionsGrid.className = "teaching-grid";

  Object.keys(data.insegnamenti).forEach((insegnamento) => {
    const sessioni = data.insegnamenti[insegnamento];
    const totaleEsamiUfficiali = Object.values(sessioni).reduce((sum, val) => sum + (val.ufficiali || 0), 0);
    const totaleEsamiTotali = Object.values(sessioni).reduce((sum, val) => sum + (val.totali || 0), 0);

    const cardElement = document.createElement("div");
    cardElement.className = `session-card ${totaleEsamiUfficiali < targetEsami ? 'warning-card' : 'success-card'}`;
    cardElement.innerHTML = `
      <h4>${insegnamento}</h4>
      <p>${totaleEsamiUfficiali}/${targetEsami} appelli ufficiali</p>
      <p>${totaleEsamiTotali} appelli totali</p>
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

  // Container scrollabile per la tabella
  const tableContainer = document.createElement("div");
  tableContainer.className = "table-container";

  const tableAllExams = document.createElement("table");
  tableAllExams.id = "tabella-tutti-appelli";
  tableAllExams.className = "esami-table";

  const headers = [
    { text: "Appare in calendario", hideOnMobile: true },
    { text: "Tipo prova", hideOnMobile: true },
    { text: "CDS", hideOnMobile: true },
    { text: "Insegnamento", hideOnMobile: false },
    { text: "Docente", hideOnMobile: true },
    { text: "Data", hideOnMobile: false },
    { text: "Aula", hideOnMobile: false },
    { text: "Durata", hideOnMobile: true }
  ];

  tableAllExams.innerHTML = createTableStructure(tableAllExams.id, headers);
  const tbody = tableAllExams.querySelector("tbody");

  // Ordina per data e crea le righe
  const esamiOrdinati = [...data.esami].sort((a, b) => new Date(a.dataora) - new Date(b.dataora));
  esamiOrdinati.forEach(esame => {
    const row = document.createElement("tr");
    row.className = "esami-tr";
    
    const cellsData = [
      esame.mostra_nel_calendario ? "Sì" : "No",
      esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale",
      esame.cds,
      esame.insegnamento,
      esame.docenteNome,
      formatDateTime(esame.dataora),
      esame.aula,
      formatDurata(esame.durata_appello)
    ];

    cellsData.forEach((content, index) => {
      const cell = row.insertCell(index);
      const hideClass = (index === 0 || index === 1 || index === 2 || index === 4 || index === 7) ? 'col-responsive-hide' : '';
      cell.className = `esami-td ${hideClass}`;
      cell.textContent = content;
      
      if (index === 5) { // Data column
        cell.setAttribute("data-datetime", esame.dataora);
      }
    });

    tbody.appendChild(row);
  });

  tableContainer.appendChild(tableAllExams);
  section.appendChild(tableContainer);
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
  if (!durataMinuti || durataMinuti === null) {
    return "Non inserita";
  }
  
  const durata = parseInt(durataMinuti, 10);
  if (isNaN(durata) || durata <= 0) {
    return "Non inserita";
  }
  
  const ore = Math.floor(durata / 60);
  const minuti = durata % 60;
  
  if (ore === 0) return `${minuti} min`;
  if (minuti === 0) return `${ore} ${ore === 1 ? 'ora' : 'ore'}`;
  return `${ore} ${ore === 1 ? 'ora' : 'ore'} e ${minuti} min`;
}

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;

// Funzione per recuperare il target di esami e informazioni sessioni
async function getTargetEsamiESessioni(docente, anno) {
  const params = new URLSearchParams({ docente, anno });
  const response = await fetch(`/api/get-target-esami-sessioni?${params}`);
  if (!response.ok) {
    throw new Error(`Errore nel recupero dei dati: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}