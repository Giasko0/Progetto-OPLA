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
  cdsFiltro = null,
  preloadedInsegnamenti = null
) {
  // Utilizziamo InsegnamentiManager se disponibile
  if (window.InsegnamentiManager) {
    const options = {};
    if (cdsFiltro) options.cds = cdsFiltro;

    const loadAndRender = (managerOptions) => {
      window.InsegnamentiManager.loadInsegnamenti(docente, managerOptions, (insegnamenti) => {
        // Organizza gli insegnamenti per CdS
        const insegnamentiPerCds = {};
        (insegnamenti || []).forEach((ins) => {
          const cdsKey = ins.cds_codice || 'altro';
          const cdsNome = ins.cds_nome || 'Altro';
          if (!insegnamentiPerCds[cdsKey]) {
            insegnamentiPerCds[cdsKey] = { nome: cdsNome, insegnamenti: [] };
          }
          // Aggiungi solo se non già presente (potrebbe esserci duplicazione se non filtrato per anno)
          if (!insegnamentiPerCds[cdsKey].insegnamenti.some(i => i.codice === ins.codice)) {
             insegnamentiPerCds[cdsKey].insegnamenti.push(ins);
          }
        });
        renderInsegnamentiDropdown(insegnamentiPerCds, dropdownInsegnamenti);
      });
    };

    // Se abbiamo già dati precaricati (dal caricamento iniziale), li utilizziamo
    if (preloadedInsegnamenti) {
      let insegnamentiPerCds = {};
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
      } else if (Array.isArray(preloadedInsegnamenti)) { // Formato piatto
         preloadedInsegnamenti.forEach((ins) => {
           const cdsKey = ins.cds_codice || 'altro';
           const cdsNome = ins.cds_nome || 'Altro';
           if (!insegnamentiPerCds[cdsKey]) {
             insegnamentiPerCds[cdsKey] = { nome: cdsNome, insegnamenti: [] };
           }
           if (!insegnamentiPerCds[cdsKey].insegnamenti.some(i => i.codice === ins.codice)) {
              insegnamentiPerCds[cdsKey].insegnamenti.push(ins);
           }
         });
      }
      renderInsegnamentiDropdown(insegnamentiPerCds, dropdownInsegnamenti);
    }
    // Altrimenti usiamo InsegnamentiManager per caricare i dati
    else {
       loadAndRender(options);
    }
    return;
  }

  // Fallback se InsegnamentiManager non è disponibile (raro)
  // ... (codice fallback omesso per brevità, dato che InsegnamentiManager è centrale) ...
   console.warn("InsegnamentiManager non disponibile, caricamento insegnamenti fallback.");
   dropdownInsegnamenti.innerHTML = "<div class='dropdown-error'>Errore: InsegnamentiManager non trovato</div>";
}

// Funzione helper per renderizzare il dropdown degli insegnamenti
function renderInsegnamentiDropdown(insegnamentiPerCds, dropdownElement) {
  let dropdownHTML = "";

  if (Object.keys(insegnamentiPerCds).length === 0) {
    dropdownHTML = "<div class='dropdown-error'>Nessun insegnamento disponibile</div>";
    dropdownElement.innerHTML = dropdownHTML;
    return;
  }

  // Ordina i CdS per codice (o nome)
  const sortedCdsKeys = Object.keys(insegnamentiPerCds).sort((a, b) => {
      const cdsA = insegnamentiPerCds[a];
      const cdsB = insegnamentiPerCds[b];
      // Puoi ordinare per nome: return cdsA.nome.localeCompare(cdsB.nome);
      // O per codice:
      return a.localeCompare(b);
  });


  sortedCdsKeys.forEach((cdsCodice) => {
    const cds = insegnamentiPerCds[cdsCodice];
    if (!cds || !cds.insegnamenti || cds.insegnamenti.length === 0) return; // Salta CdS vuoti

    dropdownHTML += `<div class="dropdown-cds-title">${cds.nome} (${cdsCodice})</div>`;

    // Ordina insegnamenti per titolo
    const sortedInsegnamenti = cds.insegnamenti.sort((a, b) => a.titolo.localeCompare(b.titolo));

    sortedInsegnamenti.forEach((ins) => {
      const isSelected = window.InsegnamentiManager &&
                        window.InsegnamentiManager.isSelected(ins.codice);

      // Assicurati che tutti i data attribute necessari siano presenti
      dropdownHTML += `
        <div class="dropdown-item dropdown-item-indented" data-codice="${ins.codice}"
             data-semestre="${ins.semestre || ""}" data-anno-corso="${ins.anno_corso || ""}"
             data-cds="${cdsCodice || ''}">
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

// Carica le date valide direttamente dal backend
export async function loadDateValide(docente, insegnamenti = null) {
  const params = new URLSearchParams();
  if (docente) params.append("docente", docente);

  // Passa gli insegnamenti selezionati se presenti
  const selectedInsegnamenti = Array.isArray(insegnamenti) ? insegnamenti : (window.InsegnamentiManager?.getSelectedCodes() || []);
  if (selectedInsegnamenti.length > 0) {
    params.append("insegnamenti", selectedInsegnamenti.join(","));
  }

  try {
    const response = await fetch("/api/getDateValide?" + params.toString());
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    // Assicurati che restituisca un array, anche vuoto
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Errore durante il caricamento delle date valide:", error);
    return []; // Ritorna un array vuoto in caso di errore
  }
}

// Aggiorna il dropdown delle sessioni
export function updateSessioniDropdown(dropdown, dates) {
  if (!dropdown) return;
  dropdown.innerHTML = ""; // Pulisci
  if (!Array.isArray(dates) || dates.length === 0) {
      dropdown.innerHTML = "<div class='dropdown-error'>Nessuna sessione definita</div>";
      return;
  }
  // Aggiungi le voci di menu per ogni tipo di sessione
  for (const [start, end, nome] of dates) {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    item.dataset.data = start; // Usa la data di inizio per navigare
    item.dataset.end = end; // Aggiungi data di fine
    item.textContent = nome;
    dropdown.appendChild(item);
  }
}

// Funzione unificata per gestire i click sui pulsanti dei dropdown
export function handleDropdownButtonClick(e, type, calendar, dropdowns, populateCallback = null) {
  const button = e.currentTarget;
  const dropdown = dropdowns[type];
  if (!dropdown) return;

  // Posiziona il dropdown relativo al pulsante
  const rect = button.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY}px`; // Considera lo scroll
  dropdown.style.left = `${rect.left + window.scrollX}px`;

  // Chiudi *altri* dropdown aperti
  Object.entries(dropdowns).forEach(([key, value]) => {
    if (key !== type && value && value.classList.contains("show")) {
      value.classList.remove("show");
    }
  });

  // Popola se necessario (es. Anno Accademico)
  if (populateCallback) {
    populateCallback();
  }

  // Toggle della visibilità del dropdown corrente
  dropdown.classList.toggle("show");
}

// Aggiunge listener per i click *dentro* i dropdown
export function setupDropdownClickListeners(calendar, dropdowns, currentUsername, // Rimosse dipendenze non più necessarie qui
                                            updateDateValideCallback, // Callback per aggiornare dateValide in calendar.js
                                            dateRange) { // Aggiunto dateRange
    // Dropdown insegnamenti - Gestito principalmente da InsegnamentiManager.onChange in calendar.js
    if (dropdowns.insegnamenti) {
        dropdowns.insegnamenti.addEventListener("click", (e) => {
            const item = e.target.closest(".dropdown-item, .dropdown-item-indented");
            if (!item) return;
            const checkbox = item.querySelector('input[type="checkbox"]');
            if (!checkbox) return;

            // Se il click non è sul checkbox, inverti lo stato
            if (e.target.type !== "checkbox") {
                e.preventDefault();
                checkbox.checked = !checkbox.checked;
                // Simula evento change per coerenza
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Aggiorna InsegnamentiManager (l'evento 'change' lo farà già)
            if (window.InsegnamentiManager) {
                const codice = item.dataset.codice;
                const semestre = parseInt(item.dataset.semestre) || null;
                const annoCorso = parseInt(item.dataset.annoCorso) || null;
                const cds = item.dataset.cds || "";

                // Sincronizza stato manager (necessario se il change non è stato triggerato)
                if (e.target.type !== "checkbox") {
                   if (checkbox.checked) {
                       window.InsegnamentiManager.selectInsegnamento(codice, { semestre, anno_corso: annoCorso, cds });
                   } else {
                       window.InsegnamentiManager.deselectInsegnamento(codice);
                   }
                }
                // L'aggiornamento delle date valide e del calendario verrà gestito
                // dall'handler InsegnamentiManager.onChange in calendar.js
            }
        });
    }

    // Dropdown sessioni
    if (dropdowns.sessioni) {
        dropdowns.sessioni.addEventListener("click", (e) => {
            const item = e.target.closest(".dropdown-item");
            if (item) {
                const startDateString = item.dataset.data;
                const endDateString = item.dataset.end; // Recupera data fine sessione
                if (startDateString && calendar && dateRange && dateRange.end) {
                    try {
                        const startDateSession = new Date(startDateString);
                        const endDateRange = new Date(dateRange.end);

                        // Calcola la durata in mesi tra inizio sessione e fine range
                        // +1 per includere sia il mese di inizio che quello di fine
                        let durationMonths = (endDateRange.getFullYear() - startDateSession.getFullYear()) * 12 +
                                             endDateRange.getMonth() - startDateSession.getMonth() + 1;
                        durationMonths = Math.max(1, durationMonths); // Assicura almeno 1 mese

                        // Aggiorna la durata del calendario
                        calendar.setOption('duration', { months: durationMonths });

                        // Naviga alla data di inizio sessione
                        calendar.gotoDate(startDateString);

                        // Chiudi il dropdown
                        dropdowns.sessioni.classList.remove("show");
                    } catch (error) {
                        console.error("Errore nel calcolo della durata o navigazione:", error);
                        // Fallback: comportamento originale se c'è un errore
                        calendar.gotoDate(startDateString);
                        dropdowns.sessioni.classList.remove("show");
                    }
                } else if (startDateString && calendar) {
                    // Fallback se dateRange non è disponibile
                    console.warn("dateRange non disponibile per calcolo durata dinamica.");
                    calendar.gotoDate(startDateString);
                    dropdowns.sessioni.classList.remove("show");
                }
            }
        });
    }
}

// Listener per chiudere i dropdown cliccando fuori
export function setupGlobalClickListeners(dropdowns) {
  document.addEventListener("click", (e) => {
    // Se il click è su un pulsante che apre un dropdown, non fare nulla qui
    if (e.target.closest('.fc-button')) {
        const buttonClasses = e.target.closest('.fc-button').classList;
        if (buttonClasses.contains('fc-pulsanteInsegnamenti-button') ||
            buttonClasses.contains('fc-pulsanteSessioni-button') ||
            buttonClasses.contains('fc-pulsanteAnno-button')) {
            return;
        }
    }

    // Altrimenti, chiudi tutti i dropdown se il click è fuori da essi
    Object.values(dropdowns).forEach(dropdown => {
        if (dropdown && dropdown.classList.contains('show') && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
  });
}

// Gestione chiusura form esami
export function setupCloseHandlers(calendar) {
  const closeButton = document.getElementById("closeOverlay");
  const popupOverlay = document.getElementById("popupOverlay");

  if (closeButton) {
    closeButton.addEventListener("click", function () {
      if (popupOverlay) popupOverlay.style.display = "none";
      // refreshCalendarOnClose(); // Decidi se fare refresh alla chiusura manuale
    });
  }

  if (popupOverlay) {
    popupOverlay.addEventListener("click", function (event) {
      // Chiudi solo se si clicca sullo sfondo (overlay stesso)
      if (event.target === popupOverlay) {
        popupOverlay.style.display = "none";
        // refreshCalendarOnClose();
      }
    });
  }
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
