document.addEventListener("DOMContentLoaded", function () {
  var calendarEl = document.getElementById("calendar");

  var calendar = new FullCalendar.Calendar(calendarEl, {
    contentHeight: 700,
    locale: "it",
    initialView: "dayGridMonth",
    selectable: true,
    // Configurazione dei mesi/giorni disponibili
    validRange: {
      start: '2025-01-01', // Primo mese disponibile
      end: '2025-09-30'    // Ultimo mese disponibile
    },
    weekends: false, // Disabilita sabato e domenica

    // Cambia titolo in base al mese
    datesSet: function (info) {
      const currentDate = info.view.currentStart;
      const month = currentDate.getMonth() + 1; // Gennaio = 1

      // Mappa i mesi alle sessioni
      const sessioni = {
        1: '- Sessione invernale',
        2: '- Sessione invernale',
        4: '- Sessione straordinaria',
        6: '- Sessione estiva',
        7: '- Sessione estiva',
        9: '- Sessione autunnale'
      };

      // Formatta il titolo
      const monthName = currentDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
      const session = sessioni[month] || '';
      const title = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${session}`;

      // Aggiorna il titolo
      document.querySelector('.fc-toolbar-title').textContent = title;
    },

    // Inserimento esame cliccando su un giorno
    dateClick: function (info) {
      if (document.cookie.split(';').some(cookie => cookie.trim().startsWith('username='))) {
        document.getElementById('dataora').value = info.dateStr;
        document.getElementById('popupOverlay').style.display = 'flex'; // Mostra il form
      } else {
        alert("Devi essere loggato per inserire un esame.");
      }
    },

    // Visualizzazione dettagli esame cliccando su un evento
    eventClick: function (info) {
      let dataEvento = calendar.formatDate(info.event.start, {
        month: 'long',
        year: 'numeric',
        day: 'numeric',
        locale: 'it'
      });
      alert('Titolo: ' + info.event.title + '\n' + 'Data: ' + dataEvento + '\n' + 'Aula: ' + info.event.extendedProps.aula);
    },
  });

  calendar.render();
  
  // Esponi globalmente l'istanza del calendario
  window.calendar = calendar;
});