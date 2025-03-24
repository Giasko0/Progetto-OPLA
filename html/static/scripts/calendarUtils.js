// Determina il range di date valido in base al periodo dell'anno
export function getValidDateRange() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const startYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
  const endYear = startYear + 1;

  return {
    start: `${startYear}-01-01`,
    end: `${endYear}-04-30`,
  };
}

// Restituisce l'anno accademico per la pianificazione
export function getPlanningYear() {
  const currentDate = new Date();
  return currentDate.getMonth() >= 9
    ? currentDate.getFullYear()
    : currentDate.getFullYear() - 1;
}

// Crea un dropdown unificato per sessioni, insegnamenti o cds
export function createDropdown(type) {
  const dropdown = document.createElement("div");
  dropdown.className = "calendar-dropdown";
  if (type === "sessioni") dropdown.id = "sessioniDropdown";
  if (type === "insegnamenti") dropdown.id = "insegnamentiDropdown";
  if (type === "cds") dropdown.id = "cdsDropdown";
  document.body.appendChild(dropdown);

  // Aggiungi classe per stile responsive
  dropdown.classList.add("calendar-dropdown-mobile");

  return dropdown;
}

// Popola il dropdown degli insegnamenti
export function populateInsegnamentiDropdown(
  dropdownInsegnamenti,
  docente,
  planningYear,
  cdsFiltro = null,
  preloadedInsegnamenti = null
) {
  // Se abbiamo InsegnamentiManager, utilizziamo quello
  if (window.InsegnamentiManager && preloadedInsegnamenti) {
    // Raggruppa gli insegnamenti per CDS
    const insegnamentiPerCds = {};
    
    // Filtra per CdS se necessario
    let insegnamenti = preloadedInsegnamenti;
    if (cdsFiltro) {
      insegnamenti = insegnamenti.filter(ins => ins.cds_codice === cdsFiltro);
    }

    // Organizza per CdS
    insegnamenti.forEach((ins) => {
      const cdsKey = ins.cds_codice || 'altro';
      const cdsNome = ins.cds_nome || 'Altro';
      
      if (!insegnamentiPerCds[cdsKey]) {
        insegnamentiPerCds[cdsKey] = {
          nome: cdsNome,
          insegnamenti: [],
        };
      }
      insegnamentiPerCds[cdsKey].insegnamenti.push(ins);
    });

    // Costruisci HTML per il dropdown
    let dropdownHTML = "";

    // Genera HTML per ogni CdS
    Object.keys(insegnamentiPerCds).forEach((cdsCodice) => {
      const cds = insegnamentiPerCds[cdsCodice];
      
      // Formato del titolo in base al tipo di CdS
      if (cdsCodice === 'altro') {
        dropdownHTML += `<div class="dropdown-cds-title">Altro</div>`;
      } else {
        dropdownHTML += `<div class="dropdown-cds-title">${cds.nome} (${cdsCodice})</div>`;
      }

      // Opzioni per gli insegnamenti del CdS
      cds.insegnamenti.forEach((ins) => {
        const isSelected = window.InsegnamentiManager.isSelected(ins.codice);

        dropdownHTML += `
          <div class="dropdown-item dropdown-item-indented" data-codice="${ins.codice}" 
               data-semestre="${ins.semestre}" data-anno-corso="${ins.anno_corso || ""}" 
               data-cds="${ins.cds_codice || ''}">
            <input type="checkbox" id="ins-${ins.codice}" 
                value="${ins.codice}"
                ${isSelected ? "checked" : ""}>
            <label for="ins-${ins.codice}">${ins.titolo}</label>
          </div>
        `;
      });
    });

    dropdownInsegnamenti.innerHTML = dropdownHTML;
    return;
  }

  // Implementazione di fallback per compatibilità con vecchio codice
  // Se abbiamo insegnamenti precaricati, li utilizziamo
  if (preloadedInsegnamenti) {
    processAndDisplayInsegnamenti(preloadedInsegnamenti);
    return;
  }

  // Altrimenti effettua la chiamata API
  let url = `/api/getInsegnamentiDocente?anno=${planningYear}&docente=${docente}`;
  if (cdsFiltro) {
    url += `&cds=${cdsFiltro}`;
  }
  
  // Aggiungi sempre admin_view=true, il backend verificherà se l'utente è effettivamente admin
  url += "&admin_view=true";

  fetch(url)
    .then((response) => response.json())
    .then(processAndDisplayInsegnamenti)
    .catch((error) => {
      console.error("Errore nel caricamento degli insegnamenti:", error);
      dropdownInsegnamenti.innerHTML =
        "<div class='dropdown-error'>Errore nel caricamento degli insegnamenti</div>";
    });

  // Funzione per organizzare e visualizzare gli insegnamenti
  function processAndDisplayInsegnamenti(insegnamenti) {
    // Filtra per CdS se necessario
    if (cdsFiltro) {
      insegnamenti = insegnamenti.filter((ins) => ins.cds_codice === cdsFiltro);
    }

    // Raggruppa gli insegnamenti per CDS
    const insegnamentiPerCds = {};

    // Organizza per CdS
    insegnamenti.forEach((ins) => {
      if (!insegnamentiPerCds[ins.cds_codice]) {
        insegnamentiPerCds[ins.cds_codice] = {
          nome: ins.cds_nome,
          insegnamenti: [],
        };
      }
      insegnamentiPerCds[ins.cds_codice].insegnamenti.push(ins);
    });

    // Costruisci HTML per il dropdown
    let dropdownHTML = "";

    // Genera HTML per ogni CdS
    Object.keys(insegnamentiPerCds).forEach((cdsCodice) => {
      const cds = insegnamentiPerCds[cdsCodice];
      dropdownHTML += `<div class="dropdown-cds-title">${cds.nome} (${cdsCodice})</div>`;

      cds.insegnamenti.forEach((ins) => {
        const isSelected =
          window.InsegnamentiManager &&
          window.InsegnamentiManager.isSelected(ins.codice);

        dropdownHTML += `
          <div class="dropdown-item dropdown-item-indented" data-codice="${
            ins.codice
          }" data-semestre="${ins.semestre}" data-anno-corso="${
          ins.anno_corso || ""
        }" data-cds="${ins.cds_codice}">
            <input type="checkbox" id="ins-${ins.codice}" 
                value="${ins.codice}"
                ${isSelected ? "checked" : ""}>
            <label for="ins-${ins.codice}">${ins.titolo}</label>
          </div>
        `;
      });
    });

    dropdownInsegnamenti.innerHTML = dropdownHTML;
  }
}

// Aggiorna gli eventi del calendario utilizzando il backend ottimizzato
export function fetchCalendarEvents(
  calendar,
  planningYear,
  info = null,
  successCallback = null,
  cdsFiltro = null
) {
  // Ottieni docente dai cookie
  const loggedDocente = document.cookie
    .split("; ")
    .find((row) => row.startsWith("username="))
    ?.split("=")[1];

  // Verifica se l'utente è admin
  const isAdmin = document.cookie
    .split("; ")
    .find((row) => row.startsWith("admin="))
    ?.split("=")[1] === "true";

  // Utilizza InsegnamentiManager per generare i parametri
  if (window.InsegnamentiManager) {
    const params = window.InsegnamentiManager.getRequestParams(loggedDocente);
    
    // Aggiungi filtro CdS esplicito se fornito e non già impostato in InsegnamentiManager
    if (cdsFiltro && cdsFiltro !== window.InsegnamentiManager.getCds()) {
      params.set("cds", cdsFiltro);
    }

    // Aggiungi sempre admin_view=true, il backend verificherà se l'utente è effettivamente admin
    params.set("admin_view", "true");

    // Richiesta API
    fetch("/api/getEsami?" + params.toString())
      .then((response) => response.json())
      .then((data) => {
        if (successCallback) {
          // Callback di FullCalendar
          successCallback(data);
        } else {
          // Aggiornamento manuale
          calendar.getEventSources().forEach((source) => source.remove());
          calendar.addEventSource(data);
        }
      })
      .catch((error) => {
        console.error("Errore nel caricamento degli esami:", error);
        if (successCallback) {
          successCallback([]);
        }
      });
    
    return;
  }

  // Implementazione di fallback
  // Parametri base per API
  const params = new URLSearchParams();
  params.append("docente", loggedDocente);
  params.append("admin_view", "true"); // Aggiungi sempre, il backend verificherà i permessi

  // Usa InsegnamentiManager per filtraggi
  if (window.InsegnamentiManager) {
    const selected = window.InsegnamentiManager.getSelected();

    if (selected.size === 0) {
      // Solo esami del docente se nessun filtro
      params.append("solo_docente", "true");
    } else {
      // Filtra per insegnamenti selezionati
      const codici = Array.from(selected.keys());
      params.append("insegnamenti", codici.join(","));
    }
  } else {
    // Fallback: solo esami docente
    params.append("solo_docente", "true");
  }

  // Aggiungi filtro per CdS se presente
  if (cdsFiltro) {
    params.append("cds", cdsFiltro);
  }

  // Richiesta API
  fetch("/api/getEsami?" + params.toString())
    .then((response) => response.json())
    .then((data) => {
      if (successCallback) {
        // Callback di FullCalendar
        successCallback(data);
      } else {
        // Aggiornamento manuale
        calendar.getEventSources().forEach((source) => source.remove());
        calendar.addEventSource(data);
      }
    })
    .catch((error) => {
      console.error("Errore nel caricamento degli esami:", error);
      if (successCallback) {
        successCallback([]);
      }
    });
}

// Carica le date valide direttamente dal backend
export async function loadDateValide(docente, cds) {
  // Costruisce i parametri della richiesta
  const params = new URLSearchParams();

  if (docente) params.append("docente", docente);
  if (cds) params.append("cds", cds);
  
  // Aggiungi sempre admin_view=true, il backend verificherà se l'utente è effettivamente admin
  params.append("admin_view", "true");

  // Ritorna una Promise
  const response = await fetch("/api/getDateValide?" + params.toString());
  return await response.json();
}
