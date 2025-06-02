// Utilità comuni per la gestione dei form
const FormEsameUtils = (function() {
  
  // Funzione unificata per impostare valori degli elementi
  function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value;
    }
  }

  // Funzione unificata per radio buttons
  function setRadioValue(name, value) {
    const radio = document.getElementById(`${name.replace('_radio', '')}${value}`);
    if (radio) radio.checked = true;
  }

  // Funzione unificata per checkbox
  function setCheckboxValue(id, value) {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = value === true || value === 'true';
    }
  }

  // Funzione helper per gestire la visualizzazione dei messaggi di errore
  function showValidationError(message) {
    if (window.showMessage) {
      window.showMessage(message, "Errore di validazione", "error");
    }
  }

  // Funzione helper per mostrare messaggi di successo/operazione completata
  function showOperationMessage(message, title, type, options = {}) {
    if (window.showMessage) {
      window.showMessage(message, title, type, options);
    }
  }

  // Funzione unificata per la validazione
  function validateFormField(field, value, validationRules) {
    const rule = validationRules[field];
    if (!rule) return { isValid: true };
    
    if (rule.required && (!value || value.trim() === '')) {
      return { isValid: false, message: rule.requiredMessage || `${field} è obbligatorio` };
    }
    
    if (rule.validator && !rule.validator(value)) {
      return { isValid: false, message: rule.invalidMessage || `${field} non è valido` };
    }
    
    return { isValid: true };
  }

  // Validatori comuni
  const validators = {
    oraAppello: function(ora) {
      if (!ora) return false;
      const [hours, minutes] = ora.split(":").map(Number);
      return hours >= 8 && hours <= 23;
    },
    
    durataEsame: function(durataMinuti) {
      if (!durataMinuti) return false;
      const durata = parseInt(durataMinuti, 10);
      return durata >= 30 && durata <= 480; // min 30 minuti, max 8 ore (480 minuti)
    },
    
    giornoSettimana: function(data) {
      const giorno = new Date(data).getDay();
      return giorno !== 0 && giorno !== 6; // 0 = domenica, 6 = sabato
    }
  };

  // Regole di validazione comuni
  function getCommonValidationRules() {
    return {
      ora_appello: {
        required: true,
        validator: validators.oraAppello,
        requiredMessage: "L'ora dell'appello è obbligatoria",
        invalidMessage: "L'ora dell'appello deve essere compresa tra le 08:00 e le 23:00"
      },
      durata_esame: {
        required: true,
        validator: validators.durataEsame,
        requiredMessage: "La durata dell'esame è obbligatoria",
        invalidMessage: "La durata dell'esame deve essere di almeno 30 minuti e non superiore a 480 minuti (8 ore)"
      },
      giorno_settimana: {
        required: true,
        validator: validators.giornoSettimana,
        requiredMessage: "La data dell'appello è obbligatoria",
        invalidMessage: "Non è possibile inserire esami di sabato o domenica"
      }
    };
  }

  // Gestore unificato degli event listener
  function setupEventListeners(eventListeners) {
    eventListeners.forEach(({ id, event, handler }) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener(event, handler); // Rimuovi listener esistenti
        element.addEventListener(event, handler);
      }
    });
  }

  // Helper per impostare la durata da minuti
  function setDurationFromMinutes(durataMinuti) {
    const durata = parseInt(durataMinuti);
    if (!isNaN(durata)) {
      const ore = Math.floor(durata / 60);
      const minuti = durata % 60;
      
      const durataH = document.getElementById("durata_h");
      const durataM = document.getElementById("durata_m");
      const durataField = document.getElementById("durata");
      
      if (durataH) durataH.value = ore.toString();
      if (durataM) durataM.value = minuti.toString().padStart(2, '0');
      if (durataField) durataField.value = durata.toString();
    }
  }

  // Gestione preferenze semplificata
  function saveFormPreference(username, formType, preferenceName, preferences) {
    return fetch('/api/salvaPreferenzaForm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, form_type: formType, name: preferenceName, preferences })
    }).then(response => response.json());
  }

  function loadFormPreferences(username, formType) {
    return fetch(`/api/caricaPreferenzeForm?username=${username}&form_type=${formType}`)
      .then(response => response.json())
      .then(data => data.preferences || []);
  }

  function deleteFormPreference(username, id) {
    return fetch('/api/eliminaPreferenzaForm', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, id })
    }).then(response => response.json());
  }

  function resetForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
      form.reset();
      const multiSelectBoxes = form.querySelectorAll('.multi-select-box');
      multiSelectBoxes.forEach(box => {
        box.innerHTML = '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
      });
    }
  }

  // Gestione date e ora comuni
  function parseTimeString(timeString) {
    if (!timeString) return null;
    
    const timeParts = timeString.split(':');
    if (timeParts.length >= 2) {
      return {
        hours: timeParts[0],
        minutes: timeParts[1]
      };
    }
    return null;
  }

  function formatTimeFromHourMinute(hours, minutes) {
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // Validazione date comuni
  function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  function isWeekday(dateString) {
    const date = new Date(dateString);
    const day = date.getDay();
    return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
  }

  // Gestione aule semplificata
  function loadAuleForDateTime(data, periodo) {
    return fetch(`/api/get-aule-disponibili?data=${data}&periodo=${periodo}`)
      .then(response => response.json())
      .then(data => data.aule || []);
  }

  function populateAulaSelect(selectElement, aule) {
    if (!selectElement) return;
    
    selectElement.innerHTML = '<option value="">Seleziona un\'aula...</option>';
    selectElement.innerHTML += '<option value="STUDIO_DOCENTE">Studio del docente</option>';
    
    aule.forEach(aula => {
      const option = document.createElement('option');
      option.value = aula.codice;
      option.textContent = `${aula.codice} - ${aula.descrizione}`;
      selectElement.appendChild(option);
    });
  }

  // Gestione permessi utente
  async function checkUserPermissions() {
    try {
      const data = await getUserData();
      return {
        isAuthenticated: data.authenticated,
        isAdmin: data.authenticated && data.user_data && data.user_data.permessi_admin,
        username: data.user_data?.username
      };
    } catch (error) {
      console.error("Errore nel controllo dei permessi:", error);
      return { isAuthenticated: false, isAdmin: false, username: null };
    }
  }

  // Helper per la gestione di popup/modal
  function createConfirmationDialog(config) {
    const {
      id = 'confirmation-dialog',
      title = 'Conferma',
      content = '',
      confirmText = 'Conferma',
      cancelText = 'Annulla',
      onConfirm = () => {},
      onCancel = () => {}
    } = config;

    // Rimuovi dialog esistente se presente
    const existingDialog = document.getElementById(id);
    if (existingDialog) {
      existingDialog.remove();
    }

    const dialogContainer = document.createElement("div");
    dialogContainer.id = id;
    dialogContainer.className = "specific-confirmation-overlay";
    dialogContainer.style.display = "flex";

    const dialogContent = document.createElement("div");
    dialogContent.className = "specific-confirmation-panel";

    const header = document.createElement("div");
    header.className = "specific-confirmation-header";
    header.innerHTML = `
      <h2>${title}</h2>
      <span class="form-close">&times;</span>
    `;

    const body = document.createElement("div");
    body.className = "specific-confirmation-body";
    body.innerHTML = content;

    const footer = document.createElement("div");
    footer.className = "specific-confirmation-footer";
    footer.innerHTML = `
      <button class="invia confirm-btn">${confirmText}</button>
      <button class="invia cancel-btn" style="background-color: #6c757d;">${cancelText}</button>
    `;

    dialogContent.appendChild(header);
    dialogContent.appendChild(body);
    dialogContent.appendChild(footer);
    dialogContainer.appendChild(dialogContent);

    document.body.appendChild(dialogContainer);

    // Event listeners
    const removeDialog = () => {
      if (document.body.contains(dialogContainer)) {
        document.body.removeChild(dialogContainer);
      }
    };

    header.querySelector('.form-close').addEventListener('click', () => {
      removeDialog();
      onCancel();
    });

    footer.querySelector('.confirm-btn').addEventListener('click', () => {
      removeDialog();
      onConfirm();
    });

    footer.querySelector('.cancel-btn').addEventListener('click', () => {
      removeDialog();
      onCancel();
    });

    return { dialog: dialogContainer, remove: removeDialog };
  }

  // Utilità per formati di data
  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Gestione dei dati utente
  async function getUserData() {
    try {
      const response = await fetch('/api/get_user_data');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Errore nel recupero dei dati utente:', error);
      throw error;
    }
  }

  // Gestione template HTML
  async function loadHTMLTemplate(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error(`Errore nel caricamento del template ${url}:`, error);
      throw error;
    }
  }

  // Gestione eventi provvisori del calendario
  function createProvisionalEvent(date, calendar, provisionalEvents = []) {
    if (!calendar || !date) return null;

    // Verifica se esiste già un evento per questa data
    const existingEvent = provisionalEvents.find(event => 
      event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
    );
    
    if (existingEvent) {
      return existingEvent;
    }

    const provisionalEvent = {
      id: `provisional-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: 'Nuovo esame (bozza)',
      start: date,
      allDay: true,
      backgroundColor: '#007bff',
      borderColor: '#0056b3',
      textColor: '#ffffff',
      className: 'provisional-event',
      extendedProps: {
        isProvisional: true,
        formSectionDate: date
      }
    };

    calendar.addEvent(provisionalEvent);
    provisionalEvents.push(provisionalEvent);
    
    return provisionalEvent;
  }

  function removeProvisionalEvent(eventId, calendar, provisionalEvents = []) {
    const event = calendar.getEventById(eventId);
    if (event) {
      event.remove();
    }
    
    const index = provisionalEvents.findIndex(e => e.id === eventId);
    if (index > -1) {
      provisionalEvents.splice(index, 1);
    }
  }

  function clearAllProvisionalEvents(calendar, provisionalEvents = []) {
    provisionalEvents.forEach(event => {
      const calendarEvent = calendar.getEventById(event.id);
      if (calendarEvent) {
        calendarEvent.remove();
      }
    });
    provisionalEvents.length = 0;
  }

  // Utilità per la gestione delle sezioni modulari
  function processHTMLTemplate(template, replacements) {
    let processedTemplate = template;
    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedTemplate = processedTemplate.replace(regex, value);
    });
    return processedTemplate;
  }

  // Gestione validazione avanzata per esami
  function validateExamDate(dateString, existingDates = [], excludeWeekends = true) {
    if (!dateString) {
      return { isValid: false, message: "La data è obbligatoria" };
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return { isValid: false, message: "Formato data non valido" };
    }

    if (excludeWeekends && !isWeekday(dateString)) {
      return { isValid: false, message: "Non è possibile inserire esami di sabato o domenica" };
    }

    // Verifica duplicati
    if (existingDates.includes(dateString)) {
      return { isValid: false, message: "Data già selezionata" };
    }

    return { isValid: true };
  }

  function validateExamTime(timeString) {
    if (!timeString) {
      return { isValid: false, message: "L'ora è obbligatoria" };
    }

    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      return { isValid: false, message: "Formato ora non valido" };
    }

    if (hours < 8 || hours > 23) {
      return { isValid: false, message: "L'ora deve essere compresa tra le 08:00 e le 23:00" };
    }

    return { isValid: true };
  }

  // Utilità specifiche per il form esame
  
  // Gestione sezioni modulari per date e appelli
  function isValidDateFormat(dateString) {
    if (dateString.length !== 10) return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString === formatDateForInput(date);
  }

  // API pubblica - solo utilità generiche e funzioni core
  return {
    // Utilità base per form
    setElementValue,
    setRadioValue,
    setCheckboxValue,
    showValidationError,
    showOperationMessage,
    validateFormField,
    validators,
    getCommonValidationRules,
    setupEventListeners,
    
    // Utilità per date e ora
    setDurationFromMinutes,
    parseTimeString,
    formatTimeFromHourMinute,
    isValidDate,
    isWeekday,
    formatDateForInput,
    isValidDateFormat,
    
    // Gestione template e DOM
    loadHTMLTemplate,
    processHTMLTemplate,
    createConfirmationDialog,
    
    // Utilità per aule
    loadAuleForDateTime,
    populateAulaSelect,
    
    // Gestione utenti e permessi
    checkUserPermissions,
    getUserData,
    
    // Gestione preferenze (generica)
    saveFormPreference,
    loadFormPreferences,
    deleteFormPreference,
    resetForm,
    
    // Gestione eventi provvisori del calendario
    createProvisionalEvent,
    removeProvisionalEvent,
    clearAllProvisionalEvents,
    
    // Validazione esami
    validateExamDate,
    validateExamTime
  };
}());

// Esportazione globale
window.FormEsameUtils = FormEsameUtils;