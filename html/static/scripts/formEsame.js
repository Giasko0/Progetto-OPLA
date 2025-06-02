// Script per la gestione del form di inserimento esame
const EsameForm = (function() {
  // Verifica che tutti i moduli dipendenti siano caricati
  const requiredModules = [
    'FormEsameUtils',           // formEsameUtils.js
    'FormEsameAppelli',    // formEsameAppelli.js
    'FormEsameUI',         // formEsameUI.js
    'FormEsameData',       // formEsameData.js
    'FormEsameControlli',  // formEsameControlli.js
    'EsamePreferenze'      // formEsamePreferenze.js
  ];
  
  const missingModules = requiredModules.filter(module => !window[module]);
  if (missingModules.length > 0) {
    throw new Error(`Moduli non caricati: ${missingModules.join(', ')}`);
  }

  // Stato locale
  let formContainer = null;
  let currentUsername = null;
  let userPreferences = [];
  let isEditMode = false;
  
  // Funzioni per invio messaggi alla sidebar
  const showError = (message) => window.showMessage(message, 'Errore', 'error');
  const showSuccess = (message) => window.showMessage(message, 'Successo', 'success');
  const showWarning = (message) => window.showMessage(message, 'Attenzione', 'warning');
  
  // Interfaccia pubblica - delega diretta ai moduli specifici
  return {
    // Core functions - UI
    loadForm: () => window.FormEsameUI?.loadForm(),
    showForm: (data = {}, isEdit = false) => window.FormEsameUI?.showForm(data, isEdit),
    hideForm: (cleanupProvisional = false) => window.FormEsameUI?.hideForm(cleanupProvisional),
    
    // Controls e validazione
    combineTimeValues: () => window.FormEsameControlli?.combineTimeValues(),
    setupTimeCombiningHandlers: () => window.FormEsameControlli?.setupTimeCombiningHandlers(),
    aggiornaVerbalizzazione: () => window.FormEsameControlli?.aggiornaVerbalizzazione(),
    
    // Data e popup
    mostraPopupConferma: (data) => window.FormEsameData?.mostraPopupConferma(data),
    
    // Date sections management
    removeDateSection: (sectionId) => window.FormEsameAppelli?.removeDateSection(sectionId),
    addDateSection: (date) => window.FormEsameAppelli?.addDateSection(date),
    initializeDateSections: () => window.FormEsameAppelli?.initializeDateSections(),
    
    // Gestione preferenze
    initPreferences: (username) => window.EsamePreferenze?.initPreferences(username),
    
    // Config
    usePreferences: true
  };
}());
// Inizializzazione automatica
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formEsame');
  if (form && window.FormEsameControlli) {
    window.FormEsameControlli.setupTimeCombiningHandlers();
  }
});

// Esportazione globale
window.EsameForm = EsameForm;