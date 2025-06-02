// Script per la gestione delle sezioni appelli del form esame
const FormEsameAppelli = (function() {
  // Verifica che FormUtils sia caricato
  if (!window.FormUtils) {
    throw new Error('FormUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameAppelli.js');
  }

  // Importa utilità da FormUtils
  const {
    formatDateForInput,
    loadAuleForDateTime,
    populateAulaSelect,
    loadHTMLTemplate,
    processHTMLTemplate,
    validateExamDate,
    createProvisionalEvent,
    removeProvisionalEvent,
    combineTimeValues
  } = window.FormUtils;

  let dateAppelliCounter = 0;
  let selectedDates = [];

  // Riusa dateValide dal context globale del calendario
  const getDateValide = () => window.dateValide || [];

  // Gestione sezioni modulari per date e appelli
  async function addDateSection(date = '') {
    const container = document.getElementById('dateAppelliContainer');
    if (!container) {
      console.error('Container dateAppelliContainer non trovato');
      return null;
    }

    // Calcola il numero della sezione basandosi sulle sezioni esistenti
    const existingSections = container.querySelectorAll('.date-appello-section');
    const sectionNumber = existingSections.length + 1;
    dateAppelliCounter = sectionNumber;
    const sectionId = `dateSection_${sectionNumber}`;

    // Inserisci sempre un separatore prima di ogni sezione (anche la prima)
    const separator = document.createElement('div');
    separator.className = 'form-separator';
    container.appendChild(separator);

    const section = document.createElement('div');
    section.className = 'date-appello-section';
    section.id = sectionId;
    section.dataset.date = date;

    try {
      const template = await loadHTMLTemplate('/formEsameAppello.html');
      const processedTemplate = processHTMLTemplate(template, {
        COUNTER: sectionNumber,
        SECTION_ID: sectionId,
        DATE: date
      });
      section.innerHTML = processedTemplate;
    } catch (error) {
      console.error('Errore nel caricamento del template:', error);
      section.innerHTML = `<p>Errore nel caricamento della sezione appello</p>`;
    }

    // Inserisci la sezione prima del pulsante "Aggiungi data"
    const addButton = container.querySelector('.add-date-btn');
    if (addButton) {
      container.insertBefore(section, addButton);
    } else {
      container.appendChild(section);
    }
    
    // Aggiungi event listeners per questa sezione
    setupDateSectionListeners(sectionId, sectionNumber);
    
    // Se è stata fornita una data, crea subito l'evento provvisorio
    if (date) {
      createProvisionalEventForDate(date);
    }
    
    // Aggiungi la data al tracking se non è vuota
    if (date) {
      selectedDates.push(date);
    }
    
    return sectionId;
  }
  
  function removeDateSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const date = section.dataset.date;
    
    // Rimuovi l'evento provvisorio associato dal calendario se esiste
    if (date && window.provisionalEvents && window.removeProvisionalEvents) {
      window.removeProvisionalEvents([date]);
    }
    
    // Rimuovi dal tracking delle date
    if (date && selectedDates.includes(date)) {
      selectedDates.splice(selectedDates.indexOf(date), 1);
    }
    
    section.remove();
    
    // Rinumera le sezioni rimanenti
    renumberDateSections();
  }
  
  function renumberDateSections() {
    const sections = document.querySelectorAll('.date-appello-section');
    sections.forEach((section, index) => {
      const newNumber = index + 1;
      const oldNumber = parseInt(section.id.split('_')[1]);
      
      // Aggiorna l'ID della sezione
      section.id = `dateSection_${newNumber}`;
      
      // Aggiorna il titolo della sezione
      const title = section.querySelector('.date-appello-title');
      if (title) {
        title.textContent = `Appello ${newNumber}`;
      }
      
      // Aggiorna tutti gli ID e name degli elementi interni se il numero è cambiato
      if (oldNumber !== newNumber) {
        const elements = section.querySelectorAll('[id*="_' + oldNumber + '"], [name*="_' + oldNumber + '"], [for*="_' + oldNumber + '"]');
        elements.forEach(element => {
          if (element.id) {
            element.id = element.id.replace(`_${oldNumber}`, `_${newNumber}`);
          }
          if (element.name) {
            element.name = element.name.replace(`_${oldNumber}`, `_${newNumber}`);
          }
          if (element.htmlFor) {
            element.htmlFor = element.htmlFor.replace(`_${oldNumber}`, `_${newNumber}`);
          }
        });
        
        // Aggiorna anche gli onclick degli elementi che contengono riferimenti
        const elementsWithOnclick = section.querySelectorAll('[onclick*="' + oldNumber + '"]');
        elementsWithOnclick.forEach(element => {
          element.onclick = element.onclick.toString().replace(new RegExp(oldNumber, 'g'), newNumber);
        });
      }
    });
    
    // Aggiorna il contatore globale
    dateAppelliCounter = sections.length;
  }
  
  function setupDateSectionListeners(sectionId, counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const oraH = document.getElementById(`ora_h_${counter}`);
    const oraM = document.getElementById(`ora_m_${counter}`);
    
    if (dateInput) {
      dateInput.addEventListener('change', () => handleDateInputChange(sectionId, counter));
    }
    if (oraH) {
      oraH.addEventListener('change', () => updateAuleForSection(counter));
    }
    if (oraM) {
      oraM.addEventListener('change', () => updateAuleForSection(counter));
    }
  }

  // Funzione per validare i vincoli di data riutilizzando la logica esistente
  function validateDateConstraints(newDate, counter) {
    if (!newDate) return false;
    
    const dateInput = document.getElementById(`dataora_${counter}`);
    
    // Rimuovi eventuali stili di errore precedenti
    if (dateInput) {
      dateInput.classList.remove('form-input-error');
    }
    
    // Raccogli le date provvisorie da altre sezioni del form (esclusa quella corrente)
    const otherSectionDates = [];
    const dateSections = document.querySelectorAll('.date-appello-section');
    dateSections.forEach(section => {
      const sectionCounter = section.id.split('_')[1];
      if (sectionCounter != counter) {
        const sectionDateInput = document.getElementById(`dataora_${sectionCounter}`);
        if (sectionDateInput && sectionDateInput.value) {
          otherSectionDates.push(sectionDateInput.value);
        }
      }
    });
    
    // Usa la funzione esistente isDateValid con le date delle altre sezioni
    const validationResult = window.isDateValid(new Date(newDate), getDateValide(), otherSectionDates);
    
    if (!validationResult.isValid) {
      if (dateInput) {
        dateInput.classList.add('form-input-error');
      }
      
      if (window.showMessage) {
        window.showMessage(validationResult.message, "Data non valida", "error");
      }
      return false;
    }
    
    return true;
  }

  function handleDateInputChange(sectionId, counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    if (!dateInput) return;
    
    const newDate = dateInput.value;
    const section = document.getElementById(sectionId);
    const oldDate = section ? section.dataset.date : null;
    
    // Valida la nuova data
    if (newDate && !validateDateConstraints(newDate, counter)) {
      // Se la validazione fallisce, ripristina la data precedente
      if (oldDate) {
        dateInput.value = oldDate;
      } else {
        dateInput.value = '';
      }
      return;
    }
    
    // Rimuovi l'evento provvisorio precedente se esiste
    if (oldDate && window.removeProvisionalEvents) {
      window.removeProvisionalEvents([oldDate]);
      
      // Rimuovi dal tracking
      if (selectedDates.includes(oldDate)) {
        selectedDates.splice(selectedDates.indexOf(oldDate), 1);
      }
    }
    
    // Aggiorna il dataset della sezione
    if (section) {
      section.dataset.date = newDate;
    }
    
    // Se c'è una nuova data, crea l'evento provvisorio
    if (newDate) {
      createProvisionalEventForDate(newDate);
      
      // Aggiungi al tracking
      if (!selectedDates.includes(newDate)) {
        selectedDates.push(newDate);
      }
      
      // Aggiorna le aule disponibili
      updateAuleForSection(counter);
    }
  }

  // Funzione per verificare se esiste già un evento provvisorio per una data specifica
  function isProvisionalEventExistsForDate(date) {
    if (!window.provisionalEvents) return false;
    return window.provisionalEvents.some(event => 
      event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
    );
  }
  
  // Modificata per prevenire la creazione di eventi duplicati usando la funzione unificata
  function createProvisionalEventForDate(date) {
    if (!date || isProvisionalEventExistsForDate(date)) return;
    
    if (window.createProvisionalEvent) {
      window.createProvisionalEvent(date);
    }
  }
  
  function updateAuleForSection(counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const oraH = document.getElementById(`ora_h_${counter}`);
    const oraM = document.getElementById(`ora_m_${counter}`);
    const aulaSelect = document.getElementById(`aula_${counter}`);
    
    if (!dateInput || !oraH || !oraM || !aulaSelect) return;
    
    const data = dateInput.value;
    const ora = oraH.value;
    const minuti = oraM.value;
    
    if (!data || !ora || !minuti) {
      aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
      return;
    }
    
    const oraCompleta = `${ora}:${minuti}`;
    
    loadAuleForDateTime(data, oraCompleta)
      .then(aule => {
        populateAulaSelect(aulaSelect, aule);
      })
      .catch(error => {
        console.error('Errore nel caricamento delle aule:', error);
        aulaSelect.innerHTML = '<option value="" disabled>Errore nel caricamento aule</option>';
      });
  }
  
  function initializeDateSections() {
    const container = document.getElementById('dateAppelliContainer');
    if (!container) {
      console.error("Container dateAppelliContainer non trovato durante l'inizializzazione");
      return;
    }
    
    // Reset del contatore basandosi sulle sezioni esistenti
    const existingSections = container.querySelectorAll('.date-appello-section');
    dateAppelliCounter = existingSections.length;
    
    // Rimuovi il pulsante se già esiste
    const existingButton = container.querySelector('.add-date-btn');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Aggiungi il pulsante per aggiungere nuove date
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'add-date-btn';
    addButton.innerHTML = '<span class="material-symbols-outlined">add</span> Aggiungi data appello';
    addButton.addEventListener('click', () => addDateSection());
    
    container.appendChild(addButton);
  }

  // Raccoglie i dati da tutte le sezioni per l'invio del form
  function collectSectionsData() {
    const sections = document.querySelectorAll('.date-appello-section');
    const sectionsData = [];
    
    sections.forEach((section, index) => {
      const counter = section.id.split('_')[1];
      const sectionData = {
        descrizione: document.getElementById(`descrizione_${counter}`)?.value,
        dataora: document.getElementById(`dataora_${counter}`)?.value,
        ora_h: document.getElementById(`ora_h_${counter}`)?.value,
        ora_m: document.getElementById(`ora_m_${counter}`)?.value,
        durata_h: document.getElementById(`durata_h_${counter}`)?.value,
        durata_m: document.getElementById(`durata_m_${counter}`)?.value,
        aula: document.getElementById(`aula_${counter}`)?.value,
        inizioIscrizione: document.getElementById(`inizioIscrizione_${counter}`)?.value,
        fineIscrizione: document.getElementById(`fineIscrizione_${counter}`)?.value,
        verbalizzazione: document.getElementById(`verbalizzazione_${counter}`)?.value,
        tipoEsame: document.getElementById(`tipoEsame_${counter}`)?.value,
        note: document.getElementById(`note_${counter}`)?.value,
        mostra_nel_calendario: document.getElementById(`mostra_nel_calendario_${counter}`)?.checked,
        tipo_appello: document.querySelector(`input[name="tipo_appello_radio_${counter}"]:checked`)?.value
      };
      
      // Calcola la durata totale in minuti
      const durataH = parseInt(sectionData.durata_h) || 0;
      const durataM = parseInt(sectionData.durata_m) || 0;
      sectionData.durata = (durataH * 60) + durataM;
      
      // Combina ora
      if (sectionData.ora_h && sectionData.ora_m) {
        sectionData.ora = `${sectionData.ora_h}:${sectionData.ora_m}`;
      }
      
      sectionsData.push(sectionData);
    });
    
    return sectionsData;
  }

  // Popola le sezioni con dati esistenti (per modalità modifica)
  function populateSectionsWithData(examData) {
    // Per ora gestisce solo un singolo esame, ma la struttura è pronta per multipli
    if (examData) {
      // Assicurati che ci sia almeno una sezione
      if (!document.querySelector('.date-appello-section')) {
        addDateSection();
      }
      
      // Popola la prima sezione con i dati dell'esame
      const firstSection = document.querySelector('.date-appello-section');
      if (firstSection) {
        const counter = firstSection.id.split('_')[1];
        
        if (examData.descrizione) {
          const desc = document.getElementById(`descrizione_${counter}`);
          if (desc) desc.value = examData.descrizione;
        }
        
        if (examData.data_appello) {
          const data = document.getElementById(`dataora_${counter}`);
          if (data) data.value = examData.data_appello;
        }
        
        if (examData.ora_appello) {
          const [hours, minutes] = examData.ora_appello.split(':');
          const oraH = document.getElementById(`ora_h_${counter}`);
          const oraM = document.getElementById(`ora_m_${counter}`);
          if (oraH) oraH.value = hours.padStart(2, '0');
          if (oraM) oraM.value = minutes.padStart(2, '0');
        }
        
        if (examData.durata_appello) {
          const durata = parseInt(examData.durata_appello);
          const ore = Math.floor(durata / 60);
          const minuti = durata % 60;
          const durataH = document.getElementById(`durata_h_${counter}`);
          const durataM = document.getElementById(`durata_m_${counter}`);
          if (durataH) durataH.value = ore.toString();
          if (durataM) durataM.value = minuti.toString();
        }
        
        if (examData.aula) {
          setTimeout(() => {
            const aula = document.getElementById(`aula_${counter}`);
            if (aula) aula.value = examData.aula;
          }, 100);
        }
        
        // Altri campi...
        if (examData.data_inizio_iscrizione) {
          const inizio = document.getElementById(`inizioIscrizione_${counter}`);
          if (inizio) inizio.value = examData.data_inizio_iscrizione;
        }
        
        if (examData.data_fine_iscrizione) {
          const fine = document.getElementById(`fineIscrizione_${counter}`);
          if (fine) fine.value = examData.data_fine_iscrizione;
        }
        
        if (examData.verbalizzazione) {
          const verb = document.getElementById(`verbalizzazione_${counter}`);
          if (verb) verb.value = examData.verbalizzazione;
        }
        
        if (examData.tipo_esame) {
          const tipo = document.getElementById(`tipoEsame_${counter}`);
          if (tipo) tipo.value = examData.tipo_esame;
        }
        
        if (examData.note_appello) {
          const note = document.getElementById(`note_${counter}`);
          if (note) note.value = examData.note_appello;
        }
        
        if (examData.hasOwnProperty('mostra_nel_calendario')) {
          const mostra = document.getElementById(`mostra_nel_calendario_${counter}`);
          if (mostra) mostra.checked = examData.mostra_nel_calendario;
        }
        
        if (examData.tipo_appello) {
          const tipoRadio = document.getElementById(`tipoAppello${examData.tipo_appello}_${counter}`);
          if (tipoRadio) tipoRadio.checked = true;
        }
      }
    }
  }

  // Reset delle sezioni appelli
  function reset() {
    const container = document.getElementById('dateAppelliContainer');
    if (container) {
      // Rimuovi tutte le sezioni esistenti
      const sections = container.querySelectorAll('.date-appello-section, .form-separator');
      sections.forEach(section => section.remove());
    }
    
    // Reset variabili
    dateAppelliCounter = 0;
    selectedDates = [];
    
    // Pulisci eventi provvisori
    if (window.clearAllProvisionalEvents) {
      window.clearAllProvisionalEvents();
    }
  }

  // Interfaccia pubblica
  return {
    addDateSection,
    removeDateSection,
    renumberDateSections,
    setupDateSectionListeners,
    validateDateConstraints,
    handleDateInputChange,
    isProvisionalEventExistsForDate,
    createProvisionalEventForDate,
    updateAuleForSection,
    initializeDateSections,
    collectSectionsData,
    populateSectionsWithData,
    reset,
    // Getter per variabili interne
    get selectedDates() { return [...selectedDates]; },
    get dateAppelliCounter() { return dateAppelliCounter; }
  };
}());

// Esportazione globale
window.FormEsameAppelli = FormEsameAppelli;