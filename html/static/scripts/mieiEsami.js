// Script per la gestione della pagina "I miei esami"

// Quando il documento è pronto
document.addEventListener("DOMContentLoaded", function () {
  // Assicuriamoci che i dati utente siano precaricati
  window.preloadUserData();
  
  // Inizializza l'anno accademico selezionato dai cookie
  window.initSelectedAcademicYear();
  
  // Aggiorna il titolo della pagina
  window.updatePageTitle();

  // Configura il dropdown dell'anno accademico
  setupAnnoAccademicoDropdown();

  // Ottieni i dati degli esami dell'utente
  fetchAndDisplayEsami();
});

// Configura il dropdown dell'anno accademico
async function setupAnnoAccademicoDropdown() {
  const select = document.getElementById('annoAccademicoSelect');
  if (!select) return;

  try {
    // Carica gli anni disponibili dall'API
    const response = await fetch('/api/get-anni-accademici');
    if (!response.ok) {
      throw new Error('Errore nel caricamento degli anni accademici');
    }
    
    const anni = await response.json();
    
    // Pulisce le opzioni esistenti (eccetto la prima)
    select.innerHTML = '<option value="">Seleziona anno</option>';
    
    // Aggiunge le opzioni degli anni
    anni.forEach(anno => {
      const option = document.createElement('option');
      option.value = anno;
      option.textContent = `${anno}/${anno + 1}`;
      select.appendChild(option);
    });
    
    // Imposta l'anno selezionato dal cookie se disponibile
    const selectedYear = window.getSelectedAcademicYear ? window.getSelectedAcademicYear() : null;
    if (selectedYear && anni.includes(parseInt(selectedYear))) {
      select.value = selectedYear;
    }
    
    // Aggiunge il listener per il cambio di selezione
    select.addEventListener('change', function() {
      const selectedValue = this.value;
      if (selectedValue) {
        // Salva la selezione nel cookie usando la funzione da calendarUtils
        if (window.setSelectedAcademicYear) {
          window.setSelectedAcademicYear(selectedValue);
        }
        // Ricarica i dati degli esami
        fetchAndDisplayEsami();
      }
    });
    
  } catch (error) {
    console.error('Errore nel setup del dropdown anno accademico:', error);
    // In caso di errore, nascondi il dropdown
    const container = select.closest('.anno-accademico-container');
    if (container) {
      container.style.display = 'none';
    }
  }
}

// Carica gli esami dell'utente e li visualizza
function fetchAndDisplayEsami() {
  // Ottiene i dati dell'utente tramite la funzione centralizzata
  getUserData()
    .then((data) => {
      if (data && data.authenticated && data.user_data) {
        const userData = data.user_data;
        const selectedYear = window.getSelectedAcademicYear ? window.getSelectedAcademicYear() : null;
        
        if (!selectedYear) {
          document.getElementById("contenitoreEsami").innerHTML = 
            '<div class="error-message">Seleziona un anno accademico per visualizzare gli esami</div>';
          return;
        }

        // Costruisci i parametri per gli endpoint
        const params = new URLSearchParams({
          docente: userData.username,
          anno: selectedYear
        });

        // Carica prima gli insegnamenti del docente, poi gli esami
        Promise.all([
          fetch(`/api/get-insegnamenti-docente?${params}`).then(r => r.json()),
          fetch(`/api/getEsami?${params}`).then(r => r.json())
        ])
        .then(([insegnamentiResponse, esamiData]) => {
          if (insegnamentiResponse.status !== 'success') {
            throw new Error('Errore nel caricamento degli insegnamenti');
          }

          // Trasforma i dati per mantenere compatibilità con il resto del codice
          const processedData = processDataForDisplay(insegnamentiResponse.cds, esamiData, userData.username);
          
          // Visualizza i dati usando la stessa logica esistente
          displayEsamiData(processedData);
        })
        .catch((error) => {
          console.error("Errore:", error);
          document.getElementById("contenitoreEsami").innerHTML = 
            `<div class="error-message">Si è verificato un errore nel caricamento degli esami: ${error.message}</div>`;
        });
      }
    })
    .catch((error) => {
      console.error("Errore nell'ottenimento dati utente:", error);
      document.getElementById("contenitoreEsami").innerHTML = 
        `<div class="error-message">Si è verificato un errore nell'ottenimento dei dati: ${error.message}</div>`;
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
      
      // Determina la sessione dalla data dell'esame
      const dataEsame = new Date(esame.start);
      const sessione = determinaSessioneEsame(dataEsame);
      
      // Ottieni informazioni CdS dall'insegnamento o dai dati extended
      const insegnamentoInfo = insegnamentiDocente.get(esame.title) || {};
      
      // Formato compatibile con il codice esistente
      const esameFormatted = {
        id: esame.id,
        docente: esame.extendedProps.docente,
        docenteNome: esame.extendedProps.docenteNome,
        insegnamento: esame.title,
        aula: esame.aula || 'N/A',
        data: formatDateOnly(dataEsame),
        ora: formatTimeOnly(dataEsame),
        dataora: esame.start,
        cds: esame.extendedProps.nome_cds || insegnamentoInfo.cds_nome || 'N/A',
        codice_cds: esame.extendedProps.codice_cds || insegnamentoInfo.cds_codice || 'N/A',
        durata_appello: esame.extendedProps.durata_appello || 120,
        tipo_appello: esame.extendedProps.tipo_appello || 'F',
        categoria: esame.extendedProps.categoria || 'standard'
      };
      
      esamiProcessed.push(esameFormatted);
      
      // Conta gli esami per sessione (escludi prove parziali)
      if (esame.extendedProps.tipo_appello !== 'PP' && sessione && insegnamenti[esame.title]) {
        insegnamenti[esame.title][sessione]++;
      }
    }
  });

  return {
    esami: esamiProcessed,
    insegnamenti: insegnamenti
  };
}

// Determina la sessione in base alla data dell'esame usando le stesse regole del backend
function determinaSessioneEsame(dataEsame) {
  const mese = dataEsame.getMonth() + 1; // getMonth() è 0-based
  const anno = dataEsame.getFullYear();
  
  // Logica per determinare la sessione in base al mese e all'anno accademico
  if (mese >= 1 && mese <= 2) {
    // Gennaio-Febbraio: può essere Anticipata o Invernale a seconda dell'anno accademico
    const selectedYear = window.getSelectedAcademicYear ? parseInt(window.getSelectedAcademicYear()) : null;
    if (selectedYear) {
      // Se l'anno corrente è l'anno accademico di riferimento + 1, è Invernale
      // Altrimenti è Anticipata
      return anno === selectedYear + 1 ? 'Invernale' : 'Anticipata';
    }
    // Fallback: considera come Anticipata
    return 'Anticipata';
  } else if (mese >= 6 && mese <= 7) {
    return 'Estiva'; // Giugno-Luglio
  } else if (mese === 9) {
    return 'Autunnale'; // Settembre
  }
  
  return null; // Per date che non rientrano nei periodi standard
}

// Funzioni di utilità per formattazione date
function formatDateOnly(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTimeOnly(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
  window.esamiData = data;

  // Crea i pulsanti dei tabs
  insegnamenti.forEach((insegnamento, index) => {
    const tabButton = document.createElement("button");
    tabButton.className = "tab-button";
    tabButton.textContent = insegnamento;
    tabButton.onclick = function () {
      window.location.href = `?insegnamento=${encodeURIComponent(insegnamento)}`;
    };
    tabsHeader.appendChild(tabButton);

    // Crea il contenuto del tab
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
      const buttons = document.querySelectorAll(".tab-button");
      buttons.forEach((button) => {
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

// Configura il dropdown dell'anno accademico
async function setupAnnoAccademicoDropdown() {
  const select = document.getElementById('annoAccademicoSelect');
  if (!select) return;

  try {
    // Carica gli anni disponibili dall'API
    const response = await fetch('/api/get-anni-accademici');
    if (!response.ok) {
      throw new Error('Errore nel caricamento degli anni accademici');
    }
    
    const anni = await response.json();
    
    // Pulisce le opzioni esistenti (eccetto la prima)
    select.innerHTML = '<option value="">Seleziona anno</option>';
    
    // Aggiunge le opzioni degli anni
    anni.forEach(anno => {
      const option = document.createElement('option');
      option.value = anno;
      option.textContent = `${anno}/${anno + 1}`;
      select.appendChild(option);
    });
    
    // Imposta l'anno selezionato dal cookie se disponibile
    const selectedYear = window.getSelectedAcademicYear ? window.getSelectedAcademicYear() : null;
    if (selectedYear && anni.includes(parseInt(selectedYear))) {
      select.value = selectedYear;
    }
    
    // Aggiunge il listener per il cambio di selezione
    select.addEventListener('change', function() {
      const selectedValue = this.value;
      if (selectedValue) {
        // Salva la selezione nel cookie usando la funzione da calendarUtils
        if (window.setSelectedAcademicYear) {
          window.setSelectedAcademicYear(selectedValue);
        }
        // Ricarica i dati degli esami
        fetchAndDisplayEsami();
      }
    });
    
  } catch (error) {
    console.error('Errore nel setup del dropdown anno accademico:', error);
    // In caso di errore, nascondi il dropdown
    const container = select.closest('.anno-accademico-container');
    if (container) {
      container.style.display = 'none';
    }
  }
}

// Carica gli esami dell'utente e li visualizza
function fetchAndDisplayEsami() {
  // Ottiene i dati dell'utente tramite la funzione centralizzata
  getUserData()
    .then((data) => {
      if (data && data.authenticated && data.user_data) {
        const userData = data.user_data;
        const selectedYear = window.getSelectedAcademicYear ? window.getSelectedAcademicYear() : null;
        
        if (!selectedYear) {
          document.getElementById("contenitoreEsami").innerHTML = 
            '<div class="error-message">Seleziona un anno accademico per visualizzare gli esami</div>';
          return;
        }

        // Costruisci i parametri per gli endpoint
        const params = new URLSearchParams({
          docente: userData.username,
          anno: selectedYear
        });

        // Carica prima gli insegnamenti del docente, poi gli esami
        Promise.all([
          fetch(`/api/get-insegnamenti-docente?${params}`).then(r => r.json()),
          fetch(`/api/getEsami?${params}`).then(r => r.json())
        ])
        .then(([insegnamentiResponse, esamiData]) => {
          if (insegnamentiResponse.status !== 'success') {
            throw new Error('Errore nel caricamento degli insegnamenti');
          }

          // Trasforma i dati per mantenere compatibilità con il resto del codice
          const processedData = processDataForDisplay(insegnamentiResponse.cds, esamiData, userData.username);
          
          // Visualizza i dati usando la stessa logica esistente
          displayEsamiData(processedData);
        })
        .catch((error) => {
          console.error("Errore:", error);
          document.getElementById("contenitoreEsami").innerHTML = 
            `<div class="error-message">Si è verificato un errore nel caricamento degli esami: ${error.message}</div>`;
        });
      }
    })
    .catch((error) => {
      console.error("Errore nell'ottenimento dati utente:", error);
      document.getElementById("contenitoreEsami").innerHTML = 
        `<div class="error-message">Si è verificato un errore nell'ottenimento dei dati: ${error.message}</div>`;
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
      
      // Determina la sessione dalla data dell'esame
      const dataEsame = new Date(esame.start);
      const sessione = determinaSessioneEsame(dataEsame);
      
      // Ottieni informazioni CdS dall'insegnamento o dai dati extended
      const insegnamentoInfo = insegnamentiDocente.get(esame.title) || {};
      
      // Formato compatibile con il codice esistente
      const esameFormatted = {
        id: esame.id,
        docente: esame.extendedProps.docente,
        docenteNome: esame.extendedProps.docenteNome,
        insegnamento: esame.title,
        aula: esame.aula || 'N/A',
        data: formatDateOnly(dataEsame),
        ora: formatTimeOnly(dataEsame),
        dataora: esame.start,
        cds: esame.extendedProps.nome_cds || insegnamentoInfo.cds_nome || 'N/A',
        codice_cds: esame.extendedProps.codice_cds || insegnamentoInfo.cds_codice || 'N/A',
        durata_appello: esame.extendedProps.durata_appello || 120,
        tipo_appello: esame.extendedProps.tipo_appello || 'F',
        categoria: esame.extendedProps.categoria || 'standard'
      };
      
      esamiProcessed.push(esameFormatted);
      
      // Conta gli esami per sessione (escludi prove parziali)
      if (esame.extendedProps.tipo_appello !== 'PP' && sessione && insegnamenti[esame.title]) {
        insegnamenti[esame.title][sessione]++;
      }
    }
  });

  return {
    esami: esamiProcessed,
    insegnamenti: insegnamenti
  };
}

// Determina la sessione in base alla data dell'esame usando le stesse regole del backend
function determinaSessioneEsame(dataEsame) {
  const mese = dataEsame.getMonth() + 1; // getMonth() è 0-based
  const anno = dataEsame.getFullYear();
  
  // Logica per determinare la sessione in base al mese e all'anno accademico
  if (mese >= 1 && mese <= 2) {
    // Gennaio-Febbraio: può essere Anticipata o Invernale a seconda dell'anno accademico
    const selectedYear = window.getSelectedAcademicYear ? parseInt(window.getSelectedAcademicYear()) : null;
    if (selectedYear) {
      // Se l'anno corrente è l'anno accademico di riferimento + 1, è Invernale
      // Altrimenti è Anticipata
      return anno === selectedYear + 1 ? 'Invernale' : 'Anticipata';
    }
    // Fallback: considera come Anticipata
    return 'Anticipata';
  } else if (mese >= 6 && mese <= 7) {
    return 'Estiva'; // Giugno-Luglio
  } else if (mese === 9) {
    return 'Autunnale'; // Settembre
  }
  
  return null; // Per date che non rientrano nei periodi standard
}

// Funzioni di utilità per formattazione date
function formatDateOnly(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTimeOnly(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
  window.esamiData = data;

  // Crea i pulsanti dei tabs
  insegnamenti.forEach((insegnamento, index) => {
    const tabButton = document.createElement("button");
    tabButton.className = "tab-button";
    tabButton.textContent = insegnamento;
    tabButton.onclick = function () {
      window.location.href = `?insegnamento=${encodeURIComponent(insegnamento)}`;
    };
    tabsHeader.appendChild(tabButton);

    // Crea il contenuto del tab
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
      const buttons = document.querySelectorAll(".tab-button");
      buttons.forEach((button) => {
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

// Funzione per visualizzare le tabelle degli esami
function displayTabelleEsami(data, insegnamento, container) {
  const esamiInsegnamento = data.esami.filter(
    (esame) => esame.insegnamento === insegnamento
  );

  if (esamiInsegnamento.length > 0) {
    const section = document.createElement("div");
    section.className = "section";

    const table = document.createElement("table");
    table.id = `tabella-${insegnamento.replace(/\s+/g, "-")}`;
    table.className = "esami-table";

    table.innerHTML = `
      <thead class="esami-thead">
          <tr class="esami-tr">
              <th class="esami-th" onclick="sortTable('${table.id}', 0)">Tipo prova</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 1)">CDS</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 2)">Insegnamento</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 3)">Docente</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 4, 'date')">Data</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 5)">Aula</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 6)">Durata (min)</th>
              <th class="esami-th">Azioni</th>
          </tr>
      </thead>
      <tbody class="esami-tbody"></tbody>
    `;

    const tbody = table.querySelector("tbody");

    esamiInsegnamento.forEach((esame) => {
      const row = tbody.insertRow();
      row.className = "esami-tr";
      
      let cell0 = row.insertCell(0);
      cell0.className = "esami-td";
      cell0.textContent = esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale";
      
      let cell1 = row.insertCell(1);
      cell1.className = "esami-td";
      cell1.textContent = esame.cds || "N/A";
      
      let cell2 = row.insertCell(2);
      cell2.className = "esami-td";
      cell2.textContent = esame.insegnamento;
      
      let cell3 = row.insertCell(3);
      cell3.className = "esami-td";
      cell3.textContent = esame.docenteNome;

      const dataCell = row.insertCell(4);
      dataCell.className = "esami-td";
      dataCell.textContent = formatDateTime(esame.dataora);
      dataCell.setAttribute("data-datetime", esame.dataora);

      let cell5 = row.insertCell(5);
      cell5.className = "esami-td";
      cell5.textContent = esame.aula;
      
      let cell6 = row.insertCell(6);
      cell6.className = "esami-td";
      cell6.textContent = formatDurata(esame.durata_appello);
      
      const actionCell = row.insertCell(7);
      actionCell.className = "esami-td esami-td-actions";
      const modifyButton = document.createElement("button");
      modifyButton.className = "form-button";
      modifyButton.textContent = "Modifica";
      modifyButton.setAttribute("data-id", esame.id);
      modifyButton.onclick = function() {
        editEsame(esame.id);
      };
      actionCell.appendChild(modifyButton);
    });

    section.appendChild(table);
    container.appendChild(section);
  } else {
    const noExamsMsg = document.createElement("p");
    noExamsMsg.style.textAlign = "center";
    noExamsMsg.textContent = "Inserisci degli appelli d'esame per visualizzarli qui!";
    container.appendChild(noExamsMsg);
  }
}

function displaySessioniEsami(data, insegnamento, container) {
  const section = document.createElement("div");
  section.className = "exam-section";

  const title = document.createElement("h2");
  title.textContent = insegnamento;
  section.appendChild(title);

  const selectedYear = window.getSelectedAcademicYear ? window.getSelectedAcademicYear() : null;
  let planningYear, nextYear;
  
  if (selectedYear) {
    planningYear = parseInt(selectedYear);
    nextYear = planningYear + 1;
  } else {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    planningYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
    nextYear = planningYear + 1;
  }

  const sessioni = data.insegnamenti[insegnamento];

  const gridContainer = document.createElement("div");
  gridContainer.className = "sessions-grid";

  const sessioniDaVisualizzare = [
    {
      nome: "Sessione Anticipata",
      periodo: `Gen/Feb ${planningYear}`,
      count: sessioni.Anticipata || 0,
      max: 3,
    },
    {
      nome: "Sessione Estiva",
      periodo: `Giu/Lug ${planningYear}`,
      count: sessioni.Estiva || 0,
      max: 3,
    },
    {
      nome: "Sessione Autunnale",
      periodo: `Set ${planningYear}`,
      count: sessioni.Autunnale || 0,
      max: 2,
    },
    {
      nome: "Sessione Invernale",
      periodo: `Gen/Feb ${nextYear}`,
      count: sessioni.Invernale || 0,
      max: 3,
    },
  ];

  sessioniDaVisualizzare.forEach((sessione) => {
    const card = document.createElement("div");
    card.className = "session-card static";

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
  const sessionsSection = document.createElement("div");
  sessionsSection.className = "exam-section";

  const sessionsTitle = document.createElement("h2");
  sessionsTitle.textContent = "Riepilogo insegnamenti";
  sessionsSection.appendChild(sessionsTitle);

  const sessionsGrid = document.createElement("div");
  sessionsGrid.className = "sessions-grid";

  const insegnamenti = Object.keys(data.insegnamenti);
  insegnamenti.forEach((insegnamento) => {
    const sessioni = data.insegnamenti[insegnamento];
    const totaleEsami = Object.values(sessioni).reduce(
      (sum, val) => sum + (val || 0),
      0
    );

    const cardElement = document.createElement("div");
    cardElement.className = "session-card";

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

    cardElement.addEventListener("click", () => {
      window.location.href = `?insegnamento=${encodeURIComponent(
        insegnamento
      )}`;
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

  const section = document.createElement("div");
  section.className = "section";

  const tableAllExams = document.createElement("table");
  tableAllExams.id = "tabella-tutti-appelli";
  tableAllExams.className = "esami-table";

  tableAllExams.innerHTML = `
    <thead class="esami-thead">
        <tr class="esami-tr">
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 0)">Tipo prova</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 1)">CDS</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 2)">Insegnamento</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 3)">Docente</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 4, 'date')">Data</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 5)">Aula</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 6)">Durata</th>
            <th class="esami-th">Azioni</th>
        </tr>
    </thead>
    <tbody class="esami-tbody"></tbody>
  `;

  const tbodyAllExams = tableAllExams.querySelector("tbody");
  const esamiOrdinati = [...data.esami].sort((a, b) => {
    const dateA = new Date(a.dataora);
    const dateB = new Date(b.dataora);
    return dateA - dateB;
  });

  esamiOrdinati.forEach((esame) => {
    const row = tbodyAllExams.insertRow();
    row.className = "esami-tr";
    
    let cell0 = row.insertCell(0);
    cell0.className = "esami-td";
    cell0.textContent = esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale";
    
    let cell1 = row.insertCell(1);
    cell1.className = "esami-td";
    cell1.textContent = esame.cds || "N/A";
    
    let cell2 = row.insertCell(2);
    cell2.className = "esami-td";
    cell2.textContent = esame.insegnamento;
    
    let cell3 = row.insertCell(3);
    cell3.className = "esami-td";
    cell3.textContent = esame.docenteNome;

    const dataCell = row.insertCell(4);
    dataCell.className = "esami-td";
    dataCell.textContent = formatDateTime(esame.dataora);
    dataCell.setAttribute("data-datetime", esame.dataora);

    let cell5 = row.insertCell(5);
    cell5.className = "esami-td";
    cell5.textContent = esame.aula;
    
    let cell6 = row.insertCell(6);
    cell6.className = "esami-td";
    cell6.textContent = formatDurata(esame.durata_appello);
    
    const actionCell = row.insertCell(7);
    actionCell.className = "esami-td esami-td-actions";
    const modifyButton = document.createElement("button");
    modifyButton.className = "form-button";
    modifyButton.textContent = "Modifica";
    modifyButton.setAttribute("data-id", esame.id);
    modifyButton.onclick = function() {
      editEsame(esame.id);
    };
    actionCell.appendChild(modifyButton);
  });

  section.appendChild(tableAllExams);
  container.appendChild(section);
}

// Ordinamento tabella migliorato per gestire correttamente le date
function sortTable(tableId, colIndex, type = "text") {
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

    if (type === "date") {
      // Usa il valore dell'attributo data-datetime per le date
      aValue =
        a.cells[colIndex].getAttribute("data-datetime") ||
        a.cells[colIndex].textContent.trim();
      bValue =
        b.cells[colIndex].getAttribute("data-datetime") ||
        b.cells[colIndex].textContent.trim();

      // Converti in oggetti Date per il confronto
      const dateA = new Date(aValue);
      const dateB = new Date(bValue);

      return direction === "asc" ? dateA - dateB : dateB - dateA;
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
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // +1 perché i mesi sono 0-based
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  } catch (error) {
    console.error("Errore nella formattazione della data:", error);
    return dateTimeStr; // Restituisci la stringa originale in caso di errore
  }
}

// Funzione per formattare la durata in ore e minuti
function formatDurata(durataMinuti) {
  if (!durataMinuti) return "N/D";
  
  const durata = parseInt(durataMinuti, 10);
  if (isNaN(durata)) return durataMinuti;
  
  const ore = Math.floor(durata / 60);
  const minuti = durata % 60;
  
  if (ore === 0) {
    return `${minuti} min`;
  } else if (minuti === 0) {
    return ore === 1 ? `${ore} ora` : `${ore} ore`;
  } else {
    return `${ore} ${ore === 1 ? 'ora' : 'ore'} e ${minuti} min`;
  }
}

// Funzione per aprire il form di modifica dell'esame
function editEsame(esameId) {
  // Verificare che EsameForm esista
  if (window.EsameForm) {
    // Carica i dettagli dell'esame e mostra il form
    fetch(`/api/getEsameById?id=${esameId}`)
      .then(response => {
        return response.json();
      })
      .then(data => {
        if (data.success) {
          try {
            // Assicurati che InsegnamentiManager sia disponibile
            if (!window.InsegnamentiManager) {
              throw new Error("InsegnamentiManager non inizializzato");
            }

            // Mostra il form e dopo inizializza InsegnamentiManager
            window.EsameForm.showForm(data.esame, true)
              .then(() => {
                // Recupera l'username dal campo docente
                const username = document.getElementById("docente")?.value;
                if (username) {
                  // Inizializza InsegnamentiManager
                  window.InsegnamentiManager.initUI(
                    "insegnamentoBox",
                    "insegnamentoDropdown",
                    "insegnamentoOptions",
                    username
                  );
                }
              });
          } catch (err) {
            console.error("Errore nella compilazione del form:", err);
            showMessage("Errore nella compilazione del form: " + err.message, "Errore", "error");
          }
        } else {
          console.error("Errore nella risposta API:", data.message);
          showMessage(data.message, "Errore", "error");
        }
      })
      .catch(error => {
        console.error("Errore nel caricamento dei dettagli dell'esame:", error);
        showMessage("Errore nel caricamento dei dettagli dell'esame", "Errore", "error");
      });
  } else {
    console.error("EsameForm non disponibile");
    showMessage("Impossibile modificare l'esame: modulo non disponibile", "Errore", "error");
  }
}

// Funzione per eliminare un esame
function deleteEsame(examId) {
  fetch('/api/deleteEsame', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: examId }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage("Esame eliminato con successo", "Successo", "success");
        
        // Chiudi il form usando EsameForm se disponibile
        if (window.EsameForm && window.EsameForm.hideForm) {
          window.EsameForm.hideForm();
        }
        
        // Ricarica la pagina per aggiornare la tabella
        setTimeout(() => {
          location.reload();
        }, 1000);
      } else {
        showMessage(data.message || "Errore nell'eliminazione dell'esame", "Errore", "error");
      }
    })
    .catch(error => {
      console.error("Errore nella richiesta di eliminazione:", error);
      showMessage("Errore nella richiesta di eliminazione", "Errore", "error");
    });
}

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;
window.editEsame = editEsame;
window.deleteEsame = deleteEsame;

// Aggiorna l'evento del pulsante "Tutti gli appelli"
document.addEventListener("DOMContentLoaded", function () {
  const allExamsButton = document.getElementById("allExamsButton");
  if (allExamsButton) {
    allExamsButton.onclick = function () {
      window.location.href = window.location.pathname;
    };
  }
});
