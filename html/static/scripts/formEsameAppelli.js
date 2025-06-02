// Script per la gestione delle sezioni appelli del form esame
const FormEsameAppelli = (function() {
  // Verifica che FormEsameUtils sia caricato
  if (!window.FormEsameUtils) {
    throw new Error('FormEsameUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameAppelli.js');
  }

  // Importa utilità da FormEsameUtils
  const {
    formatDateForInput,
    loadAuleForDateTime,
    populateAulaSelect,
    validateExamDate,
    createProvisionalEvent,
    removeProvisionalEvent
  } = window.FormEsameUtils;

  // Funzioni per invio messaggi alla sidebar
  const showError = (message) => window.showMessage(message, 'Errore', 'error');
  const showWarning = (message) => window.showMessage(message, 'Attenzione', 'warning');

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

    // Template semplice e funzionale
    section.innerHTML = `
      <div class="form-group">
        <label for="dataora_${sectionNumber}">Data appello:</label>
        <input type="date" id="dataora_${sectionNumber}" name="dataora_${sectionNumber}" class="form-control" value="${date}">
      </div>
      <div class="form-row">
        <div class="form-group col-md-3">
          <label for="ora_h_${sectionNumber}">Ora:</label>
          <select id="ora_h_${sectionNumber}" name="ora_h_${sectionNumber}" class="form-control">
            ${Array.from({length: 16}, (_, i) => i + 8).map(h => 
              `<option value="${h.toString().padStart(2, '0')}">${h.toString().padStart(2, '0')}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group col-md-3">
          <label for="ora_m_${sectionNumber}">Minuti:</label>
          <select id="ora_m_${sectionNumber}" name="ora_m_${sectionNumber}" class="form-control">
            <option value="00">00</option>
            <option value="15">15</option>
            <option value="30">30</option>
            <option value="45">45</option>
          </select>
        </div>
        <div class="form-group col-md-6">
          <label for="aula_${sectionNumber}">Aula:</label>
          <select id="aula_${sectionNumber}" name="aula_${sectionNumber}" class="form-control">
            <option value="">Seleziona un'aula...</option>
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-danger btn-sm" onclick="FormEsameAppelli.removeDateSection('${sectionId}')">
        Rimuovi questa data
      </button>
    `;

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
    
    // Usa la funzione di validazione centralizzata
    const validationResult = window.isDateValid(new Date(newDate), getDateValide(), otherSectionDates);
    
    if (!validationResult.isValid) {
      if (dateInput) {
        dateInput.classList.add('form-input-error');
      }
      
      showError(validationResult.message);
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
  
  // Aggiorna le aule disponibili per una sezione specifica
  function updateAuleForSection(sectionId) {
    const dataInput = document.getElementById(`dataora_${sectionId}`);
    const oraH = document.getElementById(`ora_h_${sectionId}`);
    const oraM = document.getElementById(`ora_m_${sectionId}`);
    const aulaSelect = document.getElementById(`aula_${sectionId}`);
    
    if (!dataInput || !oraH || !oraM || !aulaSelect) return;
    
    const data = dataInput.value;
    const ora = `${oraH.value}:${oraM.value}`;
    
    if (data && oraH.value && oraM.value) {
      const periodo = determinaPeriodo(ora);
      
      if (window.FormEsameUtils && window.FormEsameUtils.loadAuleForDateTime) {
        window.FormEsameUtils.loadAuleForDateTime(data, periodo)
          .then(aule => {
            if (window.FormEsameUtils.populateAulaSelect) {
              window.FormEsameUtils.populateAulaSelect(aulaSelect, aule);
            }
          })
          .catch(() => {
            showError('Errore nel caricamento aule');
            aulaSelect.innerHTML = '<option value="">Errore nel caricamento aule</option>';
          });
      }
    }
  }

  // Determina il periodo della giornata
  function determinaPeriodo(ora) {
    const [hours] = ora.split(':').map(Number);
    if (hours < 12) return 'mattina';
    if (hours < 17) return 'pomeriggio';
    return 'sera';
  }

  function initializeDateSections() {
    const existingSections = document.querySelectorAll('.date-appello-section');
    existingSections.forEach(section => {
      const counter = section.id.split('_')[1];
      if (counter) {
        setupDateSectionListeners(section.id, parseInt(counter));
      }
    });
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

  // Interfaccia pubblica estesa
  return {
    addDateSection,
    removeDateSection,
    renumberDateSections,
    setupDateSectionListeners,
    validateDateConstraints,
    handleDateInputChange,
    updateAuleForSection,
    determinaPeriodo,
    initializeDateSections,
    collectSectionsData,
    populateSectionsWithData,
    reset,
    // Getters
    getSelectedDates: () => selectedDates,
    getDateAppelliCounter: () => dateAppelliCounter
  };
}());

// Esportazione globale
window.FormEsameAppelli = FormEsameAppelli;