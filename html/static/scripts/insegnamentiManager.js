/**
 * Sistema centralizzato per la gestione degli insegnamenti tra calendario e form
 */
const InsegnamentiManager = (function () {
  // Mappa degli insegnamenti selezionati: codice -> {codice, anno_corso, semestre, cds}
  let selectedInsegnamenti = new Map();

  // Callbacks da chiamare quando cambia la selezione degli insegnamenti
  let onChangeCallbacks = [];

  /**
   * Seleziona un insegnamento
   * @param {string} codice - Codice dell'insegnamento
   * @param {Object} metadata - Metadati dell'insegnamento (anno_corso, semestre, cds)
   */
  function selectInsegnamento(codice, metadata) {
    selectedInsegnamenti.set(codice, {
      codice: codice,
      ...metadata,
    });
    notifyChange();
  }

  /**
   * Deseleziona un insegnamento
   * @param {string} codice - Codice dell'insegnamento
   */
  function deselectInsegnamento(codice) {
    selectedInsegnamenti.delete(codice);
    notifyChange();
  }

  /**
   * Controlla se un insegnamento è selezionato
   * @param {string} codice - Codice dell'insegnamento
   * @returns {boolean} - True se l'insegnamento è selezionato
   */
  function isSelected(codice) {
    return selectedInsegnamenti.has(codice);
  }

  /**
   * Ottiene tutti i codici degli insegnamenti selezionati
   * @returns {string[]} - Array di codici degli insegnamenti selezionati
   */
  function getSelectedCodes() {
    return Array.from(selectedInsegnamenti.keys());
  }

  /**
   * Ottiene tutti gli insegnamenti selezionati
   * @returns {Map} - Mappa degli insegnamenti selezionati
   */
  function getSelected() {
    return new Map(selectedInsegnamenti);
  }

  /**
   * Svuota la selezione
   */
  function clearSelection() {
    selectedInsegnamenti.clear();
    notifyChange();
  }

  /**
   * Aggiunge una callback da chiamare quando cambia la selezione
   * @param {Function} callback - Callback da chiamare
   */
  function onChange(callback) {
    if (typeof callback === "function") {
      onChangeCallbacks.push(callback);
    }
  }

  /**
   * Notifica tutti i listener del cambiamento
   */
  function notifyChange() {
    onChangeCallbacks.forEach((callback) => callback(getSelectedCodes()));
  }

  /**
   * Carica gli insegnamenti selezionati dal server
   * @param {string} username - Username del docente
   * @param {Function} callback - Callback da chiamare con i dati caricati
   */
  function loadSelectedInsegnamenti(username, callback) {
    if (!username || getSelectedCodes().length === 0) {
      if (typeof callback === "function") callback([]);
      return;
    }

    fetch(
      `/api/ottieniInsegnamenti?username=${username}&codici=${getSelectedCodes().join(
        ","
      )}`
    )
      .then((response) => response.json())
      .then((data) => {
        if (typeof callback === "function") callback(data);
      })
      .catch((error) => {
        console.error("Errore nel caricamento degli insegnamenti:", error);
        if (typeof callback === "function") callback([]);
      });
  }

  /**
   * Sincronizza lo stato con i componenti UI
   * @param {string} username - Username del docente
   * @param {Function} updateCalendar - Funzione per aggiornare il calendario
   * @param {Function} updateForm - Funzione per aggiornare il form
   */
  function syncState(username, updateCalendar, updateForm) {
    if (typeof updateCalendar === "function") {
      updateCalendar(getSelectedCodes());
    }

    if (typeof updateForm === "function") {
      loadSelectedInsegnamenti(username, (data) => {
        updateForm(data);
      });
    }
  }

  // API pubblica
  return {
    selectInsegnamento,
    deselectInsegnamento,
    isSelected,
    getSelectedCodes,
    getSelected,
    clearSelection,
    onChange,
    loadSelectedInsegnamenti,
    syncState,
  };
})();

// Rendiamo il manager disponibile globalmente
window.InsegnamentiManager = InsegnamentiManager;
