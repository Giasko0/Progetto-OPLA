import { getValidDateRange } from './calendarProps.js';

document.addEventListener("DOMContentLoaded", function () {
  const currentDate = new Date();
  const planningYear = currentDate.getMonth() >= 9 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  const dateRange = getValidDateRange();
  var calendarEl = document.getElementById("calendar");

  // Ottieni le date delle sessioni prima di inizializzare il calendario
  fetch('/flask/api/ottieniSessioni')
    .then(response => response.json())
    .then(sessioni => {
      // Converti tutte le date valide per gli esami in un unico array
      const dateValide = [
        [sessioni.anticipata.start, sessioni.anticipata.end, 'Sessione Anticipata'],
        [sessioni.estiva.start, sessioni.estiva.end, 'Sessione Estiva'],
        [sessioni.autunnale.start, sessioni.autunnale.end, 'Sessione Autunnale'],
        [sessioni.invernale.start, sessioni.invernale.end, 'Sessione Invernale'],
        [sessioni.pausa_primo.start, sessioni.pausa_primo.end, 'Pausa Didattica'],
        [sessioni.pausa_secondo.start, sessioni.pausa_secondo.end, 'Pausa Didattica']
      ];

      var calendar = new FullCalendar.Calendar(calendarEl, {
        contentHeight: 700,
        locale: "it",
        initialDate: dateRange.start, // Forza la visualizzazione a partire dal 1° gennaio
        initialView: "dayGridMonth",
        selectable: true,
        validRange: function(nowDate) {
          const range = getValidDateRange();
          return {
            start: range.start,
            end: range.end,
          };
        },
        weekends: false,
        displayEventTime: true,
        eventDisplay: 'block',
        eventTimeFormat: {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        },
        showNonCurrentDates: false,  // Nasconde i giorni degli altri mesi
        fixedWeekCount: false,       // Permette al calendario di adattarsi al numero di settimane del mese
        slotMinTime: '08:00:00',
        slotMaxTime: '19:00:00',
        allDaySlot: false,
        slotDuration: '05:00:00',
        slotLabelContent: function(arg) {
          return arg.date.getHours() < 12 ? 'Mattina' : 'Pomeriggio';
        },

        // Cambia titolo in base al mese
        datesSet: function (info) {
          const currentDate = info.view.currentStart;
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
          
          // Trova la sessione corrente
          let sessioneCorrente = '';
          for (let [start, end, nome] of dateValide) {
              const sessioneStart = new Date(start);
              const sessioneEnd = new Date(end);
              
              // Verifica se c'è una sovrapposizione tra il mese e la sessione
              if (monthStart <= sessioneEnd && monthEnd >= sessioneStart) {
                  sessioneCorrente = ` - ${nome}`;
                  break;
              }
          }

          // Formatta il titolo
          const monthName = currentDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
          const title = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}${sessioneCorrente}`;
          
          // Aggiorna il titolo
          document.querySelector('.fc-toolbar-title').textContent = title;
        },

        // Inserimento esame cliccando su un giorno
        dateClick: function (info) {
          const dataClick = new Date(info.dateStr);
          const periodo = info.view.type === 'timeGrid' ? 
            (info.date.getHours() < 14 ? '0' : '1') : 
            null;
          
          const dataValida = dateValide.some(([start, end]) => {
              const startDate = new Date(start);
              const endDate = new Date(end);
              endDate.setHours(23, 59, 59, 999); // Imposta la fine della giornata, altrimenti conta anche il giorno successivo
              
              return dataClick >= startDate && dataClick <= endDate;
          });

          if (!dataValida) {
            alert('Non è possibile inserire esami al di fuori delle sessioni o delle pause didattiche');
            return;
          }

          if (document.cookie.split(';').some(cookie => cookie.trim().startsWith('username='))) {
            // Formatta la data nel formato YYYY-MM-DD per l'input type="date"
            const formattedDate = dataClick.toISOString().split('T')[0];
            document.getElementById('dataora').value = formattedDate;
            if (periodo !== null) {
              document.getElementById('periodo').value = periodo;
            }
            document.getElementById('popupOverlay').style.display = 'flex';
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

        eventDidMount: function(info) {
          info.el.title = info.event.extendedProps.description;
          
          // Ottieni il docente loggato dai cookie
          const loggedDocente = document.cookie
              .split('; ')
              .find(row => row.startsWith('username='))
              ?.split('=')[1];
          
          // Imposta il colore: blu per i propri esami, rosso per gli altri
          const color = loggedDocente && info.event.extendedProps.docente === loggedDocente 
              ? '#0a58ca'   // blu per i propri esami
              : '#C12235';  // rosso per gli esami degli altri
          
          info.el.style.backgroundColor = color;
          info.el.style.borderColor = color;
        },

        eventContent: function(arg) {
          return {
            html: `
              <div class="fc-event-main-frame">
                <div class="fc-event-time">${arg.timeText}</div>
                <div class="fc-event-title-container">
                  <div class="fc-event-title fc-sticky">${arg.event.title}</div>
                  <div class="fc-event-description">Aula: ${arg.event.extendedProps.aula}</div>
                </div>
              </div>
            `
          };
        },

        // dayCellClassNames per modificare la classe della cella, se è fuori dalle sessioni, viene disabilitata
        dayCellClassNames: function(arg) {
          const dataCorrente = arg.date;
          
          // Verifica se la data è valida per qualsiasi sessione
          const dataValida = dateValide.some(([start, end]) => {
              const startDate = new Date(start);
              const endDate = new Date(end);
              endDate.setHours(23, 59, 59, 999); // Imposta la fine della giornata, altrimenti conta anche il giorno successivo
              
              return dataCorrente >= startDate && dataCorrente <= endDate;
          });
          
          return dataValida ? [] : ['fc-disabled-day'];
        }
      });

      calendar.render();
      window.calendar = calendar;
    })
    .catch(error => console.error('Errore nel caricamento delle sessioni:', error));
});