// filepath: /home/giasko/Scrivania/UniPG/Tesi/Progetto-OPLA/html/static/scripts/formEsameControlli.js
// Modulo per la gestione della validazione e controlli del form esame
const FormEsameControlli = (function() {
  // Verifica che FormUtils sia caricato
  if (!window.FormUtils) {
    throw new Error('FormUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameControlli.js');
  }

  // Importa utilità da FormUtils
  const {
    validateFormField,
    validators,
    getCommonValidationRules,
    showValidationError,
    checkUserPermissions
  } = window.FormUtils;

  // Configurazione validatori e regole
  const formValidationRules = getCommonValidationRules();

  // Helper functions per la validazione - aggiornate per sezioni modulari
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
    const firstDurataField = document.querySelector('[id^="durata_"]');
    return firstDurataField ? firstDurataField.value : null;
  }

  // Controlla se l'utente è un amministratore
  async function isUserAdmin() {
    try {
      const permissions = await checkUserPermissions();
      return permissions.isAdmin;
    } catch (error) {
      console.error("Errore nel controllo dei permessi admin:", error);
      return false;
    }
  }

  // Validazione standard del form - aggiornata per sezioni modulari
  function validateForm() {
    // Controlla se ci sono campi data con errori di validazione
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di inviare il form");
      errorFields[0].focus();
      return false;
    }

    // Verifica che ci sia almeno una sezione di appello valida
    const dateSections = document.querySelectorAll('.date-appello-section');
    if (dateSections.length === 0) {
      showValidationError("Aggiungi almeno una sezione di appello");
      return false;
    }

    // Validazione per ogni sezione
    let hasValidSection = false;
    for (let i = 0; i < dateSections.length; i++) {
      const section = dateSections[i];
      const sectionNumber = i + 1;

      // Campi obbligatori per ogni sezione
      const descrizione = section.querySelector(`[id^="descrizione_"]`)?.value;
      const dataora = section.querySelector(`[id^="dataora_"]`)?.value;
      const ora_h = section.querySelector(`[id^="ora_h_"]`)?.value;
      const ora_m = section.querySelector(`[id^="ora_m_"]`)?.value;
      const aula = section.querySelector(`[id^="aula_"]`)?.value;
      const durata_h = section.querySelector(`[id^="durata_h_"]`)?.value;
      const durata_m = section.querySelector(`[id^="durata_m_"]`)?.value;

      // Verifica campi obbligatori
      if (!descrizione || !descrizione.trim()) {
        showValidationError(`Inserisci una descrizione per l'appello ${sectionNumber}`);
        return false;
      }

      if (!dataora) {
        showValidationError(`Seleziona una data per l'appello ${sectionNumber}`);
        return false;
      }

      if (!ora_h || !ora_m) {
        showValidationError(`Seleziona un orario per l'appello ${sectionNumber}`);
        return false;
      }

      if (!aula) {
        showValidationError(`Seleziona un'aula per l'appello ${sectionNumber}`);
        return false;
      }

      // Validazione giorno settimana per questa sezione
      const validationResults = {
        giorno_settimana: validateFormField('giorno_settimana', dataora, formValidationRules),
        ora_appello: validateFormField('ora_appello', `${ora_h}:${ora_m}`, formValidationRules)
      };

      // Controlla se ci sono errori di validazione per questa sezione
      for (const [field, result] of Object.entries(validationResults)) {
        if (!result.isValid) {
          showValidationError(`Appello ${sectionNumber}: ${result.message}`);
          return false;
        }
      }

      // Validazione durata (se non è già calcolata automaticamente)
      const durataH = parseInt(durata_h) || 0;
      const durataM = parseInt(durata_m) || 0;
      const durataTotale = (durataH * 60) + durataM;
      
      if (durataTotale < 30 || durataTotale > 480) {
        showValidationError(`Appello ${sectionNumber}: La durata deve essere tra 30 minuti e 8 ore`);
        return false;
      }

      hasValidSection = true;
    }

    if (!hasValidSection) {
      showValidationError("Nessuna sezione di appello valida trovata");
      return false;
    }

    // Verifica insegnamenti selezionati usando InsegnamentiManager
    let insegnamentiSelected = [];
    if (window.InsegnamentiManager && typeof window.InsegnamentiManager.getSelectedInsegnamenti === 'function') {
      insegnamentiSelected = window.InsegnamentiManager.getSelectedInsegnamenti();
    } else {
      // Fallback: controlla il select nascosto
      const insegnamentoSelect = document.getElementById('insegnamento');
      if (insegnamentoSelect && insegnamentoSelect.selectedOptions) {
        insegnamentiSelected = Array.from(insegnamentoSelect.selectedOptions).map(option => option.value);
      }
    }
    
    if (!insegnamentiSelected || insegnamentiSelected.length === 0) {
      showValidationError("Seleziona almeno un insegnamento");
      return false;
    }

    return true;
  }

  // Validazione con bypass per amministratori - aggiornata per sezioni modulari
  function validateFormWithBypass() {
    // Anche per il bypass, controlla se ci sono errori di validazione delle date
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di inviare il form, anche con bypass");
      errorFields[0].focus();
      return false;
    }

    // Verifica che ci sia almeno una sezione
    const dateSections = document.querySelectorAll('.date-appello-section');
    if (dateSections.length === 0) {
      showValidationError("Aggiungi almeno una sezione di appello");
      return false;
    }

    // Controllo minimo: almeno i campi obbligatori devono essere presenti
    let hasMinimalData = false;
    for (let i = 0; i < dateSections.length; i++) {
      const section = dateSections[i];
      
      const dataora = section.querySelector(`[id^="dataora_"]`)?.value;
      const ora_h = section.querySelector(`[id^="ora_h_"]`)?.value;
      const ora_m = section.querySelector(`[id^="ora_m_"]`)?.value;
      const aula = section.querySelector(`[id^="aula_"]`)?.value;

      if (dataora && ora_h && ora_m && aula) {
        hasMinimalData = true;
        break;
      }
    }

    if (!hasMinimalData) {
      showValidationError("Compila almeno i campi obbligatori per una sezione di appello");
      return false;
    }

    // Verifica insegnamenti anche per il bypass
    let insegnamentiSelected = [];
    if (window.InsegnamentiManager && typeof window.InsegnamentiManager.getSelectedInsegnamenti === 'function') {
      insegnamentiSelected = window.InsegnamentiManager.getSelectedInsegnamenti();
    }
    
    if (!insegnamentiSelected || insegnamentiSelected.length === 0) {
      showValidationError("Seleziona almeno un insegnamento (richiesto anche con bypass)");
      return false;
    }

    return true;
  }

  // Interfaccia pubblica
  return {
    getFirstDateValue,
    getFirstTimeValue,
    getDurationValue,
    isUserAdmin,
    validateForm,
    validateFormWithBypass
  };
}());

// Espone il modulo globalmente
window.FormEsameControlli = FormEsameControlli;