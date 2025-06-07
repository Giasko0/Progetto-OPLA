// Crea un dropdown unificato per sessioni, insegnamenti o anni accademici
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

  // Aggiungi l'anno accademico selezionato
  if (window.selectedAcademicYear) {
    params.append("anno", window.selectedAcademicYear);
  }

  try {
    const response = await fetch("/api/get-date-valide?" + params.toString());
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
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
export function setupDropdownClickListeners(calendar, dropdowns, currentUsername, updateDateValideCallback) {
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
                    // Trova l'elemento del mese target nel DOM e scrolla verso di esso
                    const targetDateObj = new Date(targetDate);
                    const targetMonth = targetDateObj.getMonth() + 1; // 1-based
                    const targetYear = targetDateObj.getFullYear();
                    
                    // Cerca l'elemento del mese nel calendario
                    setTimeout(() => {
                        const monthElements = document.querySelectorAll('[data-date*="' + targetYear + '-' + String(targetMonth).padStart(2, '0') + '"], .fc-multimonth-month[data-date*="' + targetYear + '-' + String(targetMonth).padStart(2, '0') + '"]');
                        if (monthElements.length > 0) {
                            monthElements[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else {
                            // Fallback: cerca qualsiasi elemento che contenga l'anno target
                            const yearElements = document.querySelectorAll(`[data-date*="${targetYear}"]`);
                            if (yearElements.length > 0) {
                                yearElements[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }
                    }, 100);
                    
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
            buttonClasses.contains('fc-pulsanteSessioni-button')) {
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
  
  if (closeButton) {
    closeButton.addEventListener("click", function () {
      // Gestisci la chiusura del form
      const formContainer = document.getElementById("form-container");
      if (formContainer) {
        formContainer.innerHTML = "";
        formContainer.style.display = "none";
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
  // if (selDate < today) {
  //   return {
  //     isValid: false,
  //     message: "Non è possibile inserire esami in date passate.",
  //   };
  // }

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

// Scrolla alla prima data valida disponibile
export function scrollToPrimaDataValida(dateValide) {
  if (!Array.isArray(dateValide) || dateValide.length === 0) {
    return;
  }

  // Trova la prima data valida
  let primaDataValida = null;
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  for (const [start, end, nome] of dateValide) {
    const dataInizio = new Date(start);
    dataInizio.setHours(0, 0, 0, 0);
    
    // Se la data di inizio è oggi o nel futuro
    if (dataInizio >= oggi) {
      primaDataValida = dataInizio;
      break;
    }
    
    // Se siamo dentro una sessione attiva
    const dataFine = new Date(end);
    dataFine.setHours(23, 59, 59, 999);
    if (oggi >= dataInizio && oggi <= dataFine) {
      primaDataValida = oggi;
      break;
    }
  }

  if (!primaDataValida) {
    return;
  }

  // Cerca di scrollare alla data nel calendario
  const targetYear = primaDataValida.getFullYear();
  const targetMonth = primaDataValida.getMonth() + 1; // 1-based
  const targetDay = primaDataValida.getDate();

  // Prova diversi selettori per trovare l'elemento della data
  const possibleSelectors = [
    // Selezione per giorno specifico
    `[data-date="${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}"]`,
    // Selezione per mese
    `[data-date*="${targetYear}-${String(targetMonth).padStart(2, '0')}"]`,
    // Selezione per mese multimonth
    `.fc-multimonth-month[data-date*="${targetYear}-${String(targetMonth).padStart(2, '0')}"]`,
    // Selezione per anno
    `[data-date*="${targetYear}"]`
  ];

  let elementToScroll = null;
  
  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      elementToScroll = elements[0];
      break;
    }
  }

  if (elementToScroll) {
    elementToScroll.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start',
      inline: 'nearest'
    });
  }
}

// Esporta le funzioni del calendario
if (typeof window !== 'undefined') {
  window.formatDateForInput = formatDateForInput;
  window.isDateValid = isDateValid;
  window.scrollToPrimaDataValida = scrollToPrimaDataValida;
}
