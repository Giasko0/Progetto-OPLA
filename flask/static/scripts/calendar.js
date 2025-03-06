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

      const dropdownInsegnamenti = document.createElement('div');
      dropdownInsegnamenti.className = 'calendar-dropdown';
      document.body.appendChild(dropdownInsegnamenti);

      // Modifica: struttura dati per memorizzare i metadati degli insegnamenti selezionati
      let selectedInsegnamenti = new Map(); // Mappa codice -> {codice, anno_corso, semestre}

      function updateCalendarEvents() {
        // Rimuove tutti gli eventi esistenti
        calendar.getEventSources().forEach(source => source.remove());
        
        // Prepara i parametri per la richiesta API
        const params = new URLSearchParams();
        const loggedDocente = document.cookie
          .split('; ')
          .find(row => row.startsWith('username='))
          ?.split('=')[1];
          
        params.append('docente', loggedDocente);
        params.append('anno', planningYear);
        
        // Aggiungi gli insegnamenti selezionati con i loro metadati
        if (selectedInsegnamenti.size > 0) {
          const codici = Array.from(selectedInsegnamenti.keys());
          params.append('insegnamenti', codici.join(','));
          
          // Raccogli anni corso e semestri
          const anniCorso = new Set();
          const semestri = new Set();
          selectedInsegnamenti.forEach(ins => {
            anniCorso.add(ins.anno_corso);
            semestri.add(ins.semestre);
          });
          
          // Aggiungi parametri per anno corso e semestre
          params.append('anni_corso', Array.from(anniCorso).join(','));
          params.append('semestri', Array.from(semestri).join(','));
        }
        
        // Richiedi gli eventi filtrati
        fetch('/flask/api/getEsami?' + params.toString())
          .then(response => response.json())
          .then(events => {
            calendar.addEventSource(events);
          });
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
          params.append('anno', planningYear);
          
          // Aggiungi parametri per insegnamenti selezionati
          if (selectedInsegnamenti.size > 0) {
            const codici = Array.from(selectedInsegnamenti.keys());
            params.append('insegnamenti', codici.join(','));
            
            // Raccogli anni corso e semestri
            const anniCorso = new Set();
            const semestri = new Set();
            selectedInsegnamenti.forEach(ins => {
              anniCorso.add(ins.anno_corso);
              semestri.add(ins.semestre);
            });
            
            params.append('anni_corso', Array.from(anniCorso).join(','));
            params.append('semestri', Array.from(semestri).join(','));
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
          right: 'annoAccademico pulsanteInsegnamenti pulsanteDebug prev,next today'
        },

        customButtons: {
          annoAccademico: {
            text: `A.A. ${planningYear}/${planningYear + 1}`,
            click: function() {
              // Disabilita il click
              return false;
            },
            // Aggiunge una classe CSS personalizzata
            className: 'fc-anno-button'
          },
          pulsanteInsegnamenti: {
            text: 'Insegnamenti',
            click: function(e) {

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
                
              fetch(`/flask/api/getInsegnamentiDocente?anno=${planningYear}&docente=${docente}`)
                .then(response => response.json())
                .then(insegnamenti => {
                  dropdownInsegnamenti.innerHTML = insegnamenti.map(ins => `
                    <div class="dropdown-item" data-codice="${ins.codice}" data-semestre="${ins.semestre}" data-anno-corso="${ins.anno_corso || ''}">
                      <input type="checkbox" id="ins-${ins.codice}" 
                        value="${ins.codice}"
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
            click: async function() {
              try {
                // Rimuovo gli eventi esistenti
                calendar.getEventSources().forEach(source => source.remove());
                
                // Attendo che la fetch sia completata prima di aggiungere i nuovi eventi
                const response = await fetch('/flask/api/getAllExams');
                const events = await response.json();
                calendar.addEventSource(events);
              } catch (error) {
                console.error('Errore nel caricamento degli esami:', error);
              }
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

      // Chiudi dropdown quando clicchi fuori
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.fc-pulsanteInsegnamenti-button') && !e.target.closest('.calendar-dropdown')) {
          dropdownInsegnamenti.classList.remove('show');
        }
      });

      // Handler per scelta insegnamenti
      dropdownInsegnamenti.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
          const checkbox = item.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
          
          const codice = item.dataset.codice;
          const semestre = parseInt(item.dataset.semestre);
          const annoCorso = parseInt(item.dataset.annoCorso) || 1;
          
          if (checkbox.checked) {
            selectedInsegnamenti.set(codice, { 
              codice: codice, 
              semestre: semestre, 
              anno_corso: annoCorso 
            });
          } else {
            selectedInsegnamenti.delete(codice);
          }
          updateCalendarEvents();
        }
      });

      calendar.render();
      window.calendar = calendar;
    })
    .catch(error => console.error('Errore nel caricamento delle sessioni:', error));
});