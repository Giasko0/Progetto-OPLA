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
    contenitoreEsami.innerHTML = `<div class="error-message">${error.message}</div>`;
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
      
      // Crea chiave unica per insegnamento + CdS
      const insegnamentoKey = `${ins.titolo}_${ins.cds_codice}`;
      insegnamentiCdsInfo.set(insegnamentoKey, cdsInfo);
      
      // Inizializza il conteggio esami per ogni combinazione insegnamento+CdS
      if (!insegnamenti[insegnamentoKey]) {
        insegnamenti[insegnamentoKey] = {
          'Anticipata': { ufficiali: 0, totali: 0 },
          'Estiva': { ufficiali: 0, totali: 0 }, 
          'Autunnale': { ufficiali: 0, totali: 0 },
          'Invernale': { ufficiali: 0, totali: 0 },
          titolo: ins.titolo
        };
      }
    });
  });

  // Processa gli esami per tutti i docenti degli insegnamenti autorizzati
  esamiData.forEach(esame => {
    // Considera tutti gli esami che appartengono agli insegnamenti del docente
    // (sia del docente stesso che di altri docenti)
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
    
    // Crea la chiave combinata per trovare l'insegnamento corretto
    const insegnamentoKey = `${esame.title}_${esame.extendedProps.codice_cds}`;
    
    // Conta gli esami per sessione se appartiene a un insegnamento del docente
    if (sessione && insegnamenti[insegnamentoKey]) {
      // Conta sempre nel totale
      insegnamenti[insegnamentoKey][sessione].totali++;
      
      // Conta negli ufficiali solo se è un esame ufficiale
      if (isUfficiale) {
        insegnamenti[insegnamentoKey][sessione].ufficiali++;
      }
    }
  });

  return { esami: esamiProcessed, insegnamenti, insegnamentiCdsInfo };
}

// Determina la sessione in base alla data dell'esame
function determinaSessioneEsame(dataEsame) {
  const mese = dataEsame.getMonth() + 1;
  const anno = dataEsame.getFullYear();
  const selectedYear = parseInt(window.AnnoAccademicoManager.getSelectedAcademicYear());
  
  // Sessione anticipata: Dic dell'anno accademico a Mag dell'anno successivo
  if ((mese === 12 && anno === selectedYear) || 
      (mese >= 1 && mese <= 5 && anno === selectedYear + 1)) {
    return 'Anticipata';
  }
  // Sessione estiva: Giu-Lug dell'anno successivo all'anno accademico
  else if (mese >= 6 && mese <= 7 && anno === selectedYear + 1) {
    return 'Estiva';
  }
  // Sessione autunnale: Ago-Nov dell'anno successivo all'anno accademico
  else if (mese >= 8 && mese <= 11 && anno === selectedYear + 1) {
    return 'Autunnale';
  }
  // Sessione invernale: Dic di due anni dopo l'anno accademico a Mag di tre anni dopo
  else if ((mese === 12 && anno === selectedYear + 1) || 
           (mese >= 1 && mese <= 5 && anno === selectedYear + 2)) {
    return 'Invernale';
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
  insegnamenti.forEach((insegnamentoKey) => {
    const option = document.createElement("option");
    option.value = insegnamentoKey;
    const cdsInfo = data.insegnamentiCdsInfo.get(insegnamentoKey);
    const insegnamentoData = data.insegnamenti[insegnamentoKey];
    const displayText = cdsInfo ? `${insegnamentoData.titolo} (${cdsInfo.cds_info})` : insegnamentoData.titolo;
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
  insegnamenti.forEach((insegnamentoKey) => {
    const tabContent = document.createElement("div");
    tabContent.className = "tab-content";
    tabContent.style.display = "none";
    tabContent.id = `tab-${insegnamentoKey.replace(/\s+/g, "-")}`;

    displaySessioniEsami(data, insegnamentoKey, tabContent, targetEsami, sessioniInfo);
    displayTabelleEsami(data, insegnamentoKey, tabContent);

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

// Funzione generica per creare e popolare una tabella di esami
function createExamsTable(tableId, exams, noExamsMessage = "Inserisci degli appelli d'esame per visualizzarli qui!") {
  if (exams.length === 0) {
    const noExamsMsg = document.createElement("p");
    noExamsMsg.style.textAlign = "center";
    noExamsMsg.textContent = noExamsMessage;
    return noExamsMsg;
  }

  const section = document.createElement("div");
  section.className = "section";

  // Container scrollabile per la tabella
  const tableContainer = document.createElement("div");
  tableContainer.className = "table-container";

  const table = document.createElement("table");
  table.id = tableId;
  table.className = "esami-table";

  const headers = [
    { text: "Appare in calendario", hideOnMobile: true },
    { text: "Tipo prova", hideOnMobile: true },
    { text: "CdS", hideOnMobile: true },
    { text: "Insegnamento", hideOnMobile: false },
    { text: "Docente", hideOnMobile: true },
    { text: "Data", hideOnMobile: false },
    { text: "Aula", hideOnMobile: false },
    { text: "Azioni", hideOnMobile: false, sortable: false }
  ];

  table.innerHTML = createTableStructure(table.id, headers);
  const tbody = table.querySelector("tbody");

  exams.forEach(esame => {
    const row = document.createElement("tr");
    row.className = "esami-tr";
    
    const cellsData = [
      esame.mostra_nel_calendario ? "Sì" : "No",
      esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale",
      esame.cds,
      esame.insegnamento,
      esame.docenteNome,
      formatDateTime(esame.dataora),
      esame.aula
    ];

    cellsData.forEach((content, index) => {
      const cell = row.insertCell(index);
      const hideClass = (index === 0 || index === 1 || index === 2 || index === 4) ? 'col-responsive-hide' : '';
      cell.className = `esami-td ${hideClass}`;
      cell.textContent = content;
      
      if (index === 5) { // Data column
        cell.setAttribute("data-datetime", esame.dataora);
      }
    });

    // Aggiungi cella con pulsante elimina
    const actionCell = row.insertCell(7);
    actionCell.className = "esami-td";
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Elimina";
    deleteButton.className = "cta-button";
    deleteButton.style.backgroundColor = "var(--color-error)";
    deleteButton.style.margin = "0";
    deleteButton.style.padding = "10px 15px";
    deleteButton.style.fontSize = "0.9em";
    deleteButton.onclick = () => deleteExam(esame.id);
    actionCell.appendChild(deleteButton);

    tbody.appendChild(row);
  });

  tableContainer.appendChild(table);
  section.appendChild(tableContainer);
  return section;
}

// Funzione per visualizzare le tabelle degli esami (ora semplificata)
function displayTabelleEsami(data, insegnamentoKey, container) {
  // Filtra tutti gli esami per questo insegnamento/CdS (di qualunque docente)
  const insegnamentoData = data.insegnamenti[insegnamentoKey];
  const esamiInsegnamento = data.esami.filter(esame => 
    esame.insegnamento === insegnamentoData.titolo && 
    esame.codice_cds === data.insegnamentiCdsInfo.get(insegnamentoKey).cds_codice
  );

  const tableId = `tabella-${insegnamentoKey.replace(/\s+/g, "-")}`;
  const tableElement = createExamsTable(tableId, esamiInsegnamento);
  container.appendChild(tableElement);
}

function displaySessioniEsami(data, insegnamentoKey, container, targetEsami, sessioniInfo) {
  const section = document.createElement("div");
  section.className = "exam-section";

  const title = document.createElement("h2");
  // Aggiungi informazioni CdS al titolo tra parentesi
  const cdsInfo = data.insegnamentiCdsInfo.get(insegnamentoKey);
  const insegnamentoData = data.insegnamenti[insegnamentoKey];
  const titleText = cdsInfo ? `${insegnamentoData.titolo} (${cdsInfo.cds_info})` : insegnamentoData.titolo;
  title.textContent = titleText;
  section.appendChild(title);

  const selectedYear = parseInt(window.AnnoAccademicoManager.getSelectedAcademicYear());
  const sessioni = data.insegnamenti[insegnamentoKey];

  const gridContainer = document.createElement("div");
  gridContainer.className = "sessions-grid";

  const sessioniDaVisualizzare = [
    { nome: "Sessione Anticipata", count: sessioni.Anticipata || { ufficiali: 0, totali: 0 }, max: sessioniInfo.anticipata.max },
    { nome: "Sessione Estiva", count: sessioni.Estiva || { ufficiali: 0, totali: 0 }, max: sessioniInfo.estiva.max },
    { nome: "Sessione Autunnale", count: sessioni.Autunnale || { ufficiali: 0, totali: 0 }, max: sessioniInfo.autunnale.max },
    { nome: "Sessione Invernale", count: sessioni.Invernale || { ufficiali: 0, totali: 0 }, max: sessioniInfo.invernale.max }
  ];

  sessioniDaVisualizzare.forEach((sessione) => {
    const card = document.createElement("div");
    card.className = "session-card clickable";
    card.setAttribute('data-sessione', sessione.nome.replace('Sessione ', ''));
    card.innerHTML = `
      <h4>${sessione.nome}</h4>
      <p>${sessione.count.ufficiali}/${sessione.max} appelli ufficiali</p>
      <p>${sessione.count.totali} appelli totali</p>
    `;
    
    // Aggiungi event listener per il filtro
    card.addEventListener('click', () => {
      const tableId = `tabella-${insegnamentoKey.replace(/\s+/g, "-")}`;
      const sessioneNome = sessione.nome.replace('Sessione ', '');
      
      // Verifica se la card è già attiva (filtro già applicato)
      if (card.classList.contains('active')) {
        // Se già attiva, rimuovi il filtro
        resetTableFilter(tableId);
        gridContainer.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
      } else {
        // Altrimenti applica il filtro
        filterTableBySession(tableId, sessioneNome, data.esami);
        // Aggiorna lo stato visivo delle card
        gridContainer.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      }
    });
    
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

  Object.keys(data.insegnamenti).forEach((insegnamentoKey) => {
    const sessioni = data.insegnamenti[insegnamentoKey];
    const totaleEsamiUfficiali = Object.values(sessioni).reduce((sum, val) => sum + (val.ufficiali || 0), 0);
    const totaleEsamiTotali = Object.values(sessioni).reduce((sum, val) => sum + (val.totali || 0), 0);

    const cardElement = document.createElement("div");
    cardElement.className = `session-card ${totaleEsamiUfficiali < targetEsami ? 'warning-card' : 'success-card'}`;
    
    // Aggiungi informazioni CdS al titolo tra parentesi
    const cdsInfo = data.insegnamentiCdsInfo.get(insegnamentoKey);
    const insegnamentoData = data.insegnamenti[insegnamentoKey];
    const titleText = cdsInfo ? `${insegnamentoData.titolo} (${cdsInfo.cds_codice})` : insegnamentoData.titolo;
    
    cardElement.innerHTML = `
      <h4>${titleText}</h4>
      <p>${totaleEsamiUfficiali}/${targetEsami} appelli ufficiali</p>
      <p>${totaleEsamiTotali} appelli totali</p>
    `;

    cardElement.addEventListener("click", () => {
      window.location.href = `?insegnamento=${encodeURIComponent(insegnamentoKey)}`;
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

  // Tabella di tutti gli esami usando la funzione generica
  const esamiOrdinati = [...data.esami].sort((a, b) => new Date(a.dataora) - new Date(b.dataora));
  const tableElement = createExamsTable("tabella-tutti-appelli", esamiOrdinati, "Inserisci degli appelli d'esame per visualizzarli qui!");
  container.appendChild(tableElement);
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

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;

// Funzione per recuperare il target di esami e informazioni sessioni
async function getTargetEsamiESessioni(docente, anno) {
  const params = new URLSearchParams({ docente, anno });
  const response = await fetch(`/api/get-target-esami-sessioni?${params}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || `Errore nel recupero dei dati: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

// Funzione per filtrare la tabella per sessione
function filterTableBySession(tableId, sessioneNome, tuttiEsami) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const dataCell = row.cells[5]; // Colonna data (indice 5)
    if (!dataCell) return;
    
    const dataEsame = new Date(dataCell.getAttribute('data-datetime'));
    const sessioneEsame = determinaSessioneEsame(dataEsame);
    
    if (sessioneEsame === sessioneNome) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Funzione per resettare il filtro della tabella
function resetTableFilter(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    row.style.display = '';
  });
}

// Funzione per eliminare un esame
async function deleteExam(examId) {
  if (!confirm('Sei sicuro di voler eliminare questo esame? Questa azione non può essere annullata.')) {
    return;
  }

  try {
    const response = await fetch('/api/delete-esame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: examId })
    });

    const result = await response.json();

    if (result.success) {
      // Mostra messaggio di successo nella sidebar
      if (window.showMessage) {
        window.showMessage('Esame eliminato con successo', 'Eliminazione completata', 'success');
      }
      // Ricarica i dati
      fetchAndDisplayEsami();
    } else {
      // Mostra messaggio di errore nella sidebar
      if (window.showMessage) {
        window.showMessage('Errore nell\'eliminazione dell\'esame: ' + result.message, 'Errore eliminazione', 'error');
      } else {
        alert('Errore nell\'eliminazione dell\'esame: ' + result.message);
      }
    }
  } catch (error) {
    console.error('Errore:', error);
    // Mostra messaggio di errore nella sidebar
    if (window.showMessage) {
      window.showMessage('Si è verificato un errore durante l\'eliminazione dell\'esame', 'Errore di connessione', 'error');
    } else {
      alert('Si è verificato un errore durante l\'eliminazione dell\'esame');
    }
  }
}