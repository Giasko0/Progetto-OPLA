// Determina il range di date valido in base al periodo dell'anno
export function getValidDateRange(selectedYear = null) {
  if (selectedYear) {
    return {
      start: `${selectedYear}-01-01`,
      end: `${selectedYear + 1}-04-30`,
    };
  }

  const today = new Date();
  const currentYear = today.getFullYear();  
  const currentMonth = today.getMonth() + 1;

  const startYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
  const endYear = startYear + 1;

  return {
    start: `${startYear}-01-01`,
    end: `${endYear}-04-30`,
    today: today.toISOString().split("T")[0], // YYYY-MM-DD
  };
}

// Restituisce l'anno accademico per la pianificazione
export function getPlanningYear(selectedYear = null) {
  if (selectedYear) return selectedYear;
  
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
  document.body.appendChild(dropdown);

  // Aggiungi classe per stile responsive
  dropdown.classList.add("calendar-dropdown-mobile");

  return dropdown;
}

// Popola il dropdown degli insegnamenti utilizzando la cache
export function populateInsegnamentiDropdown(
  dropdownInsegnamenti,
  docente,
  planningYear,
  cdsFiltro = null,
  preloadedInsegnamenti = null
) {
  // Utilizziamo InsegnamentiManager se disponibile
  if (window.InsegnamentiManager) {
    const options = {};
    if (cdsFiltro) options.cds = cdsFiltro;
    
    // Se abbiamo già dati precaricati, li utilizziamo
    if (preloadedInsegnamenti) {
      // Costruisci insegnamentiPerCds utilizzando il formato gerarchico
      let insegnamentiPerCds = {};
      
      // Verifica che preloadedInsegnamenti non sia null o undefined
      if (!preloadedInsegnamenti) {
        dropdownInsegnamenti.innerHTML = "<div class='dropdown-error'>Dati non disponibili</div>";
        return;
      }
      
      // Trasforma i dati nel formato richiesto
      if (preloadedInsegnamenti.cds && Array.isArray(preloadedInsegnamenti.cds)) {
        preloadedInsegnamenti.cds.forEach(cds => {
          if (cds && cds.codice && cds.insegnamenti) {
            insegnamentiPerCds[cds.codice] = {
              nome: cds.nome || cds.nome_corso || "Sconosciuto",
              insegnamenti: Array.isArray(cds.insegnamenti) ? cds.insegnamenti.map(ins => ({
                ...ins,
                cds_codice: cds.codice,
                cds_nome: cds.nome || cds.nome_corso || "Sconosciuto"
              })) : []
            };
          }
        });
      } 
      // Se i dati sono in formato piatto, li organizziamo per CdS
      else if (Array.isArray(preloadedInsegnamenti)) {
        preloadedInsegnamenti.forEach((ins) => {
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
      }
      
      renderInsegnamentiDropdown(insegnamentiPerCds, dropdownInsegnamenti);
    } 
    // Altrimenti usiamo InsegnamentiManager per caricare i dati dalla cache o dal server se necessario
    else {
      // Usa loadInsegnamenti che caricherà dalla cache se disponibile
      window.InsegnamentiManager.loadInsegnamenti(docente, options, (insegnamenti) => {
        // Organizza gli insegnamenti per CdS
        const insegnamentiPerCds = {};
        
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
        
        renderInsegnamentiDropdown(insegnamentiPerCds, dropdownInsegnamenti);
      });
    }
    return;
  }
  
  // Fallback se InsegnamentiManager non è disponibile (raro)
  if (!docente) {
    dropdownInsegnamenti.innerHTML = "<div class='dropdown-error'>Nessun docente specificato</div>";
    return;
  }

  let url = `/api/getInsegnamentiDocente?anno=${planningYear}&docente=${docente}`;
  
  if (cdsFiltro) {
    url += `&cds=${cdsFiltro}`;
  }
  
  fetch(url)
    .then((response) => response.json())
    .then(data => {
      let insegnamentiPiatti = [];
      
      if (data.cds) {
        // Estrazione dei dati in formato piatto
        insegnamentiPiatti = data.cds.flatMap(cds => 
          cds.insegnamenti.map(ins => ({
            codice: ins.codice,
            titolo: ins.titolo,
            semestre: ins.semestre,
            anno_corso: ins.anno_corso,
            cds_codice: cds.codice,
            cds_nome: cds.nome
          }))
        );
      } else {
        insegnamentiPiatti = data;
      }
      
      // Crea struttura organizzata per CdS
      const insegnamentiPerCds = {};
      
      insegnamentiPiatti.forEach((ins) => {
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
      
      renderInsegnamentiDropdown(insegnamentiPerCds, dropdownInsegnamenti);
    })
    .catch((error) => {
      console.error("Errore nel caricamento degli insegnamenti:", error);
      dropdownInsegnamenti.innerHTML = "<div class='dropdown-error'>Errore nel caricamento degli insegnamenti</div>";
    });
}

// Funzione helper per renderizzare il dropdown degli insegnamenti
function renderInsegnamentiDropdown(insegnamentiPerCds, dropdownElement) {
  // Costruisci HTML per il dropdown
  let dropdownHTML = "";

  // Se non ci sono dati da mostrare
  if (Object.keys(insegnamentiPerCds).length === 0) {
    dropdownHTML = "<div class='dropdown-error'>Nessun insegnamento disponibile</div>";
    dropdownElement.innerHTML = dropdownHTML;
    return;
  }

  // Genera HTML per ogni CdS
  Object.keys(insegnamentiPerCds).forEach((cdsCodice) => {
    const cds = insegnamentiPerCds[cdsCodice];
    
    // Formato del titolo del CdS
    dropdownHTML += `<div class="dropdown-cds-title">${cds.nome} (${cdsCodice})</div>`;

    // Opzioni per gli insegnamenti del CdS
    cds.insegnamenti.forEach((ins) => {
      const isSelected = window.InsegnamentiManager && 
                        window.InsegnamentiManager.isSelected(ins.codice);

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

  dropdownElement.innerHTML = dropdownHTML;
}

// Aggiorna gli eventi del calendario usando la cache ove possibile
export function fetchCalendarEvents(
  calendar,
  planningYear,
  info = null,
  successCallback = null,
  cdsFiltro = null
) {
  getUserData().then(data => {
    if (!data.authenticated || !data.user_data) {
      console.error("Utente non autenticato");
      if (successCallback) successCallback([]);
      return;
    }

    const loggedDocente = data.user_data.username;
    
    // Costruisci parametri base
    const params = new URLSearchParams();
    params.append("docente", loggedDocente);

    // Usa InsegnamentiManager per filtraggi
    if (window.InsegnamentiManager) {
      const selected = window.InsegnamentiManager.getSelectedCodes();
      
      if (selected.length > 0) {
        // Se ci sono insegnamenti selezionati, passa i loro codici
        params.append("insegnamenti", selected.join(","));
      }
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
  });
}

// Carica le date valide direttamente dal backend
export async function loadDateValide(docente, insegnamenti = null) {
  // Costruisce i parametri della richiesta
  const params = new URLSearchParams();

  if (docente) params.append("docente", docente);
  
  if (insegnamenti) {
    params.append("insegnamenti", Array.isArray(insegnamenti) ? insegnamenti.join(",") : insegnamenti);
  }

  try {
    const response = await fetch("/api/getDateValide?" + params.toString());
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Errore durante il caricamento delle date valide:", error);
    return []; // Ritorna un array vuoto in caso di errore
  }
}

// Determina la data iniziale del calendario in base alle date delle sessioni
export function getInitialDate(dateValide) {
  const today = new Date();
  
  // Se non ci sono date valide, usa la data odierna
  if (!dateValide || dateValide.length === 0) {
    return today;
  }

  // Cerca la prima sessione che include la data odierna
  for (const [start, end] of dateValide) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (today >= startDate && today <= endDate) {
      return today;
    }
  }

  // Se non siamo in una sessione, trova la prossima sessione disponibile
  for (const [start] of dateValide) {
    const startDate = new Date(start);
    if (startDate > today) {
      return startDate;
    }
  }

  // Se non ci sono sessioni future, usa la data odierna
  return today;
}

// Funzione per formattare una data nel formato YYYY-MM-DD per gli input di tipo date
export function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Funzione per validare una data selezionata
export function isDateValid(selectedDate, dateValide) {
  const selDate = new Date(selectedDate); // Assicurati che sia un oggetto Date
  selDate.setHours(0, 0, 0, 0); // Normalizza l'ora per il confronto

  let today = new Date(); // Usa la data corrente
  today.setHours(0, 0, 0, 0);

  // Controlla se la data è passata
  if (selDate < today) {
    return {
      isValid: false,
      message: "Non è possibile inserire esami in date passate",
    };
  }

  // Controlla se la data è all'interno di una sessione valida
  const isInSession = dateValide.some(([start, end]) => {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999); // Includi l'intero giorno finale
    return selDate >= startDate && selDate <= endDate;
  });

  if (!isInSession) {
    return {
      isValid: false,
      message: "Non è possibile inserire esami al di fuori delle sessioni o delle pause didattiche",
    };
  }

  // Se tutti i controlli sono superati, la data è valida
  return { isValid: true };
}
