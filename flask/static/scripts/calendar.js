import { 
  getValidDateRange, 
  getPlanningYear,
  createDropdown,
  populateInsegnamentiDropdown, 
  fetchCalendarEvents,
  getDateValideFromSessioni,
  createInsegnamentoTag,
  updateHiddenSelect
} from './calendarProps.js';

document.addEventListener("DOMContentLoaded", function () {
  // Inizializzazione
  const planningYear = getPlanningYear();
  const dateRange = getValidDateRange();
  var calendarEl = document.getElementById("calendar");

  // Carica le date delle sessioni
  fetch('/flask/api/ottieniSessioni')
    .then(response => response.json())
    .then(sessioni => {
      // Converti in array di date
      const dateValide = getDateValideFromSessioni(sessioni);

      // Crea dropdown
      const dropdownSessioni = createDropdown('sessioni', sessioni);
      const dropdownInsegnamenti = createDropdown('insegnamenti');

      // Configurazione calendario
      var calendar = new FullCalendar.Calendar(calendarEl, {
        contentHeight: 700,
        locale: "it",
        initialDate: dateRange.start,
        initialView: "dayGridMonth",
        selectable: true,
        // Eventi dal server
        events: (info, successCallback) => fetchCalendarEvents(calendar, planningYear, info, successCallback),
        validRange: getValidDateRange,

        headerToolbar: {
          left: 'title',
          center: '',
          right: 'pulsanteSessioni pulsanteInsegnamenti pulsanteDebug prev,next today'
        },

        // Pulsanti personalizzati
        customButtons: {
          // Sessioni d'esame
          pulsanteSessioni: {
            text: 'Sessioni',
            click: function(e) {
              // Mostra dropdown sessioni
              const button = e.currentTarget;
              const rect = button.getBoundingClientRect();
              dropdownSessioni.style.top = `${rect.bottom}px`;
              dropdownSessioni.style.left = `${rect.left}px`;
              dropdownSessioni.classList.toggle('show');
              
              // Chiudi altri dropdown
              dropdownInsegnamenti.classList.remove('show');
            }
          },
          // Filtro insegnamenti
          pulsanteInsegnamenti: {
            text: 'Insegnamenti',
            click: function(e) {
              // Mostra dropdown insegnamenti
              const button = e.currentTarget;
              const rect = button.getBoundingClientRect();
              dropdownInsegnamenti.style.top = `${rect.bottom}px`;
              dropdownInsegnamenti.style.left = `${rect.left}px`;
              
              // Chiudi altri dropdown
              dropdownSessioni.classList.remove('show');
              
              // Docente loggato
              const docente = document.cookie
                .split('; ')
                .find(row => row.startsWith('username='))
                ?.split('=')[1];
                
              // Popola dropdown
              populateInsegnamentiDropdown(dropdownInsegnamenti, docente, planningYear);
            }
          },
          // Debug: tutti gli esami
          pulsanteDebug: {
            text: '(Debug) Tutti gli esami',
            click: function() {
              // Rimuovi eventi esistenti
              calendar.getEventSources().forEach(source => source.remove());
              
              // Carica tutti gli esami
              fetch('/flask/api/getEsami?all=true')
                .then(response => response.json())
                .then(data => {
                  calendar.addEventSource(data);
                })
                .catch(error => {
                  console.error('Errore nel caricamento degli esami:', error);
                });
            }
          }
        },

        // Testo pulsanti
        buttonText: {
          today: 'Oggi',
        },

        // Impostazioni visualizzazione
        weekends: false,
        displayEventTime: true,
        eventDisplay: 'block',
        eventTimeFormat: {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        },
        showNonCurrentDates: false,
        fixedWeekCount: false,
        slotMinTime: '08:00:00',
        slotMaxTime: '19:00:00',
        allDaySlot: false,
        slotDuration: '05:00:00',
        slotLabelContent: function(arg) {
          return arg.date.getHours() < 13 ? 'Mattina' : 'Pomeriggio';
        },

        // Aggiorna titolo con mese e sessione
        datesSet: function (info) {
          const currentDate = info.view.currentStart;
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
          
          // Trova la sessione corrente
          let sessioneCorrente = '';
          for (let [start, end, nome] of dateValide) {
              const sessioneStart = new Date(start);
              const sessioneEnd = new Date(end);
              
              // Controlla sovrapposizione
              if (monthStart <= sessioneEnd && monthEnd >= sessioneStart) {
                  sessioneCorrente = ` - ${nome}`;
                  break;
              }
          }

          // Formatta titolo
          const monthName = currentDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
          const title = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}${sessioneCorrente}`;
          
          // Aggiorna titolo
          document.querySelector('.fc-toolbar-title').textContent = title;
        },

        // Click su data per nuovo esame
        dateClick: function (info) {
          const dataClick = new Date(info.dateStr);
          // Periodo: mattina/pomeriggio
          const periodo = info.view.type === 'timeGrid' ? 
            (info.date.getHours() < 14 ? '0' : '1') : 
            null;
          
          // Verifica data in sessione valida
          const dataValida = dateValide.some(([start, end]) => {
              const startDate = new Date(start);
              const endDate = new Date(end);
              endDate.setHours(23, 59, 59, 999);
              
              return dataClick >= startDate && dataClick <= endDate;
          });

          // Blocca date fuori sessione
          if (!dataValida) {
            alert('Non è possibile inserire esami al di fuori delle sessioni o delle pause didattiche');
            return;
          }

          // Controlla login
          if (document.cookie.split(';').some(cookie => cookie.trim().startsWith('username='))) {
            // Formatta data per form
            const formattedDate = dataClick.toISOString().split('T')[0];
            document.getElementById('dataora').value = formattedDate;
            if (periodo !== null) {
              document.getElementById('periodo').value = periodo;
            }
            
            // Pre-popola insegnamenti nel form
            if (window.InsegnamentiManager && window.InsegnamentiManager.getSelectedCodes().length > 0) {
              const username = document.cookie
                .split('; ')
                .find(row => row.startsWith('username='))
                ?.split('=')[1];
              
              if (username) {
                // Prepara contenitore
                const multiSelectBox = document.getElementById('insegnamentoBox');
                if (multiSelectBox) {
                  // Salva placeholder
                  const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
                  
                  // Svuota contenitore
                  multiSelectBox.innerHTML = '';
                  
                  // Ripristina placeholder se necessario
                  if (placeholder && window.InsegnamentiManager.getSelectedCodes().length === 0) {
                    multiSelectBox.appendChild(placeholder.cloneNode(true));
                  }
                
                  // Carica insegnamenti selezionati
                  window.InsegnamentiManager.loadSelectedInsegnamenti(username, function(data) {
                    if (data.length > 0) {
                      // Rimuovi placeholder
                      const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
                      if (placeholder) {
                        placeholder.remove();
                      }
                      
                      // Crea tag per insegnamenti
                      data.forEach(ins => {
                        createInsegnamentoTag(ins.codice, ins.titolo, multiSelectBox);
                      });
                      
                      // Aggiorna select nascosta
                      updateHiddenSelect(multiSelectBox);
                      
                      // Aggiorna opzioni nel dropdown
                      const options = document.querySelectorAll('#insegnamentoOptions .multi-select-option');
                      options.forEach(option => {
                        if (window.InsegnamentiManager.isSelected(option.dataset.value)) {
                          option.classList.add('selected');
                        }
                      });
                    }
                  });
                }
              }
            }
            
            // Mostra form
            document.getElementById('popupOverlay').style.display = 'flex';
          } else {
            alert("Devi essere loggato per inserire un esame.");
          }
        },

        // Dettagli evento al click
        eventClick: function (info) {
          // Formatta data
          let dataEvento = calendar.formatDate(info.event.start, {
            month: 'long',
            year: 'numeric',
            day: 'numeric',
            locale: 'it'
          });
          alert('Titolo: ' + info.event.title + '\n' + 'Data: ' + dataEvento + '\n' + 'Aula: ' + info.event.extendedProps.aula);
        },

        // Stile eventi
        eventDidMount: function(info) {
          // Tooltip
          info.el.title = info.event.extendedProps.description;
          
          // Docente loggato
          const loggedDocente = document.cookie
            .split('; ')
            .find(row => row.startsWith('username='))
            ?.split('=')[1];
          
          // Colori differenziati
          const eventColor = info.event.extendedProps.docente === loggedDocente 
            ? '#0A58CA'   // blu: propri esami
            : '#FFD700';  // giallo: altri esami
          
          const textColor = info.event.extendedProps.docente === loggedDocente
            ? 'white'     // testo bianco
            : 'black';    // testo nero
          
          // Applica colori
          info.el.style.backgroundColor = eventColor;
          info.el.style.borderColor = eventColor;
          
          // Colora testo interno
          const innerDivs = info.el.querySelectorAll('div');
          innerDivs.forEach(div => {
            div.style.color = textColor;
          });
        },

        // Contenuto HTML eventi
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

        // Disabilita date fuori sessione
        dayCellClassNames: function(arg) {
          const dataCorrente = arg.date;
          
          // Verifica data in sessione
          const dataValida = dateValide.some(([start, end]) => {
              const startDate = new Date(start);
              const endDate = new Date(end);
              endDate.setHours(23, 59, 59, 999);
              
              return dataCorrente >= startDate && dataCorrente <= endDate;
          });
          
          // Applica classe per date non valide
          return dataValida ? [] : ['fc-disabled-day'];
        }
      });

      // Gestione click sui dropdown
      
      // Dropdown sessioni
      dropdownSessioni.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
          const data = item.dataset.data;
          if (data) {
            // Naviga alla data
            calendar.gotoDate(data);
            dropdownSessioni.classList.remove('show');
          }
        }
      });

      // Dropdown insegnamenti
      dropdownInsegnamenti.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
            const checkbox = item.querySelector('input[type="checkbox"]');
            if (checkbox) {
                // Toggle checkbox
                checkbox.checked = !checkbox.checked;
                
                // Dati insegnamento
                const codice = item.dataset.codice;
                const semestre = parseInt(item.dataset.semestre);
                const annoCorso = parseInt(item.dataset.annoCorso) || 1;
                const cds = item.dataset.cds;
                
                // Aggiorna InsegnamentiManager
                if (window.InsegnamentiManager) {
                    if (checkbox.checked) {
                        window.InsegnamentiManager.selectInsegnamento(codice, { 
                            semestre: semestre, 
                            anno_corso: annoCorso,
                            cds: cds
                        });
                    } else {
                        window.InsegnamentiManager.deselectInsegnamento(codice);
                    }
                }
            }
        }
      });

      // Chiusura dropdown su click fuori
      document.addEventListener('click', (e) => {
        // Dropdown insegnamenti
        if (!e.target.closest('.fc-pulsanteInsegnamenti-button') && !e.target.closest('.calendar-dropdown')) {
          dropdownInsegnamenti.classList.remove('show');
        }
        // Dropdown sessioni
        if (!e.target.closest('.fc-pulsanteSessioni-button') && !e.target.closest('#sessioniDropdown')) {
          dropdownSessioni.classList.remove('show');
        }
      });

      // InsegnamentiManager con debounce
      if (window.InsegnamentiManager) {
        let debounceTimer;
        window.InsegnamentiManager.onChange(() => {
          // Cancella timer precedente
          if (debounceTimer) clearTimeout(debounceTimer);
          
          // Aggiorna dopo breve delay
          debounceTimer = setTimeout(() => {
            fetchCalendarEvents(calendar, planningYear);
          }, 100);
        });
      }

      // Inizializza calendario
      calendar.render();
      window.calendar = calendar;
      
      // Esponi funzione globale
      window.updateHiddenSelect = (multiSelectBox) => updateHiddenSelect(multiSelectBox);
    })
    .catch(error => console.error('Errore nel caricamento delle sessioni:', error));
  
  // Gestione chiusura form esami
  const setupCloseHandlers = () => {
    const closeButton = document.getElementById('closeOverlay');
    const popupOverlay = document.getElementById('popupOverlay');
    
    // Reset e aggiorna calendario
    const resetAndRefreshCalendar = () => {
      window.preselectedInsegnamenti = [];
      if (window.calendar) {
        fetchCalendarEvents(window.calendar, planningYear);
      }
    };
    
    // Handler pulsante chiusura
    if (closeButton) {
      closeButton.addEventListener('click', resetAndRefreshCalendar);
    }
    
    // Handler click fuori dal form
    if (popupOverlay) {
      popupOverlay.addEventListener('click', function(event) {
        if (event.target === popupOverlay) {
          resetAndRefreshCalendar();
        }
      });
    }
  };
  
  // Inizializza handler
  setupCloseHandlers();
});