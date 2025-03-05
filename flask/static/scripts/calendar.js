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

      const dropdownAA = document.createElement('div');
      dropdownAA.className = 'calendar-dropdown';
      document.body.appendChild(dropdownAA);

      const dropdownInsegnamenti = document.createElement('div');
      dropdownInsegnamenti.className = 'calendar-dropdown';
      document.body.appendChild(dropdownInsegnamenti);

      let selectedYear = null;
      let selectedInsegnamenti = new Set();

      function updateCalendarEvents() {
        calendar.refetchEvents();
      }

      var calendar = new FullCalendar.Calendar(calendarEl, {
        contentHeight: 700,
        locale: "it",
        initialDate: dateRange.start, // Forza la visualizzazione a partire dal 1° gennaio
        initialView: "dayGridMonth",
        selectable: true,
        events: function(info, successCallback, failureCallback) {
          const params = new URLSearchParams();
          const loggedDocente = document.cookie
            .split('; ')
            .find(row => row.startsWith('username='))
            ?.split('=')[1];
            
          params.append('docente', loggedDocente);
          
          if (selectedYear) {
            params.append('anno', selectedYear);
            if (selectedInsegnamenti.size > 0) {
              params.append('insegnamenti', Array.from(selectedInsegnamenti).join(','));
            }
          }
          
          fetch('/flask/api/getEsami?' + params.toString())
            .then(response => response.json())
            .then(successCallback)
            .catch(failureCallback);
        },
        validRange: function(nowDate) {
          const range = getValidDateRange();
          return {
            start: range.start,
            end: range.end,
          };
        },

        headerToolbar: {
          left: 'title',
          center: '',
          right: 'pulsanteAA pulsanteInsegnamenti pulsanteDebug prev,next today'  // Aggiunto pulsanteDebug
        },

        customButtons: {
          pulsanteAA: {
            text: 'Anno Accademico',
            click: function(e) {
              // Close other dropdowns
              dropdownInsegnamenti.classList.remove('show');
              
              // Position and show AA dropdown
              const button = e.currentTarget;
              const rect = button.getBoundingClientRect();
              dropdownAA.style.top = `${rect.bottom}px`;
              dropdownAA.style.left = `${rect.left}px`;
              
              // Get academic years from API
              fetch('/flask/api/getAnniAccademici')
                .then(response => response.json())
                .then(years => {
                  dropdownAA.innerHTML = years.map(year => 
                    `<div class="dropdown-item" data-year="${year}">${year}/${year+1}</div>`
                  ).join('');
                  
                  dropdownAA.classList.toggle('show');
                });
            }
          },
          pulsanteInsegnamenti: {
            text: 'Insegnamenti',
            click: function(e) {
              if (!selectedYear) {
                alert('Seleziona prima l\'anno accademico');
                return;
              }
              
              // Close other dropdowns
              dropdownAA.classList.remove('show');
              
              // Position and show courses dropdown
              const button = e.currentTarget;
              const rect = button.getBoundingClientRect();
              dropdownInsegnamenti.style.top = `${rect.bottom}px`;
              dropdownInsegnamenti.style.left = `${rect.left}px`;
              
              // Get courses from API
              const docente = document.cookie
                .split('; ')
                .find(row => row.startsWith('username='))
                ?.split('=')[1];
                
              fetch(`/flask/api/getInsegnamentiDocente?anno=${selectedYear}&docente=${docente}`)
                .then(response => response.json())
                .then(insegnamenti => {
                  dropdownInsegnamenti.innerHTML = insegnamenti.map(ins => `
                    <div class="dropdown-item">
                      <input type="checkbox" id="ins-${ins.codice}" 
                        value="${ins.codice}" data-semestre="${ins.semestre}"
                        ${selectedInsegnamenti.has(ins.codice) ? 'checked' : ''}>
                      <label for="ins-${ins.codice}">${ins.titolo}</label>
                    </div>
                  `).join('');
                  
                  dropdownInsegnamenti.classList.toggle('show');
                });
            }
          },
          pulsanteDebug: {
            text: '(Debug) Tutti gli esami',
            click: function() {
              // Fetch tutti gli esami senza filtri
              fetch('/flask/api/getAllExams')
                .then(response => response.json())
                .then(events => {
                  calendar.removeAllEvents();
                  calendar.addEventSource(events);
                });
            }
          }
        },

        buttonText: {
          today: 'Oggi',
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
          return arg.date.getHours() < 13 ? 'Mattina' : 'Pomeriggio';
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
          
          const loggedDocente = document.cookie
            .split('; ')
            .find(row => row.startsWith('username='))
            ?.split('=')[1];
          
          // Imposta il colore blu per i propri esami
          const color = info.event.extendedProps.docente === loggedDocente 
            ? '#0a58ca'   // blu per i propri esami
            : '#C12235';  // rosso per gli esami degli altri
          
          info.el.style.backgroundColor = color;
          info.el.style.borderColor = color;
        },

        eventContent: function(arg) {
          const event = arg.event;
          const annoCorso = event.extendedProps.annoCorso;
          const semestre = event.extendedProps.semestre;
          const annoAcc = event.extendedProps.annoAccademico;
          return {
            html: `
              <div class="fc-event-main-frame">
                <div class="fc-event-time">${arg.timeText}</div>
                <div class="fc-event-title-container">
                  <div class="fc-event-title fc-sticky">${event.title}</div>
                  <div class="fc-event-description">
                    A.A. ${annoAcc}/${parseInt(annoAcc)+1}
                    - Anno ${annoCorso}° 
                    - ${semestre}° sem.
                  </div>
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

      // Close dropdowns when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.fc-button') && !e.target.closest('.calendar-dropdown')) {
          dropdownAA.classList.remove('show');
          dropdownInsegnamenti.classList.remove('show');
        }
      });

      // Handle academic year selection
      dropdownAA.addEventListener('click', (e) => {
        const yearItem = e.target.closest('.dropdown-item');
        if (yearItem) {
          selectedYear = yearItem.dataset.year;
          calendar.getButton('pulsanteAA').setText(`A.A. ${selectedYear}/${parseInt(selectedYear)+1}`);
          // Reset insegnamenti quando cambia l'anno
          selectedInsegnamenti.clear();
          calendar.getButton('pulsanteInsegnamenti').setText('Insegnamenti');
          dropdownAA.classList.remove('show');
          updateCalendarEvents();
        }
      });

      // Handle course selection
      dropdownInsegnamenti.addEventListener('change', (e) => {
        const checkbox = e.target;
        if (checkbox.type === 'checkbox') {
          if (checkbox.checked) {
            selectedInsegnamenti.add(checkbox.value);
          } else {
            selectedInsegnamenti.delete(checkbox.value);
          }
          updateCalendarEvents();
        }
      });

      calendar.render();
      window.calendar = calendar;
    })
    .catch(error => console.error('Errore nel caricamento delle sessioni:', error));
});