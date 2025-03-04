document.addEventListener("DOMContentLoaded", () => {
  const currentDate = new Date();
  const planningYear = currentDate.getMonth() >= 8 ? currentDate.getFullYear() + 1 : currentDate.getFullYear();
  
  // Carica tutti gli esami al caricamento della pagina
  updateCalendar();

  // Funzione che viene richiamata per aggiornare il calendario con gli eventi ricevuti
  function renderCalendarEvents(events) {
    if (window.calendar) {
      window.calendar.removeAllEvents();
      window.calendar.addEventSource(events);
    }
  }

  // Funzione per aggiornare il calendario in base ai filtri
  function updateCalendar() {
    const formData = new FormData(document.getElementById("filterForm"));
    const params = new URLSearchParams(formData);

    fetch("/flask/api/filtraEsami?" + params.toString())
      .then((response) => response.json())
      .then(renderCalendarEvents)
      .catch((error) => {
        console.error("Errore nel filtrare esami:", error);
      });
  }

  // Funzione per il toggle dei checkbox che aggiorna immediatamente il calendario
  window.toggleCheckbox = function (id) {
    const checkbox = document.getElementById(id);
    checkbox.checked = !checkbox.checked;
    updateCalendar();
  };

  // Gestione del submit del form per il filtraggio
  const filterForm = document.getElementById("filterForm");
  if (filterForm) {
    filterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      updateCalendar();
    });
  }

  // Aggiungi listener per i cambiamenti dei checkbox
  document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", updateCalendar);
  });
});
