// Crea un dropdown unificato per sessioni, insegnamenti o anni accademici
export function createDropdown(type) {
  const dropdown = document.createElement("div");
  dropdown.className = "calendar-dropdown";
  if (type === "sessioni") dropdown.id = "sessioniDropdown";
  if (type === "insegnamenti") dropdown.id = "insegnamentiDropdown";
  if (type === "annoAccademico") dropdown.id = "annoAccademicoDropdown";
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
  // Funzione helper privata per renderizzare il dropdown degli insegnamenti
  function renderInsegnamentiDropdown(insegnamentiPerCds, dropdownElement) {
    let dropdownHTML = "";

    if (Object.keys(insegnamentiPerCds).length === 0) {
      dropdownHTML = "<div class='dropdown-error'>Nessun insegnamento disponibile</div>";
      dropdownElement.innerHTML = dropdownHTML;
      return;
    }

    // Ordina i CdS per codice
    const sortedCdsKeys = Object.keys(insegnamentiPerCds).sort((a, b) => a.localeCompare(b));

    sortedCdsKeys.forEach((cdsCodice) => {
      const cds = insegnamentiPerCds[cdsCodice];
      if (!cds || !cds.insegnamenti || cds.insegnamenti.length === 0) return;

      dropdownHTML += `<div class="dropdown-cds-title">${cds.nome} (${cdsCodice})</div>`;

      // Ordina insegnamenti per titolo
      const sortedInsegnamenti = cds.insegnamenti.sort((a, b) => a.titolo.localeCompare(b.titolo));

      sortedInsegnamenti.forEach((ins) => {
        const isSelected = window.InsegnamentiManager &&
                          window.InsegnamentiManager.isSelected(ins.codice);

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
          // Aggiungi solo se non già presente
          if (!insegnamentiPerCds[cdsKey].insegnamenti.some(i => i.codice === ins.codice)) {
             insegnamentiPerCds[cdsKey].insegnamenti.push(ins);
          }
        });
        renderInsegnamentiDropdown(insegnamentiPerCds, dropdownInsegnamenti);
      });
    };

    // Se abbiamo già dati precaricati, li utilizziamo
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
      } else if (Array.isArray(preloadedInsegnamenti)) {
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
    } else {
       loadAndRender(options);
    }
    return;
  }

  // Fallback se InsegnamentiManager non è disponibile
  console.warn("InsegnamentiManager non disponibile, caricamento insegnamenti fallback.");
  dropdownInsegnamenti.innerHTML = "<div class='dropdown-error'>Errore: InsegnamentiManager non trovato</div>";
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
    const response = await fetch("/api/get-date-valide?" + params.toString());
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Errore durante il caricamento delle date valide:", error);
    return [];
  }
}

// Aggiorna il dropdown delle sessioni
export function updateSessioniDropdown(dropdown, dates) {
  if (!dropdown) return;
  dropdown.innerHTML = "";
  
  if (!Array.isArray(dates) || dates.length === 0) {
      dropdown.innerHTML = "<div class='dropdown-error'>Nessuna sessione definita</div>";
      return;
  }
  
  // Aggiungi le voci di menu per ogni tipo di sessione
  for (const [start, end, nome] of dates) {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    item.dataset.data = start;
    item.dataset.end = end;
    item.textContent = nome;
    dropdown.appendChild(item);
  }
}

// Funzione unificata per gestire i click sui pulsanti dei dropdown
export function handleDropdownButtonClick(e, type, calendar, dropdowns, populateCallback = null) {
  const button = e.currentTarget;
  const dropdown = dropdowns[type];
  if (!dropdown) return;

  // Se il dropdown è già aperto, chiudilo
  if (dropdown.classList.contains("show")) {
    dropdown.classList.remove("show");
    dropdown.style.display = "none";
    return;
  }

  // Posiziona il dropdown relativo al pulsante
  const rect = button.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;

  // Chiudi altri dropdown aperti
  Object.entries(dropdowns).forEach(([key, value]) => {
    if (key !== type && value && value.classList.contains("show")) {
      value.classList.remove("show");
      value.style.display = "none";
    }
  });

  // Popola se necessario
  if (populateCallback) {
    populateCallback();
  }

  // Mostra il dropdown
  dropdown.classList.add("show");
  dropdown.style.display = "block";
}

// Aggiunge listener per i click dentro i dropdown
export function setupDropdownClickListeners(calendar, dropdowns, currentUsername, updateDateValideCallback, dateRange) {
    // Dropdown insegnamenti
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
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Aggiorna InsegnamentiManager
            if (window.InsegnamentiManager) {
                const codice = item.dataset.codice;
                const semestre = parseInt(item.dataset.semestre) || null;
                const annoCorso = parseInt(item.dataset.annoCorso) || null;
                const cds = item.dataset.cds || "";

                // Sincronizza stato manager se necessario
                if (e.target.type !== "checkbox") {
                   if (checkbox.checked) {
                       window.InsegnamentiManager.selectInsegnamento(codice, { semestre, anno_corso: annoCorso, cds });
                   } else {
                       window.InsegnamentiManager.deselectInsegnamento(codice);
                   }
                }
            }
        });
    }

    // Dropdown sessioni
    if (dropdowns.sessioni) {
        dropdowns.sessioni.addEventListener("click", (e) => {
            const item = e.target.closest(".dropdown-item");
            if (item) {
                const targetDate = item.dataset.data;
                if (targetDate && calendar) {
                    calendar.gotoDate(targetDate);
                    dropdowns.sessioni.classList.remove('show');
                    dropdowns.sessioni.style.display = 'none';
                }
            }
        });
    }
}

// Listener per chiudere i dropdown cliccando fuori
export function setupGlobalClickListeners(dropdowns) {
  document.addEventListener("click", (e) => {
    // Se il click è su un pulsante che apre un dropdown, non fare nulla
    if (e.target.closest('.fc-button')) {
        const buttonClasses = e.target.closest('.fc-button').classList;
        if (buttonClasses.contains('fc-pulsanteInsegnamenti-button') ||
            buttonClasses.contains('fc-pulsanteSessioni-button') ||
            buttonClasses.contains('fc-pulsanteAnnoAccademico-button')) {
            return;
        }
    }

    // Chiudi tutti i dropdown se il click è fuori da essi
    Object.values(dropdowns).forEach(dropdown => {
        if (dropdown && dropdown.classList.contains('show') && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
            dropdown.style.display = 'none';
        }
    });
  });

  // Listener per chiudere dropdown con il tasto Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      Object.values(dropdowns).forEach(dropdown => {
        if (dropdown && dropdown.classList.contains('show')) {
          dropdown.classList.remove('show');
          dropdown.style.display = 'none';
        }
      });
    }
  });
}

// Gestione chiusura form esami
export function setupCloseHandlers(calendar) {
  const closeButton = document.getElementById("closeOverlay");
  const popupOverlay = document.getElementById("popupOverlay");

  if (closeButton) {
    closeButton.addEventListener("click", function () {
      if (popupOverlay) popupOverlay.style.display = "none";
    });
  }

  if (popupOverlay) {
    popupOverlay.addEventListener("click", function (event) {
      if (event.target === popupOverlay) {
        popupOverlay.style.display = "none";
      }
    });
  }
}

// Formatta una data nel formato YYYY-MM-DD per input HTML
export function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Valida una data selezionata
export function isDateValid(selectedDate, dateValide, provisionalDates = []) {
  const selDate = new Date(selectedDate);
  selDate.setHours(0, 0, 0, 0);

  let today = new Date();
  today.setHours(0, 0, 0, 0);

  // Controlla se la data è passata
  if (selDate < today) {
    return {
      isValid: false,
      message: "Non è possibile inserire esami in date passate.",
    };
  }

  // Controlla se c'è già un evento provvisorio nello stesso giorno
  if (provisionalDates && provisionalDates.length > 0) {
    const sameDayEvent = provisionalDates.some(provDateStr => {
      const provDate = new Date(provDateStr);
      provDate.setHours(0, 0, 0, 0);
      return selDate.getTime() === provDate.getTime();
    });

    if (sameDayEvent) {
      return {
        isValid: false,
        message: "Non è possibile inserire due esami nello stesso giorno.",
        isSameDayConflict: true
      };
    }

    // Controlla vincolo dei 14 giorni con altri eventi provvisori
    const days = 13;
    for (const provDateStr of provisionalDates) {
      const provDate = new Date(provDateStr);
      provDate.setHours(0, 0, 0, 0);
      const diffDays = Math.abs(selDate - provDate) / (1000 * 60 * 60 * 24);
      if (diffDays <= days && selDate.getTime() !== provDate.getTime()) {
        return {
          isValid: false,
          message: "Non è possibile inserire esami a meno di 14 giorni di distanza.",
          isProvisionalConflict: true
        };
      }
    }
  }

  // Controlla se la data è in una sessione valida
  const isInSession = dateValide.some(([start, end]) => {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    return selDate >= startDate && selDate <= endDate;
  });

  if (!isInSession) {
    return {
      isValid: false,
      message: "Non è possibile inserire esami al di fuori delle sessioni previste.",
    };
  }

  return { isValid: true };
}

// Popola il dropdown degli anni accademici
export async function populateAnnoAccademicoDropdown(dropdown) {
  try {
    const response = await fetch('/api/get-anni-accademici');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const anniAccademici = await response.json();

    if (!Array.isArray(anniAccademici) || anniAccademici.length === 0) {
      dropdown.innerHTML = "<div class='dropdown-error'>Nessun anno accademico disponibile</div>";
      return;
    }

    dropdown.innerHTML = '';
    anniAccademici.forEach(anno => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      // Converti anno singolo in formato accademico (es. "2023" -> "2023/2024")
      const annoAccademico = `${anno}/${parseInt(anno) + 1}`;
      item.textContent = annoAccademico;
      item.dataset.anno = anno;
      item.addEventListener('click', () => {
        dropdown.classList.remove('show');
      });
      dropdown.appendChild(item);
    });
  } catch (error) {
    console.error("Errore durante il caricamento degli anni accademici:", error);
    dropdown.innerHTML = "<div class='dropdown-error'>Errore durante il caricamento</div>";
  }
}

// Crea un evento provvisorio nel calendario
export function creaEventoProvvisorio(date, calendar, provisionalEvents, options = {}) {
  if (!calendar || !date) {
    console.warn('Calendario o data non validi per la creazione dell\'evento provvisorio');
    return null;
  }

  // Controlla se esiste già un evento provvisorio per questa data
  const existingEvent = provisionalEvents.find(event => 
    event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
  );
  
  if (existingEvent) {
    console.log('Evento provvisorio già esistente per la data:', date);
    return existingEvent;
  }

  // Genera un ID unico per l'evento
  const provisionalEventId = `provisional_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Crea l'oggetto evento con valori di default
  const provisionalEvent = {
    id: provisionalEventId,
    start: date,
    allDay: true,
    backgroundColor: options.backgroundColor || '#77DD77',
    borderColor: options.borderColor || '#77DD77',
    textColor: options.textColor || '#000',
    title: options.title || 'Nuovo esame',
    extendedProps: {
      isProvisional: true,
      formSectionDate: date,
      aula: options.aula || '',
      ...options.extendedProps
    }
  };

  // Aggiungi l'evento al calendario
  const calendarEvent = calendar.addEvent(provisionalEvent);
  
  if (calendarEvent) {
    // Aggiungi alla lista degli eventi provvisori
    provisionalEvents.push(provisionalEvent);
    
    console.log('Evento provvisorio creato per la data:', date);
    return provisionalEvent;
  } else {
    console.error('Errore nella creazione dell\'evento provvisorio per la data:', date);
    return null;
  }
}

// Aggiorna l'aula di un evento provvisorio esistente
export function aggiornaAulaEventoProvvisorio(date, aula, calendar, provisionalEvents) {
  if (!calendar || !date) {
    console.warn('Calendario o data non validi per l\'aggiornamento dell\'aula');
    return false;
  }

  // Trova l'evento provvisorio per questa data
  const provisionalEvent = provisionalEvents.find(event => 
    event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
  );

  if (!provisionalEvent) {
    console.warn('Nessun evento provvisorio trovato per la data:', date);
    return false;
  }

  // Ottieni l'evento dal calendario
  const calendarEvent = calendar.getEventById(provisionalEvent.id);
  if (!calendarEvent) {
    console.warn('Evento del calendario non trovato per ID:', provisionalEvent.id);
    return false;
  }

  // Aggiorna l'aula nell'evento del calendario
  calendarEvent.setExtendedProp('aula', aula || '');
  
  // Aggiorna anche l'oggetto nell'array provisionalEvents
  provisionalEvent.extendedProps.aula = aula || '';

  console.log(`Aula aggiornata per evento provvisorio del ${date}: ${aula || 'rimossa'}`);
  return true;
}
