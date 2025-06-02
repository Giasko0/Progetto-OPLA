// Script per la gestione dei controlli e validazioni del form esame
const FormEsameControlli = (function() {
  // Verifica che FormEsameUtils sia caricato
  if (!window.FormEsameUtils) {
    throw new Error('FormEsameUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameControlli.js');
  }

  // Importa utilità da FormEsameUtils
  const {
    validateFormField,
    validators,
    getCommonValidationRules,
    showValidationError,
    checkUserPermissions
  } = window.FormEsameUtils;

  // Configurazione validatori e regole
  const validaOraAppello = validators.oraAppello;
  const validaDurataEsame = validators.durataEsame;
  const validaGiornoSettimana = validators.giornoSettimana;
  const formValidationRules = getCommonValidationRules();

  // Funzioni spostate da formEsameUtils.js

  // Controlla se l'utente è un amministratore
  async function isUserAdmin() {
    if (!window.FormEsameUtils) return false;
    
    try {
      const permissions = await window.FormEsameUtils.checkUserPermissions();
      return permissions.isAdmin;
    } catch (error) {
      console.error('Errore nel controllo permessi admin:', error);
      return false;
    }
  }

  // Funzioni per invio messaggi alla sidebar
  const showError = (message) => window.showMessage(message, 'Errore di validazione', 'error');
  const showWarning = (message) => window.showMessage(message, 'Attenzione', 'warning');

  // Configura i gestori per combinare i valori di ora e durata
  function setupTimeCombiningHandlers() {
    const form = document.getElementById("formEsame");
    if (!form) return;
    
    // Combina l'ora al submit del form
    form.addEventListener("submit", combineTimeValues);
    
    // Aggiungi anche al pulsante di bypass
    const bypassBtn = document.getElementById("bypassChecksBtn");
    if (bypassBtn) {
      bypassBtn.addEventListener("click", combineTimeValues);
    }
    
    // Aggiungi gestori per aggiornare i campi quando i valori cambiano
    const ora_h = document.getElementById("ora_h");
    const ora_m = document.getElementById("ora_m");
    const durata_h = document.getElementById("durata_h");
    const durata_m = document.getElementById("durata_m");
    
    if (ora_h && ora_m) {
      ora_h.addEventListener("change", combineTimeValues);
      ora_m.addEventListener("change", combineTimeValues);
    }
    
    if (durata_h && durata_m) {
      durata_h.addEventListener("change", combineDurataValues);
      durata_m.addEventListener("change", combineDurataValues);
    }
  }

  // Combina i valori di ora e durata
  function combineTimeValues() {
    // Combina ora_h e ora_m in ora (formato HH:MM)
    const ora_h = document.getElementById('ora_h')?.value;
    const ora_m = document.getElementById('ora_m')?.value;
    if (ora_h && ora_m) {
      const oraField = document.getElementById('ora');
      if (oraField) oraField.value = `${ora_h}:${ora_m}`;
    }
    
    // Combina anche per le sezioni multiple
    const dateSections = document.querySelectorAll('.date-appello-section');
    dateSections.forEach(section => {
      const counter = section.id.split('_')[1];
      const oraH = document.getElementById(`ora_h_${counter}`);
      const oraM = document.getElementById(`ora_m_${counter}`);
      
      if (oraH && oraM && oraH.value && oraM.value) {
        const oraField = document.getElementById(`ora_${counter}`);
        if (oraField) {
          oraField.value = `${oraH.value}:${oraM.value}`;
        }
      }
    });
    
    // Converte durata_h e durata_m in durata totale in minuti
    combineDurataValues();
  }

  // Funzione specifica per combinare solo i valori della durata
  function combineDurataValues() {
    const durata_h = parseInt(document.getElementById('durata_h')?.value) || 0;
    const durata_m = parseInt(document.getElementById('durata_m')?.value) || 0;
    const durata_totale = (durata_h * 60) + durata_m;
    
    const durataField = document.getElementById('durata');
    if (durataField) durataField.value = durata_totale.toString();
  }

  // Gestisce l'invio del form con bypass dei controlli
  async function handleBypassChecksSubmit() {
    const isAdmin = await isUserAdmin();
    if (isAdmin) {
      window.FormEsameData.submitFormData({ bypassChecks: true });
    } else {
      showError('Non hai i permessi per bypassare i controlli di validazione');
    }
  }

  // Gestisce l'invio standard del form
  function handleFormSubmit(e) {
    e.preventDefault();

    // Combina ora e durata
    combineTimeValues();

    // Controlla se ci sono campi data con errori di validazione
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showError("Correggi gli errori nelle date prima di inviare il form");
      errorFields[0].focus();
      return;
    }

    // Validazione usando le regole unificate
    const firstDateValue = getFirstDateValue();
    const firstTimeValue = getFirstTimeValue();
    const durationValue = getDurationValue();
    
    if (firstDateValue && !validaGiornoSettimana(firstDateValue)) {
      showError("Non è possibile inserire esami di sabato o domenica");
      return;
    }
    
    if (firstTimeValue && !validaOraAppello(firstTimeValue)) {
      showError("L'ora dell'appello deve essere compresa tra le 08:00 e le 23:00");
      return;
    }
    
    if (durationValue && !validaDurataEsame(durationValue)) {
      showError("La durata dell'esame deve essere di almeno 30 minuti e non superiore a 480 minuti (8 ore)");
      return;
    }

    // Validazione aula
    const firstAulaSelect = document.querySelector('[id^="aula_"]');
    if (firstAulaSelect && !firstAulaSelect.value) {
      showError("Seleziona un'aula disponibile");
      return;
    }

    window.FormEsameData.submitFormData();
  }

  // Valida un singolo campo del form
  function validateSingleField(fieldId, value, ruleName) {
    const rule = formValidationRules[ruleName];
    if (!rule) return { isValid: true };
    
    return validateFormField(ruleName, value, formValidationRules);
  }

  // Valida tutti i campi del form
  function validateAllFields() {
    const errors = [];
    
    // Validazione data
    const dateValue = getFirstDateValue();
    const dateValidation = validateSingleField('dataora', dateValue, 'giorno_settimana');
    if (!dateValidation.isValid) {
      errors.push(dateValidation.message);
    }
    
    // Validazione ora
    const timeValue = getFirstTimeValue();
    const timeValidation = validateSingleField('ora', timeValue, 'ora_appello');
    if (!timeValidation.isValid) {
      errors.push(timeValidation.message);
    }
    
    // Validazione durata
    const durationValue = getDurationValue();
    const durationValidation = validateSingleField('durata', durationValue, 'durata_esame');
    if (!durationValidation.isValid) {
      errors.push(durationValidation.message);
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Valida i campi obbligatori
  function validateRequiredFields() {
    const requiredFields = [
      { id: 'descrizione', name: 'Descrizione' },
      { selector: '[id^="dataora_"]', name: 'Data appello' },
      { selector: '[id^="ora_h_"]', name: 'Ora appello' },
      { selector: '[id^="durata_h_"]', name: 'Durata' },
      { selector: '[id^="aula_"]', name: 'Aula' }
    ];
    
    const missingFields = [];
    
    requiredFields.forEach(field => {
      let element;
      if (field.id) {
        element = document.getElementById(field.id);
      } else if (field.selector) {
        element = document.querySelector(field.selector);
      }
      
      if (!element || !element.value || element.value.trim() === '') {
        missingFields.push(field.name);
      }
    });
    
    return {
      isValid: missingFields.length === 0,
      missingFields: missingFields
    };
  }

  // Evidenzia i campi con errori
  function highlightErrorFields(fieldIds) {
    // Rimuovi evidenziazione precedente
    document.querySelectorAll('.form-input-error').forEach(field => {
      field.classList.remove('form-input-error');
    });
    
    // Evidenzia i campi con errori
    fieldIds.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.classList.add('form-input-error');
      }
    });
  }

  // Rimuovi evidenziazione errori
  function clearErrorHighlights() {
    document.querySelectorAll('.form-input-error').forEach(field => {
      field.classList.remove('form-input-error');
    });
  }

  // Funzioni helper per la validazione del form (spostate da FormEsameUtils)
  function getFirstDateValue() {
    const firstDateInput = document.querySelector('[id^="dataora_"]');
    return firstDateInput ? firstDateInput.value : null;
  }

  function getFirstTimeValue() {
    const firstOraH = document.querySelector('[id^="ora_h_"]');
    const firstOraM = document.querySelector('[id^="ora_m_"]');
    if (firstOraH && firstOraM && firstOraH.value && firstOraM.value) {
      return `${firstOraH.value}:${firstOraM.value}`;
    }
    return null;
  }

  function getDurationValue() {
    const durataField = document.getElementById("durata");
    return durataField ? durataField.value : null;
  }

  // Aggiorna le opzioni di verbalizzazione in base al tipo di appello
  function aggiornaVerbalizzazione() {
    const tipoAppelloPP = document.getElementById("tipoAppelloPP");
    const verbalizzazioneSelect = document.getElementById("verbalizzazione");

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

  // Interfaccia pubblica
  return {
    setupTimeCombiningHandlers,
    combineTimeValues,
    combineDurataValues,
    isUserAdmin,
    handleBypassChecksSubmit,
    handleFormSubmit,
    validateSingleField,
    validateAllFields,
    validateRequiredFields,
    highlightErrorFields,
    clearErrorHighlights,
    // Funzioni di validazione helper
    getFirstDateValue,
    getFirstTimeValue,
    getDurationValue,
    aggiornaVerbalizzazione,
    // Esporta anche i validatori per uso esterno
    validators: {
      validaOraAppello,
      validaDurataEsame,
      validaGiornoSettimana
    },
    formValidationRules
  };
}());

// Esportazione globale
window.FormEsameControlli = FormEsameControlli;