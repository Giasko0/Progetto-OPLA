document.addEventListener("DOMContentLoaded", function () {
  // Determina il range di date valido in base al periodo dell'anno
  function getValidDateRange() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    // Se siamo tra gennaio e agosto, si possono modificare solo gli esami dell'anno corrente
    // Se siamo tra settembre e dicembre, si possono inserire gli esami per l'anno successivo
    if (currentMonth >= 9) { // Da settembre a dicembre
      return {
        start: `${currentYear + 1}-01-01`,
        end: `${currentYear + 2}-04-30`
      };
    } else { // Da gennaio ad agosto
      return {
        start: `${currentYear}-01-01`,
        end: `${currentYear + 1}-04-30`
      };
    }
  }

  const dateRange = getValidDateRange();
  var calendarEl = document.getElementById("calendar");

  var calendar = new FullCalendar.Calendar(calendarEl, {
    contentHeight: 700,
    locale: "it",
    initialView: "dayGridMonth",
    selectable: true,
    validRange: dateRange,
    weekends: false,

    // Cambia titolo in base al mese
    datesSet: function (info) {
      const currentDate = info.view.currentStart;
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const today = new Date();
      const planningYear = today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear();

      // Mappa i mesi alle sessioni
      const sessioni = {
        [planningYear]: {
          1: '- Sessione Anticipata',
          2: '- Sessione Anticipata',
          3: '- Pausa Didattica Primavera',
          4: '- Pausa Didattica Primavera',
          6: '- Sessione Estiva',
          7: '- Sessione Estiva',
          9: '- Sessione Autunnale',
          11: '- Pausa Didattica Autunno'
        },
        [planningYear + 1]: {
          1: '- Sessione Invernale',
          2: '- Sessione Invernale',
          3: '- Pausa Didattica Primavera',
          4: '- Pausa Didattica Primavera'
        }
      };

      // Formatta il titolo
      const monthName = currentDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
      const session = sessioni[year] && sessioni[year][month] ? sessioni[year][month] : '';
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