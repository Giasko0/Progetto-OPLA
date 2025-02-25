document.addEventListener("DOMContentLoaded", () => {
  // Carica tutti gli esami al caricamento della pagina
  fetch("/flask/api/filtraEsami")
    .then((response) => response.json())
    .then(renderCalendarEvents)
    .catch((error) => {
      console.error("Errore nel caricamento degli esami:", error);
    });

  // Funzione che viene richiamata per aggiornare il calendario con gli eventi ricevuti
  function renderCalendarEvents(events) {
    if (window.calendar) {
      window.calendar.removeAllEvents();
      events.forEach((ev) => window.calendar.addEvent(ev));
    }
  }

  // Funzione per aggiornare il calendario in base ai filtri
  function updateCalendar() {
    const formData = new FormData(document.getElementById("filterForm"));
    const params = new URLSearchParams();
    for (let pair of formData.entries()) {
      params.append(pair[0], pair[1]);
    }
    const insegnamentoSelect = document.getElementById("insegnamento");
    if (insegnamentoSelect && insegnamentoSelect.value) {
      params.append("insegnamento", insegnamentoSelect.value);
    }

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

  // Aggiungi listener al cambiamento del select insegnamento
  const insegnamentoSelect = document.getElementById("insegnamento");
  if (insegnamentoSelect) {
    insegnamentoSelect.addEventListener("change", updateCalendar);
  }
});
