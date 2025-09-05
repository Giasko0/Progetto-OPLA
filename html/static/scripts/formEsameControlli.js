// Modulo per la gestione della validazione e controlli del form esame
const FormEsameControlli = (function() {

  // Validatori essenziali
  const validators = {
    oraAppello: (ora) => {
      if (!ora) return false;
      const [hours] = ora.split(":").map(Number);
      return hours >= 8 && hours <= 18;
    },
    
    durataEsame: (durataMinuti) => {
      if (!durataMinuti || durataMinuti === '' || durataMinuti === null) {
        return true; // Durata opzionale
      }
      const durata = parseInt(durataMinuti, 10);
      return durata >= 30 && durata <= 720;
    },
    
    giornoSettimana: (data) => {
      const giorno = new Date(data).getDay();
      return giorno !== 0 && giorno !== 6;
    }
  };

  // Regole di validazione
  function getCommonValidationRules() {
    return {
      ora_appello: {
        required: true,
        validator: validators.oraAppello,
        requiredMessage: "L'ora dell'appello è obbligatoria",
        invalidMessage: "L'ora dell'appello deve essere compresa tra le 08:00 e le 18:00"
      },
      durata_esame: {
        required: false,
        validator: validators.durataEsame,
        requiredMessage: "La durata dell'esame è opzionale",
        invalidMessage: "La durata dell'esame, se specificata, deve essere di almeno 30 minuti e non superiore a 720 minuti"
      },
      giorno_settimana: {
        required: true,
        validator: validators.giornoSettimana,
        requiredMessage: "La data dell'appello è obbligatoria",
        invalidMessage: "Non è possibile inserire esami di sabato o domenica"
      }
    };
  }

  // Validazione semplificata
  function validateFormField(field, value, validationRules) {
    const rule = validationRules[field];
    if (!rule) return { isValid: true };
    
    if (rule.required && (!value || value.trim() === '')) {
      return { isValid: false, message: rule.requiredMessage };
    }
    
    if (rule.validator && !rule.validator(value)) {
      return { isValid: false, message: rule.invalidMessage };
    }
    
    return { isValid: true };
  }

  // Gestione messaggi di errore
  function showValidationError(message) {
    if (window.showMessage) {
      window.showMessage(message, "Errore di validazione", "warning");
    }
  }

  // Configurazione validatori e regole
  const formValidationRules = getCommonValidationRules();

  // Helper functions per la validazione - aggiornate per sezioni modulari
  function getFirstDateValue() {
    const firstDateInput = document.querySelector('[id^="dataora_"]');
    return firstDateInput.value;
  }

  function getFirstTimeValue() {
    const firstOraH = document.querySelector('[id^="ora_h_"]');
    const firstOraM = document.querySelector('[id^="ora_m_"]');
    return `${firstOraH.value}:${firstOraM.value}`;
  }

  function getDurationValue() {
    const firstDurataField = document.querySelector('[id^="durata_"]');
    return firstDurataField.value;
  }

  // Controlla se l'utente è un amministratore
  async function isUserAdmin() {
    try {
      const data = await window.getUserData();
      return data.authenticated && data.user_data?.permessi_admin;
    } catch (error) {
      return false;
    }
  }

  // Validazione standard del form
  function validateForm() {
    // Controlla errori di validazione delle date
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di inviare il form");
      errorFields[0].focus();
      return false;
    }

    // Verifica sezioni valide
    const dateSections = document.querySelectorAll('.date-appello-section');
    if (dateSections.length === 0) {
      showValidationError("Aggiungi almeno una sezione di appello");
      return false;
    }

    // Validazione semplificata per ogni sezione
    for (let i = 0; i < dateSections.length; i++) {
      const section = dateSections[i];
      const sectionNumber = i + 1;

      if (!validateSectionFields(section, sectionNumber)) {
        return false;
      }
    }

    // Verifica insegnamenti
    return validateInsegnamenti();
  }

  // Validazione che la data sia in una sessione valida
  function isDateInSession(dateStr, section) {
    if (!window.isDateValid) return true; // fallback se non disponibile
    
    // Controlla se è una prova parziale non ufficiale
    if (section && section.dataset.isNonOfficialPartial === 'true') {
      return true; // Salta controllo sessioni per prove parziali non ufficiali
    }
    
    // Controlla anche dai valori del form se non c'è il dataset
    if (section) {
      const sectionIdMatch = section.id.match(/dateSection_(\d+)/);
      const counter = sectionIdMatch ? sectionIdMatch[1] : '1';
      
      const tipoAppelloPP = section.querySelector(`#tipoAppelloPP_${counter}`);
      const showInCalendarCheckbox = section.querySelector(`#mostra_nel_calendario_${counter}`);
      
      // Se è PP e non mostra nel calendario, è prova parziale non ufficiale
      if (tipoAppelloPP?.checked && !showInCalendarCheckbox?.checked) {
        return true;
      }
    }
    
    const result = window.isDateValid(dateStr, window.sessioniPartiOriginali || []);
    return result && result.isValid;
  }

  // Funzione helper per validare i campi di una sezione
  function validateSectionFields(section, sectionNumber) {
    const fields = {
      descrizione: section.querySelector(`[id^="descrizione_"]`).value,
      dataora: section.querySelector(`[id^="dataora_"]`).value,
      ora_h: section.querySelector(`[id^="ora_h_"]`)?.value,
      ora_m: section.querySelector(`[id^="ora_m_"]`)?.value,
      ora: (() => {
        const ora_h = section.querySelector(`[id^="ora_h_"]`)?.value;
        const ora_m = section.querySelector(`[id^="ora_m_"]`)?.value;
        return (ora_h && ora_m) ? `${ora_h}:${ora_m}` : "";
      })(),
      aula: section.querySelector(`[id^="aula_"]`).value,
      durata_h: section.querySelector(`[id^="durata_h_"]`).value,
      durata_m: section.querySelector(`[id^="durata_m_"]`).value
    };

    // Verifica campi obbligatori
    const requiredFields = [
      { field: 'descrizione', message: 'Inserisci una descrizione' },
      { field: 'dataora', message: 'Seleziona una data' },
      { field: 'ora_h', message: 'Seleziona un orario' },
      { field: 'ora_m', message: 'Seleziona un orario' }
    ];

    for (const { field, message } of requiredFields) {
      if (typeof fields[field] === "undefined" || !fields[field] || (typeof fields[field] === "string" && fields[field].trim() === "")) {
        showValidationError(`Appello ${sectionNumber}: ${message}`);
        return false;
      }
    }

    // Validazione regole specifiche
    const validationResults = {
      giorno_settimana: validateFormField('giorno_settimana', fields.dataora, formValidationRules),
      ora_appello: validateFormField('ora_appello', fields.ora, formValidationRules)
    };

    for (const [field, result] of Object.entries(validationResults)) {
      if (!result.isValid) {
        showValidationError(`Appello ${sectionNumber}: ${result.message}`);
        return false;
      }
    }

    // Validazione durata (opzionale)
    const durataH = parseInt(fields.durata_h) || 0;
    const durataM = parseInt(fields.durata_m) || 0;
    const durataTotale = (durataH * 60) + durataM;
    
    // Solo se la durata è specificata, deve essere valida
    if (durataTotale > 0 && (durataTotale < 30 || durataTotale > 720)) {
      showValidationError(`Appello ${sectionNumber}: La durata, se specificata, deve essere tra 30 minuti e 12 ore`);
      return false;
    }

    // Validazione ora specifica (8-18) come nel backend
    const oraH = parseInt(fields.ora_h);
    if (oraH < 8 || oraH > 18) {
      showValidationError(`Appello ${sectionNumber}: L'ora deve essere compresa tra le 08:00 e le 18:00`);
      return false;
    }

    // La data deve essere in una sessione valida (solo se non è prova parziale non ufficiale)
    if (!isDateInSession(fields.dataora, section)) {
      showValidationError(`Appello ${sectionNumber}: La data non è all'interno di una sessione valida.`);
      return false;
    }

    return true;
  }

  // Validazione insegnamenti semplificata
  function validateInsegnamenti() {
    let insegnamentiSelected = [];
    if (window.InsegnamentiManager?.getSelectedInsegnamenti) {
      insegnamentiSelected = window.InsegnamentiManager.getSelectedInsegnamenti();
    } else {
      const insegnamentoSelect = document.getElementById('insegnamento');
      insegnamentiSelected = Array.from(insegnamentoSelect.selectedOptions).map(option => option.value);
    }
    
    if (!insegnamentiSelected.length) {
      showValidationError("Seleziona almeno un insegnamento");
      return false;
    }

    return true;
  }

  // Validazione con bypass
  function validateFormWithBypass() {
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di inviare il form, anche con bypass");
      errorFields[0].focus();
      return false;
    }

    const dateSections = document.querySelectorAll('.date-appello-section');
    if (dateSections.length === 0) {
      showValidationError("Aggiungi almeno una sezione di appello");
      return false;
    }

    // Controllo minimo per bypass - solo campi obbligatori e weekend
    for (let i = 0; i < dateSections.length; i++) {
      const section = dateSections[i];
      const sectionNumber = i + 1;
      
      const dataora = section.querySelector(`[id^="dataora_"]`)?.value;
      const ora_h = section.querySelector(`[id^="ora_h_"]`)?.value;
      const ora_m = section.querySelector(`[id^="ora_m_"]`)?.value;
      const aula = section.querySelector(`[id^="aula_"]`)?.value;
      
      // Campi obbligatori sempre necessari
      if (!dataora || !ora_h || !ora_m || !aula) {
        showValidationError(`Appello ${sectionNumber}: Compila almeno i campi obbligatori (data, ora, aula)`);
        return false;
      }
      
      // Weekend sempre bloccato anche con bypass
      const bypassValidationResult = validateFormField('giorno_settimana', dataora, formValidationRules);
      if (!bypassValidationResult.isValid) {
        showValidationError(`Appello ${sectionNumber}: ${bypassValidationResult.message}`);
        return false;
      }
    }

    return validateInsegnamenti();
  }

  // Validazione per modalità modifica semplificata
  function validateFormForEdit() {
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di modificare l'esame");
      errorFields[0].focus();
      return false;
    }

    const firstSection = document.querySelector('.date-appello-section');
    if (!firstSection) {
      showValidationError("Nessuna sezione di appello trovata");
      return false;
    }

    return validateSectionFields(firstSection, 1);
  }

  // Validazione bypass per modifica
  function validateFormForEditWithBypass() {
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di modificare, anche con bypass");
      errorFields[0].focus();
      return false;
    }

    const firstSection = document.querySelector('.date-appello-section');
    if (!firstSection) {
      showValidationError("Nessuna sezione di appello trovata");
      return false;
    }

    const dataora = firstSection.querySelector('[id^="dataora_"]').value;
    const ora_h = firstSection.querySelector('[id^="ora_h_"]').value;
    const ora_m = firstSection.querySelector('[id^="ora_m_"]').value;
    const aula = firstSection.querySelector('[id^="aula_"]').value;

    if (!dataora || !ora_h || !ora_m || !aula) {
      showValidationError("Compila almeno i campi obbligatori");
      return false;
    }

    // Weekend sempre bloccato anche con bypass
    const editBypassValidationResult = validateFormField('giorno_settimana', dataora, formValidationRules);
    if (!editBypassValidationResult.isValid) {
      showValidationError(editBypassValidationResult.message);
      return false;
    }

    return true;
  }

  // Interfaccia pubblica aggiornata
  return {
    getFirstDateValue,
    getFirstTimeValue,
    getDurationValue,
    isUserAdmin,
    validateForm,
    validateFormWithBypass,
    validateFormForEdit,
    validateFormForEditWithBypass,
    validateFormField,
    validators,
    getCommonValidationRules,
    showValidationError
  };
}());

// Espone il modulo globalmente
window.FormEsameControlli = FormEsameControlli;