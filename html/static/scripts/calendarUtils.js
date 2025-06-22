// Crea un dropdown unificato per sessioni, insegnamenti o anni accademici
export function createDropdown(type) {
  const dropdown = document.createElement("div");
  dropdown.className = "calendar-dropdown calendar-dropdown-mobile";
  dropdown.id = `${type}Dropdown`;
  document.body.appendChild(dropdown);
  return dropdown;
}

// Popola il dropdown degli insegnamenti utilizzando la cache
export function populateInsegnamentiDropdown(
  dropdownInsegnamenti,
  docente,
  cdsFiltro = null,
  preloadedInsegnamenti = null
) {
  // Funzione helper per organizzare insegnamenti per CdS
  function organizeInsegnamentiPerCds(insegnamenti) {
    const insegnamentiPerCds = {};
    (insegnamenti || []).forEach((ins) => {
      const cdsKey = ins.cds_codice || 'altro';
      const cdsNome = ins.cds_nome || 'Altro';
      
      if (!insegnamentiPerCds[cdsKey]) {
        insegnamentiPerCds[cdsKey] = { nome: cdsNome, insegnamenti: [] };
      }
      
      // Evita duplicati
      if (!insegnamentiPerCds[cdsKey].insegnamenti.some(i => i.codice === ins.codice)) {
        insegnamentiPerCds[cdsKey].insegnamenti.push(ins);
      }
    });
    return insegnamentiPerCds;
  }

  // Funzione helper per renderizzare il dropdown degli insegnamenti (ottimizzata)
  function renderInsegnamentiDropdown(insegnamentiPerCds, dropdownElement) {
    if (Object.keys(insegnamentiPerCds).length === 0) {
      dropdownElement.innerHTML = "<div class='dropdown-error'>Nessun insegnamento disponibile</div>";
      return;
    }

    const sortedCdsKeys = Object.keys(insegnamentiPerCds).sort();
    let dropdownHTML = "";

    sortedCdsKeys.forEach((cdsCodice) => {
      const cds = insegnamentiPerCds[cdsCodice];
      if (!cds?.insegnamenti?.length) return;

      dropdownHTML += `<div class="dropdown-cds-title">${cds.nome} (${cdsCodice})</div>`;

      // Ordina insegnamenti per titolo
      cds.insegnamenti.sort((a, b) => a.titolo.localeCompare(b.titolo)).forEach((ins) => {
        const isSelected = window.InsegnamentiManager?.isSelected(ins.codice) || false;
        dropdownHTML += `
          <div class="dropdown-item dropdown-item-indented" data-codice="${ins.codice}"
               data-semestre="${ins.semestre || ""}" data-anno-corso="${ins.anno_corso || ""}"
               data-cds="${cdsCodice || ''}">
            <input type="checkbox" id="ins-${ins.codice}" value="${ins.codice}" ${isSelected ? "checked" : ""}>
            <label for="ins-${ins.codice}">${ins.titolo}</label>
          </div>`;
      });
    });

    dropdownElement.innerHTML = dropdownHTML;
  }

  // Utilizziamo InsegnamentiManager se disponibile
  if (window.InsegnamentiManager) {
    const options = cdsFiltro ? { cds: cdsFiltro } : {};

    const processInsegnamenti = (insegnamenti) => {
      const insegnamentiPerCds = organizeInsegnamentiPerCds(insegnamenti);
      renderInsegnamentiDropdown(insegnamentiPerCds, dropdownInsegnamenti);
    };

    if (preloadedInsegnamenti) {
      let insegnamenti = [];
      
      if (preloadedInsegnamenti.cds && Array.isArray(preloadedInsegnamenti.cds)) {
        preloadedInsegnamenti.cds.forEach(cds => {
          if (cds?.codice && cds?.insegnamenti) {
            const mappedInsegnamenti = (cds.insegnamenti || []).map(ins => ({
              ...ins,
              cds_codice: cds.codice,
              cds_nome: cds.nome || cds.nome_corso || "Sconosciuto"
            }));
            insegnamenti.push(...mappedInsegnamenti);
          }
        });
      } else if (Array.isArray(preloadedInsegnamenti)) {
        insegnamenti = preloadedInsegnamenti;
      }
      
      processInsegnamenti(insegnamenti);
    } else {
      window.InsegnamentiManager.loadInsegnamenti(docente, options, processInsegnamenti);
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
  const selectedInsegnamenti = Array.isArray(insegnamenti) ? insegnamenti : (window.InsegnamentiManager?.getSelectedInsegnamenti() || []);
  if (selectedInsegnamenti.length > 0) {
    params.append("insegnamenti", selectedInsegnamenti.join(","));
  }

  // Aggiungi l'anno accademico selezionato usando AnnoAccademicoManager
  const selectedYear = window.AnnoAccademicoManager?.getSelectedAcademicYear();
  if (!selectedYear) {
    console.warn("Anno accademico non ancora disponibile, date valide non caricate");
    return [];
  }
  
  params.append("anno", selectedYear);

  try {
    const response = await fetch("/api/get-date-valide?" + params.toString());
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    const dateValide = Array.isArray(data) ? data : [];
    
    // Unifica le sessioni divise per la visualizzazione nel frontend
    const { sessioni, partiOriginali } = unificaSessioniDivise(dateValide);
    
    // Conserva le parti originali per la validazione
    window.sessioniPartiOriginali = partiOriginali;
    
    return sessioni;
  } catch (error) {
    return [];
  }
}

// Aggiorna il dropdown delle sessioni (semplificata)
export function updateSessioniDropdown(dropdown, dates) {
  if (!dropdown) return;
  
  if (!Array.isArray(dates) || dates.length === 0) {
    dropdown.innerHTML = "<div class='dropdown-error'>Nessuna sessione definita</div>";
    return;
  }
  
  const fragment = document.createDocumentFragment();
  dates.forEach(([start, end, nome]) => {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    item.dataset.data = start;
    item.dataset.end = end;
    item.textContent = nome;
    fragment.appendChild(item);
  });
  
  dropdown.innerHTML = "";
  dropdown.appendChild(fragment);
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

// Aggiunge listener per i click dentro i dropdown (ottimizzata)
export function setupDropdownClickListeners(calendar, dropdowns, currentUsername, updateDateValideCallback) {
  // Dropdown insegnamenti
  dropdowns.insegnamenti?.addEventListener("click", (e) => {
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

    // Aggiorna InsegnamentiManager se disponibile
    if (window.InsegnamentiManager && e.target.type !== "checkbox") {
      const { codice, semestre, annoCorso, cds } = item.dataset;
      const semestreParsed = parseInt(semestre) || null;
      const annoCorsoParsed = parseInt(annoCorso) || null;

      if (checkbox.checked) {
        window.InsegnamentiManager.selectInsegnamento(codice, { 
          semestre: semestreParsed, 
          anno_corso: annoCorsoParsed, 
          cds 
        });
      } else {
        window.InsegnamentiManager.deselectInsegnamento(codice);
      }
    }
  });

  // Dropdown sessioni (semplificata)
  dropdowns.sessioni?.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (!item?.dataset.data) return;

    const targetDate = new Date(item.dataset.data);
    const targetMonth = targetDate.getMonth() + 1;
    const targetYear = targetDate.getFullYear();
    
    setTimeout(() => {
      const monthSelector = `[data-date*="${targetYear}-${String(targetMonth).padStart(2, '0')}"]`;
      const monthElement = document.querySelector(monthSelector) || 
                          document.querySelector(`.fc-multimonth-month${monthSelector}`) ||
                          document.querySelector(`[data-date*="${targetYear}"]`);
      
      monthElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    
    item.closest('.calendar-dropdown').classList.remove('show');
    item.closest('.calendar-dropdown').style.display = 'none';
  });
}

// Listener per chiudere i dropdown cliccando fuori (ottimizzata)
export function setupGlobalClickListeners(dropdowns) {
  const closeAllDropdowns = () => {
    Object.values(dropdowns).forEach(dropdown => {
      if (dropdown?.classList.contains('show')) {
        dropdown.classList.remove('show');
        dropdown.style.display = 'none';
      }
    });
  };

  document.addEventListener("click", (e) => {
    // Se il click è su un pulsante dropdown, non fare nulla
    const button = e.target.closest('.fc-button');
    if (button?.classList.contains('fc-pulsanteInsegnamenti-button') || 
        button?.classList.contains('fc-pulsanteSessioni-button')) {
      return;
    }

    // Chiudi tutti i dropdown se il click è fuori da essi
    if (!Object.values(dropdowns).some(dropdown => dropdown?.contains(e.target))) {
      closeAllDropdowns();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
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

// Valida una data selezionata contro le parti originali divise
export function isDateValid(selectedDate, dateValide, provisionalDates = []) {
  const selDate = new Date(selectedDate);
  selDate.setHours(0, 0, 0, 0);

  // Controlla se la data è passata
  // if (selDate < today) {
  //   return {
  //     isValid: false,
  //     message: "Non è possibile inserire esami in date passate.",
  //   };
  // }

  // Controlla conflitti con eventi provvisori
  if (provisionalDates.length > 0) {
    const sameDayConflict = provisionalDates.some(provDateStr => {
      const provDate = new Date(provDateStr);
      provDate.setHours(0, 0, 0, 0);
      return selDate.getTime() === provDate.getTime();
    });

    if (sameDayConflict) {
      return {
        isValid: false,
        message: "Non è possibile inserire due esami nello stesso giorno.",
        isSameDayConflict: true
      };
    }

    // Controlla vincolo dei 14 giorni
    const hasProvisionalConflict = provisionalDates.some(provDateStr => {
      const provDate = new Date(provDateStr);
      provDate.setHours(0, 0, 0, 0);
      const diffDays = Math.abs(selDate - provDate) / (1000 * 60 * 60 * 24);
      return diffDays <= 13 && selDate.getTime() !== provDate.getTime();
    });

    if (hasProvisionalConflict) {
      return {
        isValid: false,
        message: "Non è possibile inserire esami a meno di 14 giorni di distanza.",
        isProvisionalConflict: true
      };
    }
  }

  // Usa le parti originali (divise) per la validazione effettiva, escludendo le vacanze
  const partiOriginali = window.sessioniPartiOriginali || dateValide;
  const isInSession = partiOriginali.some(([start, end]) => {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    return selDate >= startDate && selDate <= endDate;
  });

  return isInSession ? 
    { isValid: true } : 
    { isValid: false, message: "Non è possibile inserire esami al di fuori delle sessioni previste." };
}

// Scrolla alla prima data valida disponibile (semplificata)
export function scrollToPrimaDataValida(dateValide) {
  if (!Array.isArray(dateValide) || dateValide.length === 0) return;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  let primaDataValida = null;

  // Trova la prima data valida futura o attuale
  for (const [start, end] of dateValide) {
    const dataInizio = new Date(start);
    dataInizio.setHours(0, 0, 0, 0);
    
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

  if (!primaDataValida) return;

  const targetYear = primaDataValida.getFullYear();
  const targetMonth = String(primaDataValida.getMonth() + 1).padStart(2, '0');

  // Selettori semplificati in ordine di priorità
  const selectors = [
    `[data-date*="${targetYear}-${targetMonth}"]`,
    `.fc-multimonth-month[data-date*="${targetYear}-${targetMonth}"]`,
    `[data-date*="${targetYear}"]`
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      break;
    }
  }
}

// Unifica le sessioni divise dalle vacanze per la visualizzazione
export function unificaSessioniDivise(dateValide) {
  if (!Array.isArray(dateValide) || dateValide.length === 0) {
    return { sessioni: dateValide, partiOriginali: dateValide };
  }

  // Raggruppa le sessioni per sessione_id
  const sessioniRaggruppate = {};
  const partiOriginali = [];
  
  dateValide.forEach(([start, end, nome, sessioneId, nomeBase, parteNumero, totaleParts]) => {
    // Conserva tutte le parti originali per la validazione
    partiOriginali.push([start, end, nome]);
    
    // Se non ha sessioneId o è vuoto, crea un ID unico
    const id = sessioneId || `single_${start}_${nome}`;
    
    if (!sessioniRaggruppate[id]) {
      sessioniRaggruppate[id] = [];
    }
    
    sessioniRaggruppate[id].push({
      start,
      end,
      nome,
      sessioneId,
      nomeBase: nomeBase || nome.split(' (Parte')[0],
      parteNumero,
      totaleParts
    });
  });

  // Unifica le sessioni raggruppate
  const sessioniUnificate = [];
  
  Object.values(sessioniRaggruppate).forEach(parti => {
    if (parti.length === 1) {
      // Sessione non divisa, mantieni così com'è ma usa il nome base se disponibile
      const sessione = parti[0];
      const nomeUnificato = sessione.nomeBase || sessione.nome.split(' (Parte')[0];
      sessioniUnificate.push([sessione.start, sessione.end, nomeUnificato]);
    } else {
      // Sessione divisa, unifica per la visualizzazione
      const partiOrdinate = parti.sort((a, b) => new Date(a.start) - new Date(b.start));
      const primaParte = partiOrdinate[0];
      const ultimaParte = partiOrdinate[partiOrdinate.length - 1];
      
      const nomeUnificato = primaParte.nomeBase || primaParte.nome.split(' (Parte')[0];
      sessioniUnificate.push([primaParte.start, ultimaParte.end, nomeUnificato]);
    }
  });

  // Ordina per data di inizio
  const sessioni = sessioniUnificate.sort((a, b) => new Date(a[0]) - new Date(b[0]));
  
  return { 
    sessioni: sessioni,
    partiOriginali: partiOriginali.sort((a, b) => new Date(a[0]) - new Date(b[0]))
  };
}

// Esporta le funzioni del calendario
if (typeof window !== 'undefined') {
  window.formatDateForInput = formatDateForInput;
  window.isDateValid = isDateValid;
  window.scrollToPrimaDataValida = scrollToPrimaDataValida;
  window.unificaSessioniDivise = unificaSessioniDivise;
}
