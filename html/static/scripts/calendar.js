import {
  createDropdown,
  populateInsegnamentiDropdown,
  loadDateValide,
  formatDateForInput,
  isDateValid,
  updateSessioniDropdown,
  handleDropdownButtonClick,
  setupDropdownClickListeners,
  setupGlobalClickListeners,
  setupCloseHandlers,
  populateAnnoAccademicoDropdown,
  creaEventoProvvisorio,
  aggiornaAulaEventoProvvisorio,
  scrollToPrimaDataValida
} from "./calendarUtils.js";

document.addEventListener("DOMContentLoaded", function () {
  window.preloadUserData();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const startYear = currentMonth < 8 ? currentYear : currentYear + 1;
  const initialDate = `${startYear}-01-01`;

  var calendarEl = document.getElementById("calendar");
  let userData = null;
  let currentUsername = null;
  let isAdmin = false;
  let dateValide = [];
  let eventsCache = [];
  let lastFetchTime = 0;
  let dropdowns = { insegnamenti: null, sessioni: null, annoAccademico: null };
  let calendar = null;

  // Array per tenere traccia degli eventi provvisori aggiunti
  let provisionalEvents = [];

  // Funzione per rimuovere un evento provvisorio
  function removeProvisionalEvent(eventId) {
    const event = calendar.getEventById(eventId);
    if (event) {
      event.remove();
    }
    provisionalEvents = provisionalEvents.filter(ev => ev.id !== eventId);
  }

  // Funzione per rimuovere eventi provvisori specifici (esposta globalmente)
  function removeProvisionalEvents(eventIds) {
    const ids = Array.isArray(eventIds) ? eventIds : [eventIds];
    ids.forEach(eventId => {
      removeProvisionalEvent(eventId);
    });
  }

  // Funzione per pulire tutti gli eventi provvisori
  function clearProvisionalEvents() {
    provisionalEvents.forEach(event => {
      const calendarEvent = calendar.getEventById(event.id);
      if (calendarEvent) {
        calendarEvent.remove();
      }
    });
    provisionalEvents = [];
  }

  // Espone le funzioni e variabili per la gestione degli eventi provvisori
  window.clearCalendarProvisionalEvents = clearProvisionalEvents;
  window.removeProvisionalEvents = removeProvisionalEvents;
  window.provisionalEvents = provisionalEvents;
  window.creaEventoProvvisorio = creaEventoProvvisorio;
  window.aggiornaAulaEventoProvvisorio = aggiornaAulaEventoProvvisorio;

  window.forceCalendarRefresh = function () {
    eventsCache = [];
    lastFetchTime = 0;
    if (calendar) calendar.refetchEvents();
    // Aggiorna anche il controllo degli esami minimi
    if (window.checkEsamiMinimi) {
      window.checkEsamiMinimi();
    }
  };

  const updateDateValideState = (newDates) => {
    dateValide = newDates;
  };

  function deleteEsame(examId) {
    if (!examId) return;
    if (!window.showMessage) {
      if (!confirm("Sei sicuro di voler eliminare questo esame?")) return;
    } else {
      // Per ora usiamo confirm, ma si potrebbe implementare un dialog personalizzato
      if (!confirm("Sei sicuro di voler eliminare questo esame?")) return;
    }

    fetch('/api/deleteEsame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: examId }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.showMessage("Esame eliminato con successo", "Successo", "success");
          // Chiudi il form usando EsameForm se disponibile
          if (window.EsameForm && window.EsameForm.hideForm) {
            window.EsameForm.hideForm();
          }
          window.forceCalendarRefresh();
        } else {
          window.showMessage(data.message || "Errore nell'eliminazione dell'esame", "Errore", "error");
        }
      })
      .catch(error => {
        console.error("Errore nella richiesta di eliminazione:", error);
        window.showMessage("Errore nella richiesta di eliminazione", "Errore", "error");
      });
  }

  window.deleteEsame = deleteEsame;

  // Inizializza calendario
  window.getUserData().then(data => {
    userData = data;
    currentUsername = data?.user_data?.username;
    isAdmin = data?.authenticated && data?.user_data?.permessi_admin;

    Promise.all([
      loadDateValide(currentUsername),
      window.InsegnamentiManager?.loadInsegnamenti(currentUsername) || Promise.resolve([])
    ])
      .then(([dateValideResponse]) => {
        dateValide = dateValideResponse;
        dropdowns.sessioni = createDropdown("sessioni");
        dropdowns.insegnamenti = createDropdown("insegnamenti");
        dropdowns.annoAccademico = createDropdown("annoAccademico");
        updateSessioniDropdown(dropdowns.sessioni, dateValide);

        calendar = new FullCalendar.Calendar(calendarEl, {
          locale: "it",
          initialView: 'multiMonthList',
          duration: { months: 14 },
          initialDate: initialDate,
          validRange: false, // Disabilita completamente le limitazioni di range
          selectable: true,

          views: {
            multiMonthList: { type: 'multiMonth', buttonText: 'Lista', multiMonthMaxColumns: 1 },
            multiMonthGrid: { type: 'multiMonth', buttonText: 'Griglia', multiMonthMaxColumns: 3 },
            listaEventi: { type: 'listYear', duration: { years: 2 }, buttonText: 'Eventi' }
          },

          events: function (fetchInfo, successCallback, failureCallback) {
            const currentTime = new Date().getTime();
            if (eventsCache.length > 0 && currentTime - lastFetchTime < 300000) {
              successCallback(eventsCache.filter(ev => ev && ev.start));
              return;
            }

            let params = new URLSearchParams();
            params.append("docente", currentUsername);
            if (window.InsegnamentiManager) {
              const selected = window.InsegnamentiManager.getSelectedCodes();
              if (selected.length > 0) params.append("insegnamenti", selected.join(","));
            }

            fetch(`/api/getEsami?${params.toString()}`)
              .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
              .then(events => {
                const validEvents = (events || []).filter(ev => ev && ev.start).map(event => {
                  // Se l'esame non è del docente autenticato, applica stile giallo
                  if (event.extendedProps?.insegnamentoDocente === false) {
                    return {
                      ...event,
                      backgroundColor: '#FFD700',
                      borderColor: '#FFD700',
                      textColor: '#000000'
                    };
                  }
                  
                  // Altrimenti mantieni lo stile normale
                  return event;
                });
                eventsCache = validEvents;
                lastFetchTime = currentTime;
                successCallback(validEvents);
              })
              .catch(error => {
                console.error("Errore caricamento esami:", error);
                failureCallback(error);
              });
          },

          headerToolbar: {
            left: "pulsanteAnnoAccademico pulsanteSessioni pulsanteInsegnamenti",
            center: "multiMonthList,multiMonthGrid,listaEventi",
            right: "aggiungiEsame"
          },

          customButtons: {
            pulsanteAnnoAccademico: {
              text: "Anno Accademico",
              click: (e) => handleDropdownButtonClick(e, "annoAccademico", calendar, dropdowns, () => {
                populateAnnoAccademicoDropdown(dropdowns.annoAccademico);
              })
            },
            pulsanteSessioni: {
              text: "Sessioni",
              click: (e) => handleDropdownButtonClick(e, "sessioni", calendar, dropdowns)
            },
            pulsanteInsegnamenti: {
              text: "Insegnamenti",
              click: (e) => handleDropdownButtonClick(e, "insegnamenti", calendar, dropdowns, () => {
                if (window.InsegnamentiManager) {
                  populateInsegnamentiDropdown(dropdowns.insegnamenti, currentUsername);
                } else {
                  dropdowns.insegnamenti.innerHTML = "<div class='dropdown-error'>Manager non disponibile</div>";
                }
              })
            },
            aggiungiEsame: {
              text: "Importa da file",
              click: () => {
                if (window.showMessage) {
                  window.showMessage("Funzionalità di import non ancora implementata.", "Info", "notification");
                }
              }
            }
          },

          weekends: false,
          displayEventTime: true,
          eventDisplay: "block",
          eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },

          dateClick: function (info) {
            const selDate = info.date;
            const selDateFormatted = formatDateForInput(selDate);

            // Filtra gli eventi provvisori per includere solo quelli con "Apertura appelli" attivo
            const visibleProvisionalDates = [];
            
            if (window.provisionalEvents) {
              window.provisionalEvents.forEach(event => {
                // Controlla se l'evento corrisponde a una sezione con "Apertura appelli" attivo
                const sectionNumber = event.extendedProps?.sectionNumber;
                
                if (sectionNumber) {
                  const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${sectionNumber}`);
                  
                  if (showInCalendarCheckbox && showInCalendarCheckbox.checked) {
                    visibleProvisionalDates.push(event.start);
                  }
                } else {
                  // Per eventi provvisori creati dal calendario (senza sezione associata)
                  // li includiamo sempre perché rappresentano un "nuovo esame" generico
                  visibleProvisionalDates.push(event.start);
                }
              });
            }

            const validationResult = isDateValid(selDate, dateValide, visibleProvisionalDates);

            if (!validationResult.isValid) {
              if (validationResult.isSameDayConflict) {
                // Mostra notifica nella sidebar per conflitto stesso giorno
                if (window.showMessage) {
                  window.showMessage(
                    'Non è possibile inserire due esami nello stesso giorno.',
                    'Attenzione',
                    'notification'
                  );
                }
                return;
              } else if (validationResult.isProvisionalConflict) {
                // Mostra notifica nella sidebar per conflitto 14 giorni
                if (window.showMessage) {
                  window.showMessage(
                    'Non è possibile inserire esami a meno di 14 giorni di distanza da altri eventi con proprietà "Apertura appelli".',
                    'Attenzione',
                    'notification'
                  );
                }
                return;
              } else if (!isAdmin) {
                // Per altri errori di validazione, mostra messaggio nella sidebar
                if (window.showMessage) {
                  window.showMessage(validationResult.message, 'Attenzione', 'notification');
                }
                return;
              }
            }

            // Crea l'evento provvisorio nel calendario con sectionNumber dinamico
            // Determina il prossimo sectionNumber disponibile
            let nextSectionNumber = 1;
            while (document.getElementById(`dataora_${nextSectionNumber}`) && 
                   document.getElementById(`dataora_${nextSectionNumber}`).value) {
                nextSectionNumber++;
            }
            
            creaEventoProvvisorio(selDateFormatted, calendar, provisionalEvents, nextSectionNumber);
            
            // Verifica se il form è già aperto prima di mostrarlo
            const formIsAlreadyOpen = document.getElementById('form-container') && 
                                      document.getElementById('form-container').style.display === 'block';
            
            // Mostra il form e delega la gestione della data selezionata
            EsameForm.showForm({ date: selDateFormatted }).then(formOpened => {
              if (formOpened) {
                // Delega la gestione della data selezionata a FormEsameData
                if (window.FormEsameData && window.FormEsameData.handleDateSelection) {
                  window.FormEsameData.handleDateSelection(selDateFormatted);
                }
              }
            });
          },

          eventClick: function (info) {
            // Se l'evento cliccato è provvisorio non fare nulla
            if (info.event.extendedProps.isProvisional) {
              return; 
            }
            // Altrimenti, procedi con la logica di modifica esistente
            const examId = info.event.id;
            if (examId && window.EsameForm) {
              window.EsameForm.showForm({ examId: examId }, true);
            }
          },

          eventContent: function (arg) {
            const titoloInsegnamento = arg.event.title || 'Insegnamento';
            let htmlContent = '';

            if (arg.event.extendedProps.isProvisional) {
              // Per eventi provvisori: Prima riga data, seconda riga "Cognome docente - Nuovo esame"
              const cognomeDocente = userData?.user_data?.cognome || 'Docente';
              const dataAppello = arg.event.start ? arg.event.start.toLocaleDateString('it-IT') : '';
              
              htmlContent += `<div class="fc-event-time fc-sticky">${dataAppello}</div>`;
              htmlContent += `<div class="fc-event-title">${cognomeDocente} - Nuovo esame</div>`;
            } else {
              // Per eventi normali: Prima riga ora, seconda riga "Cognome docente - titolo insegnamento"
              const docenteCompleto = arg.event.extendedProps.docenteNome || '';
              const cognomeDocente = docenteCompleto ? docenteCompleto.split(' ').pop() : 'Docente';
              
              if (arg.event.start) {
                const timeString = arg.event.start.toLocaleTimeString('it-IT', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: false 
                });
                htmlContent += `<div class="fc-event-time fc-sticky">${timeString}</div>`;
              }
              
              htmlContent += `<div class="fc-event-title">${cognomeDocente} - ${titoloInsegnamento}</div>`;
            }
            
            return { html: htmlContent };
          },

          dayCellClassNames: function (arg) {
            const cellDate = new Date(arg.date.getTime());
            
            // Applica la classe fc-day-disabled se la data non è valida per utenti non admin
            // o se è una data passata per gli admin
            if (!isAdmin) {
                const validation = isDateValid(cellDate, dateValide, []);
                if (!validation.isValid) {
                    return ["fc-day-disabled"];
                }
            } else { 
                // Logica per admin (solo date passate disabilitate)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const comparableCellDate = new Date(cellDate.getTime());
                comparableCellDate.setHours(0,0,0,0);
                if (comparableCellDate < today) {
                    return ['fc-day-disabled'];
                }
            }
            return [];
          }
        });

        setupDropdownClickListeners(calendar, dropdowns, currentUsername, updateDateValideState);
        setupGlobalClickListeners(dropdowns);
        calendar.render();
        window.calendar = calendar;

        // Scrolla alla prima data valida dopo il rendering del calendario
        setTimeout(() => {
          scrollToPrimaDataValida(dateValide);
        }, 500);

        if (window.InsegnamentiManager) {
          let debounceTimer;
          window.InsegnamentiManager.onChange(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              loadDateValide(currentUsername)
                .then(newDates => {
                  dateValide = newDates;
                  updateSessioniDropdown(dropdowns.sessioni, dateValide);
                  eventsCache = [];
                  lastFetchTime = 0;
                  calendar.refetchEvents();
                });
            }, 300);
          });
        }
      })
      .catch(error => {
        console.error("Errore inizializzazione calendario:", error);
        if (calendarEl) {
          calendarEl.innerHTML = '<div class="error-message">Errore durante il caricamento del calendario.</div>';
        }
      });
  });

  setupCloseHandlers(calendar);
});
