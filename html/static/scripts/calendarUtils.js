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
    dropdown.innerHTML = "<div class='dropdown-error'>Errore durante il caricamento</div>";
  }
}

// Configura il select dell'anno accademico
export async function setupAnnoAccademicoSelect() {
  const select = document.getElementById('annoAccademicoSelect');
  if (!select) return;

  try {
    const response = await fetch('/api/get-anni-accademici');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const anniAccademici = await response.json();

    if (!Array.isArray(anniAccademici) || anniAccademici.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nessun anno disponibile';
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    // Pulisci le opzioni esistenti mantenendo solo quella di default
    select.innerHTML = '<option value="">Seleziona anno...</option>';

    // Determina l'anno corrente accademico (settembre-agosto)
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const isAfterSeptember = currentDate.getMonth() >= 8; // Settembre = 8
    const currentAcademicYear = isAfterSeptember ? currentYear : currentYear - 1;
    
    // Verifica se c'è un anno salvato nei cookie
    let defaultYear = getCookie('selectedAcademicYear');
    
    // Se non c'è nei cookie, usa l'anno corrente se disponibile
    if (!defaultYear) {
      // Controlla se l'anno corrente è disponibile nell'elenco
      if (anniAccademici.includes(currentAcademicYear.toString())) {
        defaultYear = currentAcademicYear.toString();
      } else {
        // Altrimenti usa l'ultimo anno disponibile nell'elenco
        defaultYear = anniAccademici[anniAccademici.length - 1];
      }
    }
    // Verifica che l'anno trovato nei cookie sia effettivamente nell'elenco disponibile
    else if (!anniAccademici.includes(defaultYear)) {
      console.log(`Anno ${defaultYear} trovato nei cookie ma non disponibile nell'elenco`);
      // Usa l'anno corrente o l'ultimo disponibile come fallback
      if (anniAccademici.includes(currentAcademicYear.toString())) {
        defaultYear = currentAcademicYear.toString();
      } else {
        defaultYear = anniAccademici[anniAccademici.length - 1];
      }
    }

    // Aggiungi gli anni accademici
    anniAccademici.forEach(anno => {
      const option = document.createElement('option');
      option.value = anno;
      // Converti anno singolo in formato accademico (es. "2023" -> "2023/2024")
      option.textContent = `${anno}/${parseInt(anno) + 1}`;
      select.appendChild(option);
    });

    // Imposta l'anno di default
    if (defaultYear && anniAccademici.includes(defaultYear)) {
      select.value = defaultYear;
      // Memorizza l'anno selezionato globalmente
      window.selectedAcademicYear = defaultYear;
      
      // Salva nei cookie per 1 anno
      setCookie('selectedAcademicYear', defaultYear, 365);
      
      // Triggera l'evento change per inizializzare tutto con l'anno di default
      setTimeout(() => {
        select.dispatchEvent(new Event('change'));
      }, 100);
    }

    // Aggiungi event listener per gestire la selezione
    select.addEventListener('change', function(e) {
      const selectedYear = e.target.value;
      if (selectedYear) {
        // Memorizza l'anno selezionato globalmente
        window.selectedAcademicYear = selectedYear;
        
        // Salva nei cookie per 1 anno
        setCookie('selectedAcademicYear', selectedYear, 365);
        
        console.log('Anno accademico selezionato:', selectedYear);
        
        // Aggiorna la data iniziale del calendario a dicembre dell'anno selezionato
        const newInitialDate = `${selectedYear}-12-01`;
        if (window.calendar) {
          window.calendar.gotoDate(newInitialDate);
          // Forza il refresh del calendario con il nuovo anno
          window.forceCalendarRefresh();
        }
        
        // Aggiorna gli insegnamenti e le date valide con il nuovo anno
        if (window.InsegnamentiManager && window.currentUsername) {
          window.InsegnamentiManager.loadInsegnamenti(window.currentUsername, { anno: selectedYear });
        }
      }
    });

  } catch (error) {
    console.error('Errore nel caricamento degli anni accademici:', error);
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Errore nel caricamento';
    option.disabled = true;
    select.appendChild(option);
  }
}

// Funzioni per gestire i cookie
function setCookie(name, value, days) {
  const expires = new Date();
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// Funzione per ottenere l'anno selezionato (prima dai cookie, poi dalla variabile globale)
export function getSelectedAcademicYear() {
  return window.selectedAcademicYear || getCookie('selectedAcademicYear') || null;
}

// Funzione globale per impostare l'anno selezionato e salvarlo nei cookie
export function setSelectedAcademicYear(year) {
  window.selectedAcademicYear = year;
  setCookie('selectedAcademicYear', year, 365);
}

// Funzione per inizializzare l'anno selezionato dai cookie all'avvio
export function initSelectedAcademicYear() {
  const savedYear = getCookie('selectedAcademicYear');
  if (savedYear) {
    window.selectedAcademicYear = savedYear;
    
    // Imposta anche il valore nella select se l'elemento esiste
    const select = document.getElementById('annoAccademicoSelect');
    if (select) {
      // Aspetta un momento per assicurarsi che le opzioni della select siano caricate
      setTimeout(() => {
        // Troviamo l'opzione corrispondente e la selezioniamo
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].value === savedYear) {
            select.selectedIndex = i;
            break;
          }
        }
      }, 50);
    }
  }
  return savedYear;
}

// Crea un evento provvisorio nel calendario
export function creaEventoProvvisorio(date, calendar, provisionalEvents, sectionNumber = null) {
  if (!calendar || !date) {
    return null;
  }

  // Controlla se esiste già un evento provvisorio per questa data
  const existingEvent = provisionalEvents.find(event => 
    event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
  );
  
  if (existingEvent) {
    return existingEvent;
  }

  // Genera un ID unico per l'evento
  const provisionalEventId = `provisional_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Crea l'oggetto evento con valori di default
  const provisionalEvent = {
    id: provisionalEventId,
    start: date,
    allDay: true,
    backgroundColor: '#77DD77',
    borderColor: '#77DD77',
    textColor: '#000',
    title: 'Nuovo esame',
    extendedProps: {
      isProvisional: true,
      formSectionDate: date,
      sectionNumber: sectionNumber,
      aula: ''
    }
  };

  // Aggiungi l'evento al calendario
  const calendarEvent = calendar.addEvent(provisionalEvent);
  
  if (calendarEvent) {
    // Aggiungi alla lista degli eventi provvisori
    provisionalEvents.push(provisionalEvent);
    
    return provisionalEvent;
  } else {
    return null;
  }
}

// Aggiorna l'aula di un evento provvisorio esistente
export function aggiornaAulaEventoProvvisorio(date, aula, calendar, provisionalEvents) {
  if (!calendar || !date) {
    return false;
  }

  // Trova l'evento provvisorio per questa data
  const provisionalEvent = provisionalEvents.find(event => 
    event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
  );

  if (!provisionalEvent) {
    return false;
  }

  // Ottieni l'evento dal calendario
  const calendarEvent = calendar.getEventById(provisionalEvent.id);
  if (!calendarEvent) {
    return false;
  }

  // Aggiorna l'aula nell'evento del calendario
  calendarEvent.setExtendedProp('aula', aula || '');
  
  // Aggiorna anche l'oggetto nell'array provisionalEvents
  provisionalEvent.extendedProps.aula = aula || '';

  return true;
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

// Esporta le funzioni nel namespace globale per compatibilità
if (typeof window !== 'undefined') {
  window.formatDateForInput = formatDateForInput;
  window.isDateValid = isDateValid;
  window.creaEventoProvvisorio = creaEventoProvvisorio;
  window.aggiornaAulaEventoProvvisorio = aggiornaAulaEventoProvvisorio;
  window.scrollToPrimaDataValida = scrollToPrimaDataValida;
  window.getSelectedAcademicYear = getSelectedAcademicYear;
  window.setSelectedAcademicYear = setSelectedAcademicYear;
  window.initSelectedAcademicYear = initSelectedAcademicYear;
}
