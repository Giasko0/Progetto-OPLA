/**
 * Modulo semplificato per la gestione del form di esame
 */

// Funzione principale per mostrare il form di inserimento esame
export function showEsameForm(dateInfo) {
  // Ottieni l'overlay del popup esistente
  const popupOverlay = document.getElementById('popupOverlay');
  if (!popupOverlay) {
    console.error('Elemento popupOverlay non trovato');
    return;
  }
  
  // Pre-compila la data selezionata dal calendario se presente
  const dataInput = document.getElementById('dataora');
  if (dataInput) {
    if (dateInfo.dateStr) {
      dataInput.value = dateInfo.dateStr;
    } else {
      // Se non c'è una data selezionata, imposta la prima data disponibile
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dataInput.value = `${yyyy}-${mm}-${dd}`;
    }
  }
  
  // Imposta ora predefinita se non impostata
  const oraInput = document.getElementById('ora');
  if (oraInput && !oraInput.value) {
    oraInput.value = '09:00';
  }
  
  // Pre-seleziona gli insegnamenti dal manager
  preselezionaInsegnamenti();
  
  // Aggiorna l'elenco delle aule disponibili
  aggiornaAuleDisponibili();
  
  // Mostra il popup
  popupOverlay.style.display = 'flex';
  
  return {
    element: popupOverlay,
    close: () => {
      popupOverlay.style.display = 'none';
    }
  };
}

// Funzione per preselezionare gli insegnamenti
function preselezionaInsegnamenti() {
  if (!window.InsegnamentiManager) return;
  
  const selectedCodes = window.InsegnamentiManager.getSelectedCodes();
  if (!selectedCodes || selectedCodes.length === 0) return;
  
  // Imposta la variabile globale per gli insegnamenti preselezionati
  window.preselectedInsegnamenti = selectedCodes;
  
  // Se la funzione preselectInsegnamenti esiste nel contesto globale, la chiamiamo
  if (typeof window.preselectInsegnamenti === 'function') {
    setTimeout(() => window.preselectInsegnamenti(), 100);
  }
}

// Funzione per aggiornare le aule disponibili
function aggiornaAuleDisponibili() {
  const dataInput = document.getElementById('dataora');
  const oraInput = document.getElementById('ora');
  
  if (dataInput && oraInput && dataInput.value && oraInput.value) {
    // Se la funzione globale esiste, la chiamiamo
    if (typeof window.aggiornaAuleDisponibili === 'function') {
      setTimeout(() => window.aggiornaAuleDisponibili(), 100);
    }
  }
}
