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

  // Funzione helper per mostrare errori
  function showError(message) {
    if (window.showMessage) {
      window.showMessage(message, 'Errore di validazione', 'error');
    } else {
      console.error(message);
      alert(message); // Fallback per compatibilità
    }
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
      return null;
    }

    // Verifica se esiste già una sezione con questa data
    if (date) {
      const existingSections = document.querySelectorAll('.date-appello-section');
      const dateExists = Array.from(existingSections).some(section => 
        section.dataset.date === date
      );
      
      if (dateExists) {
        console.log(`Sezione per la data ${date} già esistente, non verrà aggiunta di nuovo`);
        
        // Evidenzia la sezione esistente
        const existingSection = Array.from(existingSections).find(section => 
          section.dataset.date === date
        );
        if (existingSection) {
          existingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          existingSection.style.backgroundColor = '#fffacd';
          setTimeout(() => {
            existingSection.style.backgroundColor = '';
          }, 2000);
          return existingSection.id;
        }
        return null;
      }
    }

    // Calcola il prossimo numero di sezione basandosi sulle sezioni esistenti
    const existingSections = document.querySelectorAll('.date-appello-section');
    dateAppelliCounter = existingSections.length + 1;
    const sectionId = `dateSection_${dateAppelliCounter}`;

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
    
    // Assicurati che il checkbox "Apertura appelli" sia sempre selezionato per default
    const showInCalendarCheckbox = section.querySelector(`#mostra_nel_calendario_${dateAppelliCounter}`);
    if (showInCalendarCheckbox) {
      showInCalendarCheckbox.checked = true;
    }
    
    // Se è stata fornita una data, crea subito l'evento provvisorio
    if (date) {
      createProvisionalEventForDate(date, dateAppelliCounter);
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
    
    // Aggiorna il counter basandosi sul numero di sezioni rimanenti
    const remainingSections = document.querySelectorAll('.date-appello-section');
    dateAppelliCounter = remainingSections.length;
    
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

    // Gestione del checkbox "Apertura appelli" 
    const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${counter}`);
    if (showInCalendarCheckbox) {
        // Assicurati che sia selezionato per default
        if (!showInCalendarCheckbox.hasAttribute('data-user-modified')) {
            showInCalendarCheckbox.checked = true;
        }
        
        showInCalendarCheckbox.addEventListener('change', function() {
            this.setAttribute('data-user-modified', 'true');
            validateAllDates();
        });
    }
  }

  // Nuova funzione per rivalidare tutte le date
  function validateAllDates() {
    for (let i = 1; i <= 4; i++) {
        const dateInput = document.getElementById(`dataora_${i}`);
        const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${i}`);
        
        // Valida solo le sezioni che hanno il checkbox "Apertura appelli" attivo
        if (dateInput && dateInput.value && showInCalendarCheckbox && showInCalendarCheckbox.checked) {
            // Rimuovi eventuali stili di errore precedenti prima della validazione
            dateInput.classList.remove('form-input-error');
            validateDateConstraints(dateInput.value, i);
        } else if (dateInput && !showInCalendarCheckbox?.checked) {
            // Se il checkbox è disattivato, rimuovi eventuali stili di errore
            dateInput.classList.remove('form-input-error');
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
    
    try {
        // Raccoglie solo le date delle sezioni con "Apertura appelli" attivo
        const visibleSectionDates = [];
        
        for (let i = 1; i <= 4; i++) {
            if (i === counter) continue; // Salta la sezione corrente
            
            const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${i}`);
            const dateInput = document.getElementById(`dataora_${i}`);
            
            // Include la data solo se il checkbox è selezionato e la data è valida
            if (showInCalendarCheckbox && showInCalendarCheckbox.checked && 
                dateInput && dateInput.value) {
                visibleSectionDates.push(dateInput.value);
            }
        }
        
        // Converte la nuova data in oggetto Date se è una stringa
        const dateToValidate = typeof newDate === 'string' ? new Date(newDate) : newDate;
        
        // Validazione custom solo per i vincoli tra appelli (non controlla le sessioni)
        const validationResult = validateDateConstraintsForSections(dateToValidate, visibleSectionDates);
            
        const dateInput = document.getElementById(`dataora_${counter}`);
        
        if (!validationResult.isValid) {
            // Applica lo stile di errore al campo
            if (dateInput) {
                dateInput.classList.add('form-input-error');
            }
            
            showError(`Sezione ${counter}: ${validationResult.message}`);
            return false;
        } else {
            // Rimuovi lo stile di errore se la validazione passa
            if (dateInput) {
                dateInput.classList.remove('form-input-error');
            }
        }
        
        return true;
    } catch (error) {
        console.error('Errore nella validazione delle date:', error);
        return true;
    }
  }

  // Funzione di validazione specifica per le sezioni (senza controllo sessioni)
  function validateDateConstraintsForSections(selectedDate, provisionalDates = []) {
    const selDate = new Date(selectedDate);
    selDate.setHours(0, 0, 0, 0);

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

    return { isValid: true };
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
      
      // Verifica il vincolo dei 14 giorni solo se il checkbox "Apertura appelli" è attivo
      const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${counter}`);
      if (showInCalendarCheckbox && showInCalendarCheckbox.checked) {
        if (!validateDateConstraints(newDate, counter)) {
          // Data non valida - non creare evento provvisorio
          return;
        }
      }
      
      // Data valida o checkbox disattivato - continua con la logica normale
      section.dataset.date = newDate;
      createProvisionalEventForDate(newDate, counter);
      
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
  function createProvisionalEventForDate(date, sectionNumber = null) {
    if (!window.calendar || !date) {
      return;
    }

    // Usa la funzione unificata importata da calendarUtils
    const provisionalEvent = window.creaEventoProvvisorio(date, window.calendar, window.provisionalEvents || [], sectionNumber);
    
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
  
  // Reset function
  function resetSections() {
    dateAppelliCounter = 0;
    selectedDates = [];
    const container = document.getElementById('dateAppelliContainer');
    if (container) {
      container.innerHTML = '';
    }
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
    
    // Aggiungi event listener per i checkbox "Apertura appelli" esistenti
    for (let i = 1; i <= 4; i++) {
        const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${i}`);
        
        if (showInCalendarCheckbox) {
            // Assicurati che sia selezionato per default se non ha un valore salvato
            if (!showInCalendarCheckbox.hasAttribute('data-user-modified')) {
                showInCalendarCheckbox.checked = true;
            }
            
            // Marca come modificato dall'utente quando viene cambiato
            showInCalendarCheckbox.addEventListener('change', function() {
                this.setAttribute('data-user-modified', 'true');
                validateAllDates();
            });
        }
    }
    
    // Aggiungi il pulsante per aggiungere nuove date
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'add-date-btn';
    addButton.innerHTML = '<span class="material-symbols-outlined">add</span> Aggiungi data appello';
    addButton.addEventListener('click', () => addDateSection());
    
    container.appendChild(addButton);
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
    aggiornaVerbalizzazioneForSection,
    validateAllDates
  };
}());

// Esponi il modulo globalmente
window.EsameAppelli = EsameAppelli;

// Funzione globale per la rimozione delle sezioni (per compatibilità)
window.removeDateSection = function(sectionId) {
  EsameAppelli.removeDateSection(sectionId);
};