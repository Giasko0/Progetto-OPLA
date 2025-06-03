// Gestione delle sezioni modulari per date e appelli
const EsameAppelli = (function() {
  // Verifica che FormEsameAutosave sia caricato
  if (!window.FormEsameAutosave) {
    console.warn('FormEsameAutosave non è caricato. Funzionalità di salvataggio automatico non disponibile.');
  }

  // Variabili per il tracking delle sezioni
  let dateAppelliCounter = 0;
  let selectedDates = [];
  let appellobTemplate = null;

  // Importa utilità comuni da FormUtils
  const {
    isValidDate,
    isWeekday,
    loadAuleForDateTime,
    populateAulaSelect,
    parseTimeString
  } = window.FormUtils;

  // Funzione helper per formattare la data per input
  function formatDateForInput(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Carica il template HTML per la sezione appello
  async function loadAppelloTemplate() {
    if (appellobTemplate) {
      return appellobTemplate;
    }
    
    try {
      const response = await fetch('/formEsameAppello.html');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      appellobTemplate = await response.text();
      return appellobTemplate;
    } catch (error) {
      console.error('Errore nel caricamento del template appello:', error);
      throw error;
    }
  }

  async function addDateSection(date = '') {
    const container = document.getElementById('dateAppelliContainer');
    if (!container) {
      console.error("Container dateAppelliContainer non trovato");
      return;
    }

    // Verifica se esiste già una sezione con questa data
    if (date) {
      const existingSections = document.querySelectorAll('.date-appello-section');
      const dateExists = Array.from(existingSections).some(section => 
        section.dataset.date === date
      );
      
      if (dateExists) {
        return null;
      }
    }

    dateAppelliCounter++;
    const sectionId = `dateSection_${dateAppelliCounter}`;

    // Inserisci sempre un separatore prima di ogni sezione (anche la prima)
    const separator = document.createElement('div');
    separator.className = 'form-separator';
    container.appendChild(separator);

    const section = document.createElement('div');
    section.className = 'date-appello-section';
    section.id = sectionId;
    section.dataset.date = date || ''; // Imposta stringa vuota se non c'è data

    try {
      // Carica il template HTML
      const template = await loadAppelloTemplate();
      
      // Sostituisci i placeholder nel template
      const processedTemplate = template
        .replace(/{{COUNTER}}/g, dateAppelliCounter)
        .replace(/{{SECTION_ID}}/g, sectionId)
        .replace(/{{DATE}}/g, date);
    
      section.innerHTML = processedTemplate;
    } catch (error) {
      console.error('Errore nel caricamento del template:', error);
      // Fallback - usa un template semplificato
      section.innerHTML = `
        <div class="date-appello-header">
          <h4 class="date-appello-title">Appello ${dateAppelliCounter}</h4>
          <button type="button" class="remove-date-btn" onclick="removeDateSection('${sectionId}')">
            <span class="material-symbols-outlined">delete</span>
            Rimuovi
          </button>
        </div>
        <div class="date-appello-fields">
          <p>Errore nel caricamento del template. Ricarica la pagina.</p>
        </div>
      `;
    }

    // Inserisci la sezione prima del pulsante "Aggiungi data"
    const addButton = container.querySelector('.add-date-btn');
    if (addButton) {
      container.insertBefore(section, addButton);
    } else {
      container.appendChild(section);
    }
    
    // Aggiungi event listeners per questa sezione
    setupDateSectionListeners(sectionId, dateAppelliCounter);
    
    // Precompila la nuova sezione con i dati della prima sezione (solo se non è la prima)
    if (dateAppelliCounter > 1 && window.FormEsameAutosave) {
      window.FormEsameAutosave.precompileNewSection(section);
    }
    
    // Se è stata fornita una data, crea subito l'evento provvisorio
    if (date) {
      createProvisionalEventForDate(date);
      // Aggiungi la data al tracking solo se non è vuota
      if (!selectedDates.includes(date)) {
        selectedDates.push(date);
      }
    }
    
    return sectionId;
  }
  
  function removeDateSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const date = section.dataset.date;
    
    // Rimuovi l'evento provvisorio associato dal calendario se esiste
    if (date && window.provisionalEvents && window.removeProvisionalEvents) {
      const matchingEvent = window.provisionalEvents.find(event => 
        event.extendedProps.formSectionDate === date
      );
      if (matchingEvent) {
        window.removeProvisionalEvents(matchingEvent.id);
      }
    }
    
    // Rimuovi dal tracking delle date
    if (date && selectedDates.includes(date)) {
      const index = selectedDates.indexOf(date);
      if (index > -1) {
        selectedDates.splice(index, 1);
      }
    }
    
    section.remove();
    
    // Rinumera le sezioni rimanenti
    renumberDateSections();
  }
  
  function renumberDateSections() {
    const sections = document.querySelectorAll('.date-appello-section');
    sections.forEach((section, index) => {
      const newNumber = index + 1;
      const title = section.querySelector('.date-appello-title');
      if (title) {
        title.textContent = `Appello ${newNumber}`;
      }
    });
  }
  
  function setupDateSectionListeners(sectionId, counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const oraH = document.getElementById(`ora_h_${counter}`);
    const oraM = document.getElementById(`ora_m_${counter}`);
    const durataH = document.getElementById(`durata_h_${counter}`);
    const durataM = document.getElementById(`durata_m_${counter}`);
    const tipoAppelloRadios = document.querySelectorAll(`input[name="tipo_appello_radio_${counter}"]`);
    
    if (dateInput) {
      // Rimuovi stili di errore durante la digitazione
      dateInput.addEventListener('input', () => {
        dateInput.classList.remove('form-input-error');
      });
      
      // Esegui la validazione solo quando il campo perde focus
      dateInput.addEventListener('blur', () => {
        if (dateInput.value && isValidDateFormat(dateInput.value)) {
          handleDateInputChange(sectionId, counter);
          updateAuleForSection(counter);
        }
      });
    }
    if (oraH) {
      oraH.addEventListener('change', () => {
        updateAuleForSection(counter);
        // Salva automaticamente se è la prima sezione
        if (counter === 1 && window.FormEsameAutosave) {
          window.FormEsameAutosave.autoSaveFirstSection();
        }
      });
    }
    if (oraM) {
      oraM.addEventListener('change', () => {
        updateAuleForSection(counter);
        // Salva automaticamente se è la prima sezione
        if (counter === 1 && window.FormEsameAutosave) {
          window.FormEsameAutosave.autoSaveFirstSection();
        }
      });
    }
    
    // Gestione durata per sezione
    if (durataH && durataM) {
      // Rimuovi listener esistenti per evitare duplicati
      durataH.removeEventListener('change', () => combineDurataForSection(counter));
      durataM.removeEventListener('change', () => combineDurataForSection(counter));
      
      // Aggiungi nuovi listener
      durataH.addEventListener('change', () => {
        combineDurataForSection(counter);
        // Salva automaticamente se è la prima sezione
        if (counter === 1 && window.FormEsameAutosave) {
          window.FormEsameAutosave.autoSaveFirstSection();
        }
      });
      durataM.addEventListener('change', () => {
        combineDurataForSection(counter);
        // Salva automaticamente se è la prima sezione
        if (counter === 1 && window.FormEsameAutosave) {
          window.FormEsameAutosave.autoSaveFirstSection();
        }
      });
      
      // Inizializza il valore di durata al caricamento
      setTimeout(() => combineDurataForSection(counter), 100);
    }
    
    // Gestione tipo appello per sezione
    tipoAppelloRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        aggiornaVerbalizzazioneForSection(counter);
        // Salva automaticamente se è la prima sezione
        if (counter === 1 && window.FormEsameAutosave) {
          window.FormEsameAutosave.autoSaveFirstSection();
        }
      });
    });

    // Aggiungi listener per il salvataggio automatico sui campi di testo se è la prima sezione
    if (counter === 1 && window.FormEsameAutosave) {
      const section = document.getElementById(sectionId);
      if (section) {
        // Campi di testo e textarea
        const textInputs = section.querySelectorAll('input[type="text"], textarea, input[type="date"]');
        textInputs.forEach(input => {
          input.addEventListener('input', () => {
            clearTimeout(input._autoSaveTimeout);
            input._autoSaveTimeout = setTimeout(() => {
              window.FormEsameAutosave.autoSaveFirstSection();
            }, 500);
          });
        });

        // Select e checkbox
        const selectsAndCheckboxes = section.querySelectorAll('select, input[type="checkbox"]');
        selectsAndCheckboxes.forEach(element => {
          element.addEventListener('change', () => {
            window.FormEsameAutosave.autoSaveFirstSection();
          });
        });
        
        // Radio buttons per tipo appello
        const radioButtons = section.querySelectorAll('input[type="radio"]');
        radioButtons.forEach(radio => {
          radio.addEventListener('change', () => {
            window.FormEsameAutosave.autoSaveFirstSection();
          });
        });
      }
    }
  }

  // Funzione per combinare durata per sezione specifica
  function combineDurataForSection(counter) {
    const durata_h = parseInt(document.getElementById(`durata_h_${counter}`)?.value) || 0;
    const durata_m = parseInt(document.getElementById(`durata_m_${counter}`)?.value) || 0;
    const durata_totale = (durata_h * 60) + durata_m;
    
    const durataField = document.getElementById(`durata_${counter}`);
    if (durataField) {
      durataField.value = durata_totale.toString();
    }
  }

  // Funzione per aggiornare verbalizzazione per sezione specifica
  function aggiornaVerbalizzazioneForSection(counter) {
    const tipoAppelloPP = document.getElementById(`tipoAppelloPP_${counter}`);
    const verbalizzazioneSelect = document.getElementById(`verbalizzazione_${counter}`);

    if (!tipoAppelloPP || !verbalizzazioneSelect) return;

    verbalizzazioneSelect.innerHTML = "";

    const options = tipoAppelloPP.checked
      ? [
          { value: "PAR", text: "Prova parziale" },
          { value: "PPP", text: "Prova parziale con pubblicazione" },
        ]
      : [
          { value: "FSS", text: "Firma digitale singola" },
          { value: "FWP", text: "Firma digitale con pubblicazione" },
        ];

    options.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      verbalizzazioneSelect.appendChild(optionElement);
    });

    verbalizzazioneSelect.value = tipoAppelloPP.checked ? "PAR" : "FSS";
  }

  // Funzione helper per validare il formato della data
  function isValidDateFormat(dateString) {
    if (dateString.length !== 10) return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    // Verifica che sia una data valida
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString === formatDateForInput(date);
  }

  // Funzione per validare i vincoli di data riutilizzando la logica esistente
  function validateDateConstraints(newDate, counter) {
    if (!newDate) return true;
    
    const dateInput = document.getElementById(`dataora_${counter}`);
    
    // Rimuovi eventuali stili di errore precedenti
    if (dateInput) {
      dateInput.classList.remove('form-input-error');
    }
    
    // Raccogli le date provvisorie da altre sezioni del form (esclusa quella corrente)
    const otherSectionDates = [];
    const dateSections = document.querySelectorAll('.date-appello-section');
    dateSections.forEach(section => {
      const sectionDateInput = section.querySelector('input[type="date"]');
      if (sectionDateInput && sectionDateInput.value && sectionDateInput.id !== `dataora_${counter}`) {
        otherSectionDates.push(sectionDateInput.value);
      }
    });
    
    // Usa la funzione esistente isDateValid con le date delle altre sezioni
    const validationResult = window.isDateValid(new Date(newDate), window.dateValide || [], otherSectionDates);
    
    if (!validationResult.isValid) {
      // Applica lo stile di errore al campo
      if (dateInput) {
        dateInput.classList.add('form-input-error');
      }
      
      // Mostra il messaggio appropriato
      if (window.showMessage) {
        window.showMessage(
          validationResult.message,
          'Vincolo date', 
          'warning'
        );
      }
      
      return false;
    }
    
    return true;
  }

  function handleDateInputChange(sectionId, counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const section = document.getElementById(sectionId);
    
    if (!dateInput || !section) return;
    
    const newDate = dateInput.value;
    const oldDate = section.dataset.date;
    
    // Se la data non è completa o non è valida, non fare nulla
    if (!newDate || newDate.length < 10 || !isValidDateFormat(newDate)) {
      return;
    }
    
    // Se la data è cambiata
    if (newDate !== oldDate) {
      // Rimuovi l'evento provvisorio precedente se esisteva
      if (oldDate && window.provisionalEvents && window.removeProvisionalEvents) {
        const matchingEvent = window.provisionalEvents.find(event => 
          event.extendedProps.formSectionDate === oldDate
        );
        if (matchingEvent) {
          window.removeProvisionalEvents([matchingEvent.id]);
        }
      }
      
      // Aggiorna il tracking delle date selezionate
      if (oldDate && selectedDates.includes(oldDate)) {
        const index = selectedDates.indexOf(oldDate);
        selectedDates.splice(index, 1);
      }
      
      // Verifica il vincolo dei 14 giorni
      if (!validateDateConstraints(newDate, counter)) {
        // Data non valida - non creare evento provvisorio
        return;
      }
      
      // Data valida - continua con la logica normale
      section.dataset.date = newDate;
      createProvisionalEventForDate(newDate);
      
      if (!selectedDates.includes(newDate)) {
        selectedDates.push(newDate);
      }
      
      // Reset delle aule quando cambia la data
      const aulaSelect = document.getElementById(`aula_${counter}`);
      if (aulaSelect) {
        aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
      }

      // Calcola e imposta automaticamente le date di inizio e fine iscrizione
      const inizioIscrizioneInput = document.getElementById(`inizioIscrizione_${counter}`);
      const fineIscrizioneInput = document.getElementById(`fineIscrizione_${counter}`);
      if (inizioIscrizioneInput && fineIscrizioneInput) {
        const appelloDate = new Date(newDate);
        // Inizio iscrizione: 30 giorni prima
        const inizio = new Date(appelloDate);
        inizio.setDate(appelloDate.getDate() - 30);
        // Fine iscrizione: 1 giorno prima
        const fine = new Date(appelloDate);
        fine.setDate(appelloDate.getDate() - 1);
        // Formatta le date in YYYY-MM-DD
        const pad = n => n.toString().padStart(2, '0');
        const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        inizioIscrizioneInput.value = format(inizio);
        fineIscrizioneInput.value = format(fine);
      }
    }
  }

  // Funzione per verificare se esiste già un evento provvisorio per una data specifica
  function isProvisionalEventExistsForDate(date) {
    if (window.provisionalEvents) {
      return window.provisionalEvents.some(event => event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date));
    }
    return false;
  }
  
  // Modificata per prevenire la creazione di eventi duplicati usando la funzione unificata
  function createProvisionalEventForDate(date) {
    if (!window.calendar || !date) {
      return;
    }

    // Usa la funzione unificata importata da calendarUtils
    const provisionalEvent = window.creaEventoProvvisorio(date, window.calendar, window.provisionalEvents || []);
    
    if (provisionalEvent && window.updateDateValideWithExclusions) {
      window.updateDateValideWithExclusions();
    }
  }
  
  function updateAuleForSection(counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const oraH = document.getElementById(`ora_h_${counter}`);
    const oraM = document.getElementById(`ora_m_${counter}`);
    const aulaSelect = document.getElementById(`aula_${counter}`);
    
    if (!dateInput || !oraH || !oraM || !aulaSelect) return;
    
    const data = dateInput.value;
    const ora_hValue = oraH.value;
    const ora_mValue = oraM.value;
    
    if (!data) {
      aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima una data</option>';
      return;
    }
    
    if (!ora_hValue || !ora_mValue) {
      aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima un\'ora</option>';
      return;
    }
    
    aulaSelect.innerHTML = '<option value="" disabled selected hidden>Caricamento aule in corso...</option>';
    
    const periodo = parseInt(ora_hValue) >= 14 ? 1 : 0;
    
    loadAuleForDateTime(data, periodo)
      .then(aule => {
        populateAulaSelect(aulaSelect, aule, true);
        
        // Aggiungi listener per aggiornare l'evento provvisorio quando cambia l'aula
        aulaSelect.addEventListener('change', function() {
          if (window.aggiornaAulaEventoProvvisorio && window.calendar && window.provisionalEvents) {
            window.aggiornaAulaEventoProvvisorio(data, this.value, window.calendar, window.provisionalEvents);
          }
        });
      })
      .catch(error => {
        console.error("Errore nel recupero delle aule:", error);
        aulaSelect.innerHTML = '<option value="" disabled selected>Errore nel caricamento delle aule</option>';
        
        const option = document.createElement("option");
        option.value = "Studio docente DMI";
        option.textContent = "Studio docente DMI";
        aulaSelect.appendChild(option);
      });
  }
  
  function initializeDateSections() {
    const container = document.getElementById('dateAppelliContainer');
    if (!container) {
      console.error("Container dateAppelliContainer non trovato durante l'inizializzazione");
      return;
    }
        
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

  // Reset function
  function resetSections() {
    dateAppelliCounter = 0;
    selectedDates = [];
    const container = document.getElementById('dateAppelliContainer');
    if (container) {
      container.innerHTML = '';
    }
  }

  // Interfaccia pubblica
  return {
    addDateSection,
    removeDateSection,
    renumberDateSections,
    setupDateSectionListeners,
    initializeDateSections,
    createProvisionalEventForDate,
    isProvisionalEventExistsForDate,
    validateDateConstraints,
    handleDateInputChange,
    updateAuleForSection,
    resetSections,
    getSelectedDates: () => [...selectedDates],
    getDateAppelliCounter: () => dateAppelliCounter,
    combineDurataForSection,
    aggiornaVerbalizzazioneForSection
  };
}());

// Esponi il modulo globalmente
window.EsameAppelli = EsameAppelli;

// Funzione globale per la rimozione delle sezioni (per compatibilità)
window.removeDateSection = function(sectionId) {
  EsameAppelli.removeDateSection(sectionId);
};