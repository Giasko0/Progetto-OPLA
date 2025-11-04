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

// Variabile globale per memorizzare le date valide
let globalDateValideData = null;

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

    const [insegnamentiResponse, esamiData, targetEsamiData, dateValideData] = await Promise.all([
      fetch(`/api/get-insegnamenti-docente?${params}`).then(r => r.json()),
      fetch(`/api/get-esami?${params}`).then(r => r.json()),
      getTargetEsamiESessioni(userData.user_data.username, selectedYear),
      fetch(`/api/get-date-valide?${params}`).then(r => r.json())
    ]);

    // Memorizza le date valide globalmente
    globalDateValideData = dateValideData;

    const processedData = processDataForDisplay(insegnamentiResponse.cds, esamiData, userData.user_data.username, dateValideData);
    displayEsamiData(processedData, targetEsamiData.target_esami_default, targetEsamiData);
  } catch (error) {
    contenitoreEsami.innerHTML = `<div class="error-message">${error.message}</div>`;
  }
}

// Processa i dati per mantenerli compatibili con il formato esistente
function processDataForDisplay(cdsData, esamiData, username, dateValideData) {
  const insegnamenti = {};
  const esamiProcessed = [];
  const insegnamentiCdsInfo = new Map();
  
  // Verifica che cdsData sia un array
  if (!Array.isArray(cdsData)) {
    return { esami: [], insegnamenti: {}, insegnamentiCdsInfo: new Map() };
  }
  
  // Processa i dati CdS per creare le mappe di informazioni
  cdsData.forEach((cds) => {
    if (!cds.insegnamenti || !Array.isArray(cds.insegnamenti)) {
      return;
    }
    cds.insegnamenti.forEach((ins) => {
      const cdsInfo = {
        cds_codice: ins.cds_codice,
        cds_nome: ins.cds_nome,
        cds_info: `${ins.cds_nome} - ${ins.cds_codice}`
      };
      const insegnamentoKey = `${ins.id}`;
      insegnamentiCdsInfo.set(insegnamentoKey, cdsInfo);
      if (!insegnamenti[insegnamentoKey]) {
        insegnamenti[insegnamentoKey] = {
          id: ins.id,
          'Anticipata': { ufficiali: 0, totali: 0 },
          'Estiva': { ufficiali: 0, totali: 0 }, 
          'Autunnale': { ufficiali: 0, totali: 0 },
          'Invernale': { ufficiali: 0, totali: 0 },
          titolo: ins.titolo
        };
      }
    });
  });

  // Verifica che esamiData sia un array
  if (!Array.isArray(esamiData)) {
    return { esami: [], insegnamenti, insegnamentiCdsInfo };
  }

  // Processa gli esami per tutti i docenti degli insegnamenti autorizzati
  esamiData.forEach((esame) => {
    try {
      const dataEsame = new Date(esame.start);
      const sessione = determinaSessioneEsame(dataEsame, dateValideData);
      const isUfficiale = esame.extendedProps && esame.extendedProps.mostra_nel_calendario === true;
      // Formato compatibile con il codice esistente
      const esameFormatted = {
        id: esame.id,
        docente: esame.extendedProps?.docente,
        docenteNome: esame.extendedProps?.docenteNome,
        insegnamento: esame.extendedProps?.insegnamento, // id
        insegnamentoTitolo: esame.title,
        aula: esame.aula || "Non definita",
        dataora: esame.start,
        cds: esame.extendedProps?.nome_cds,
        codice_cds: esame.extendedProps?.codice_cds,
        durata_appello: esame.extendedProps?.durata_appello,
        tipo_appello: esame.extendedProps?.tipo_appello,
        mostra_nel_calendario: esame.extendedProps?.mostra_nel_calendario
      };
      esamiProcessed.push(esameFormatted);
      // Chiave solo id
      const insegnamentoKey = `${esame.extendedProps?.insegnamento}`;
      if (sessione && insegnamenti[insegnamentoKey]) {
        if (!insegnamenti[insegnamentoKey][sessione]) {
          insegnamenti[insegnamentoKey][sessione] = { ufficiali: 0, totali: 0 };
        }
        insegnamenti[insegnamentoKey][sessione].totali++;
        if (isUfficiale) {
          insegnamenti[insegnamentoKey][sessione].ufficiali++;
        }
      }
    } catch (error) {
      // Ignora gli esami che non possono essere processati
    }
  });

  return { esami: esamiProcessed, insegnamenti, insegnamentiCdsInfo, originalCdsData: cdsData };
}

// Determina la sessione in base alla data dell'esame e alle date valide dal database
function determinaSessioneEsame(dataEsame, dateValideData) {
  // Converte la data in stringa ISO per il confronto
  const dataEsameISO = dataEsame.toISOString().split('T')[0];
  
  // Cerca in quale sessione cade la data dell'esame
  for (const sessione of dateValideData) {
    // Struttura dell'array delle sessioni:
    // [0] inizioISO, [1] fineISO, [2] nomeSessioneConParte, [3] sessioneId, 
    // [4] nomeSessioneBase, [5] parteNumero, [6] totaleParts
    const [inizioISO, fineISO, nomeSessioneConParte, sessioneId, nomeSessioneBase, parteNumero, totaleParts] = sessione;
    
    if (dataEsameISO >= inizioISO && dataEsameISO <= fineISO) {
      // Usa il nome base della sessione (quinto elemento) per mappare correttamente
      const nomeSessioneDaUsare = nomeSessioneBase || nomeSessioneConParte;
      
      // Mappa i nomi delle sessioni dal database ai nomi usati nell'interfaccia
      const sessionMapping = {
        'Sessione Anticipata': 'Anticipata',
        'Sessione Estiva': 'Estiva',
        'Sessione Autunnale': 'Autunnale',
        'Sessione Invernale': 'Invernale'
      };
      
      return sessionMapping[nomeSessioneDaUsare] || nomeSessioneDaUsare;
    }
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
    const isSortable = header.sortable !== false;
    const onClick = isSortable ? `onclick="sortTable('${tableId}', ${index}${sortType === 'date' ? ", 'date'" : ''})"` : '';
    const hideClass = header.hideOnMobile ? 'col-responsive-hide' : '';
    const sortableClass = isSortable ? 'sortable' : 'non-sortable';
    return `<th class="esami-th ${hideClass} ${sortableClass}" ${onClick}>${header.text}</th>`;
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
    // Aggiungi attributi data per il filtro
    row.setAttribute("data-insegnamento-id", esame.insegnamento);
    row.setAttribute("data-datetime", esame.dataora);
    
    const cellsData = [
      esame.mostra_nel_calendario ? "Sì" : "No",
      esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale",
      esame.cds,
      esame.insegnamentoTitolo,
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
  // Filtra tutti gli esami per questo insegnamento (di qualunque docente)
  const insegnamentoData = data.insegnamenti[insegnamentoKey];
  const esamiInsegnamento = data.esami.filter(esame => 
    esame.insegnamento == insegnamentoData.id
  );

  const tableId = `tabella-${insegnamentoKey.replace(/\s+/g, "-")}`;
  const tableElement = createExamsTable(tableId, esamiInsegnamento);
  container.appendChild(tableElement);
}

function displaySessioniEsami(data, insegnamentoKey, container, targetEsami, targetData) {
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

  // Ottieni il semestre dell'insegnamento per determinare i valori corretti
  let insegnamentoSemestre = null;
  
  // Cerca nel dataset originale per trovare il semestre
  for (const cds of data.originalCdsData || []) {
    if (cds.insegnamenti) {
      for (const ins of cds.insegnamenti) {
        if (ins.id === data.insegnamenti[insegnamentoKey].id) {
          insegnamentoSemestre = ins.semestre;
          break;
        }
      }
    }
    if (insegnamentoSemestre) break;
  }

  // Determina i numeri massimi per questo specifico insegnamento
  let sessioniMaxValues = {};
  if (targetData.sessioni_per_cds && cdsInfo) {
    const sessioniCds = targetData.sessioni_per_cds[cdsInfo.cds_codice];
    
    if (sessioniCds) {
      Object.keys(sessioniCds).forEach(tipoSessione => {
        const datiSessione = sessioniCds[tipoSessione];
        let maxValue;
        
        if (insegnamentoSemestre === 3) { // Annuale
          if (tipoSessione === 'anticipata') {
            maxValue = 0; // Gli insegnamenti annuali non dovrebbero avere appelli in anticipata
          } else {
            maxValue = datiSessione.secondo_semestre;
          }
        } else if (insegnamentoSemestre === 1) {
          maxValue = datiSessione.primo_semestre;
        } else { // semestre 2
          maxValue = datiSessione.secondo_semestre;
        }
        
        sessioniMaxValues[tipoSessione] = maxValue || 0;
      });
    }
  }

  // Fallback a valori di default se non trovati i dati specifici
  if (Object.keys(sessioniMaxValues).length === 0) {
    sessioniMaxValues = {
      'anticipata': 0,
      'estiva': 0,
      'autunnale': 0,
      'invernale': 0
    };
  }

  const sessioniDaVisualizzare = [
    { nome: "Sessione Anticipata", count: sessioni.Anticipata || { ufficiali: 0, totali: 0 }, max: sessioniMaxValues['anticipata'] || 0 },
    { nome: "Sessione Estiva", count: sessioni.Estiva || { ufficiali: 0, totali: 0 }, max: sessioniMaxValues['estiva'] || 0 },
    { nome: "Sessione Autunnale", count: sessioni.Autunnale || { ufficiali: 0, totali: 0 }, max: sessioniMaxValues['autunnale'] || 0 },
    { nome: "Sessione Invernale", count: sessioni.Invernale || { ufficiali: 0, totali: 0 }, max: sessioniMaxValues['invernale'] || 0 }
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
      const insegnamentoId = data.insegnamenti[insegnamentoKey].id;
      
      // Verifica se la card è già attiva (filtro già applicato)
      if (card.classList.contains('active')) {
        // Se già attiva, rimuovi il filtro
        resetTableFilter(tableId);
        gridContainer.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
      } else {
        // Altrimenti applica il filtro per insegnamento e sessione
        filterTableBySessionAndTeaching(tableId, sessioneNome, insegnamentoId, data.esami);
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

function displayAllExams(data, container, targetEsami, targetData) {
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
    
    // Calcola i totali escludendo la proprietà 'titolo'
    let totaleEsamiUfficiali = 0;
    let totaleEsamiTotali = 0;
    
    Object.keys(sessioni).forEach(key => {
      if (key !== 'titolo' && sessioni[key] && typeof sessioni[key] === 'object') {
        // Verifica che l'oggetto abbia le proprietà necessarie
        if (sessioni[key].hasOwnProperty('ufficiali') && sessioni[key].hasOwnProperty('totali')) {
          totaleEsamiUfficiali += sessioni[key].ufficiali || 0;
          totaleEsamiTotali += sessioni[key].totali || 0;
        }
      }
    });

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
  const currentCol = table.getAttribute("data-sort-col");
  const direction = (currentCol === colIndex.toString() && currentDir === "asc") ? "desc" : "asc";
  
  table.setAttribute("data-sort-col", colIndex);
  table.setAttribute("data-sort-dir", direction);

  // Aggiorna le frecce negli header
  updateSortArrows(table, colIndex, direction);

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

// Funzione per aggiornare le frecce di ordinamento
function updateSortArrows(table, activeColIndex, direction) {
  const headers = table.querySelectorAll('.esami-th.sortable');
  
  headers.forEach((header, index) => {
    header.classList.remove('sort-asc', 'sort-desc');
    
    if (index === activeColIndex) {
      header.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
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

// Funzione per filtrare la tabella per sessione e insegnamento
function filterTableBySessionAndTeaching(tableId, sessioneNome, insegnamentoId, tuttiEsami) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  const rows = tbody.querySelectorAll('tr');
  
  // Usa i dati delle date valide già caricati
  if (!globalDateValideData) return;
  
  applySessionAndTeachingFilter(rows, sessioneNome, insegnamentoId, globalDateValideData, tuttiEsami);
}

// Funzione di supporto per applicare il filtro alle righe per sessione e insegnamento
function applySessionAndTeachingFilter(rows, sessioneNome, insegnamentoId, dateValideData, tuttiEsami) {
  rows.forEach(row => {
    const insegnamentoIdRiga = row.getAttribute('data-insegnamento-id');
    const dataEsameStr = row.getAttribute('data-datetime');
    
    if (!insegnamentoIdRiga || !dataEsameStr) return;
    
    const dataEsame = new Date(dataEsameStr);
    const sessioneEsame = determinaSessioneEsame(dataEsame, dateValideData);
    
    // Mostra solo se corrisponde sia la sessione che l'insegnamento
    if (sessioneEsame === sessioneNome && insegnamentoIdRiga == insegnamentoId) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Funzione per filtrare la tabella per sessione
function filterTableBySession(tableId, sessioneNome, tuttiEsami) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  const rows = tbody.querySelectorAll('tr');
  
  // Recupera sempre i dati delle date valide
  const userData = window.currentUserData;
  const selectedYear = window.AnnoAccademicoManager.getSelectedAcademicYear();
  
  if (!userData || !selectedYear) {
    return;
  }
  
  const params = new URLSearchParams({
    docente: userData.user_data.username,
    anno: selectedYear
  });
  
  fetch(`/api/get-date-valide?${params}`)
    .then(r => r.json())
    .then(dateValideData => {
      applySessionFilter(rows, sessioneNome, dateValideData);
    })
    .catch(error => {
      // Non applicare nessun filtro in caso di errore
    });
}

// Funzione di supporto per applicare il filtro alle righe
function applySessionFilter(rows, sessioneNome, dateValideData) {
  rows.forEach(row => {
    const dataCell = row.cells[5]; // Colonna data (indice 5)
    if (!dataCell) return;
    
    const dataEsame = new Date(dataCell.getAttribute('data-datetime'));
    const sessioneEsame = determinaSessioneEsame(dataEsame, dateValideData);
    
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
      if (window.showMessage) {
        window.showMessage('Esame eliminato con successo', 'Eliminazione completata', 'success');
      }
      // Ricarica i dati
      fetchAndDisplayEsami();
    } else {
      if (window.showMessage) {
        window.showMessage('Errore nell\'eliminazione dell\'esame: ' + result.message, 'Errore eliminazione', 'error');
      } else {
        alert('Errore nell\'eliminazione dell\'esame: ' + result.message);
      }
    }
  } catch (error) {
    if (window.showMessage) {
      window.showMessage('Si è verificato un errore durante l\'eliminazione dell\'esame', 'Errore di connessione', 'error');
    } else {
      alert('Si è verificato un errore durante l\'eliminazione dell\'esame');
    }
  }
}