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
  scrollToPrimaDataValida
} from "./calendarUtils.js";

document.addEventListener("DOMContentLoaded", async function () {
  window.preloadUserData();
  
  // Prima inizializza l'anno accademico
  await window.AnnoAccademicoManager.initSelectedAcademicYear();

  const calendarEl = document.getElementById("calendar");
  let userData = null;
  let currentUsername = null;
  let isAdmin = false;
  let dateValide = [];
  let eventsCache = [];
  let lastFetchTime = 0;
  const dropdowns = { insegnamenti: null, sessioni: null };
  let calendar = null;

  // Cache per 5 minuti invece di 300000ms (più leggibile)
  const CACHE_DURATION = 5 * 60 * 1000;

  // Delega la gestione degli eventi provvisori a EsameAppelli
  window.clearCalendarProvisionalEvents = function() {
    if (window.EsameAppelli && window.EsameAppelli.clearProvisionalEvents) {
      window.EsameAppelli.clearProvisionalEvents();
    }
  };

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

  // Funzione semplificata per eliminazione esame
  function deleteEsame(examId) {
    if (!examId || !confirm("Sei sicuro di voler eliminare questo esame?")) return;

    fetch('/api/delete-esame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: examId }),
    })
      .then(response => response.json())
      .then(data => {
        const message = data.success ? "Esame eliminato con successo" : (data.message || "Errore nell'eliminazione dell'esame");
        const type = data.success ? "success" : "error";
        
        window.showMessage(message, data.success ? "Successo" : "Errore", type);
        
        if (data.success) {
          window.EsameForm?.hideForm?.();
          window.forceCalendarRefresh();
        }
      })
      .catch(error => {
        console.error("Errore nella richiesta di eliminazione:", error);
        window.showMessage("Errore nella richiesta di eliminazione", "Errore", "error");
      });
  }

  // Funzione per controllare i permessi di modifica prima di aprire il form
  async function checkEditPermissions(examId, examDocente) {
    try {
      // Se userData non è ancora caricato, aspetta
      if (!userData) {
        userData = await window.getUserData();
      }

      const currentUser = userData?.user_data?.username;
      const isAdmin = userData?.authenticated && userData?.user_data?.permessi_admin;

      // Admin può modificare tutto
      if (isAdmin) {
        return { allowed: true };
      }

      // Non admin può modificare solo i propri esami
      if (currentUser && examDocente && currentUser.toLowerCase() === examDocente.toLowerCase()) {
        return { allowed: true };
      }

      // Non autorizzato
      return { 
        allowed: false, 
        message: "Non hai i permessi per modificare questo esame. Puoi modificare solo i tuoi esami." 
      };

    } catch (error) {
      console.error("Errore nel controllo permessi:", error);
      return { 
        allowed: false, 
        message: "Errore nel controllo dei permessi. Riprova." 
      };
    }
  }

  window.deleteEsame = deleteEsame;

  // Inizializza calendario
  window.getUserData().then(async data => {
    userData = data;
    currentUsername = data?.user_data?.username;
    isAdmin = data?.authenticated && data?.user_data?.permessi_admin;
    window.currentUsername = currentUsername;

    // Crea dropdown anno accademico
    await window.AnnoAccademicoManager.createDropdownHTML('annoAccademicoContainer', 'annoAccademicoSelect');
    
    // Configura callback per cambio anno
    window.AnnoAccademicoManager.onYearChange((newYear) => {
      if (calendar) {
        calendar.gotoDate(`${newYear}-12-01`);
        
        // Invalida cache insegnamenti per forzare ricaricamento
        if (window.InsegnamentiManager) {
          window.InsegnamentiManager.invalidateCache();
          window.InsegnamentiManager.clearSelection();
        }
        
        // Ricarica date valide e aggiorna dropdown sessioni
        loadDateValide(currentUsername).then(newDates => {
          dateValide = newDates;
          updateSessioniDropdown(dropdowns.sessioni, dateValide);
        });
        
        // Aggiorna calendario e controllo esami minimi
        window.forceCalendarRefresh?.();
        if (window.checkEsamiMinimi) {
          window.checkEsamiMinimi();
        }
      }
    });

    // Inizializza il calendario
    initializeCalendarWithData();

    function initializeCalendarWithData() {
      Promise.all([
        loadDateValide(currentUsername),
        window.InsegnamentiManager?.loadInsegnamenti(currentUsername) || Promise.resolve([])
      ])
        .then(([dateValideResponse]) => {
          dateValide = dateValideResponse;
          dropdowns.sessioni = createDropdown("sessioni");
          dropdowns.insegnamenti = createDropdown("insegnamenti");
          updateSessioniDropdown(dropdowns.sessioni, dateValide);

          // Configurazione calendario semplificata
          const calendarConfig = {
          locale: "it",
          initialView: 'multiMonthGrid',
          duration: { months: 15 },
          initialDate: window.AnnoAccademicoManager?.getSelectedAcademicYear() ? 
            `${window.AnnoAccademicoManager.getSelectedAcademicYear()}-12-01` : 
            new Date().toISOString().split('T')[0],
          validRange: false,
          selectable: true,
          weekends: false,
          displayEventTime: true,
          eventDisplay: "block",
          eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },

          views: {
            multiMonthList: { type: 'multiMonth', buttonText: 'Lista', multiMonthMaxColumns: 1 },
            multiMonthGrid: { type: 'multiMonth', buttonText: 'Griglia', multiMonthMaxColumns: 3 },
            listaEventi: { type: 'listYear', duration: { years: 2 }, buttonText: 'Eventi' }
          },

          events: function (fetchInfo, successCallback, failureCallback) {
            // Cache semplificata
            if (eventsCache.length > 0 && Date.now() - lastFetchTime < CACHE_DURATION) {
              successCallback(eventsCache.filter(ev => ev?.start));
              return;
            }

            const params = new URLSearchParams({ docente: currentUsername });
            
            // Aggiungi insegnamenti selezionati
            const selectedInsegnamenti = window.InsegnamentiManager?.getSelectedInsegnamenti() || [];
            if (selectedInsegnamenti.length > 0) {
              params.append("insegnamenti", selectedInsegnamenti.join(","));
            }
            
            // Aggiungi anno accademico
            const selectedYear = window.AnnoAccademicoManager?.getSelectedAcademicYear();
            if (selectedYear) {
              params.append("anno", selectedYear);
            }

            fetch(`/api/get-esami?${params.toString()}`)
              .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
              .then(events => {
                const validEvents = (events || []).filter(ev => ev?.start).map(event => {
                  const esameDelDocente = event.extendedProps?.esameDelDocente;
                  
                  return {
                    ...event,
                    // Applica stile giallo per esami non del docente
                    ...(!esameDelDocente && {
                      backgroundColor: 'var(--color-warning)',
                      borderColor: 'var(--color-warning)',
                      textColor: '#000'
                    })
                  };
                });
                
                eventsCache = validEvents;
                lastFetchTime = Date.now();
                successCallback(validEvents);
              })
              .catch(failureCallback);
          },

          headerToolbar: {
            left: "pulsanteSessioni pulsanteInsegnamenti",
            center: "multiMonthList,multiMonthGrid,listaEventi",
            right: "aggiungiEsame"
          },

          customButtons: {
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
              click: () => window.importExamsFromFile()
            }
          },

          dateClick: function (info) {
            // Se siamo in modalità duplicazione, ignora questo listener
            if (window.isDuplicationMode) {
              return;
            }
            
            const selDateFormatted = formatDateForInput(info.date);
            
            // Ottieni date provvisorie visibili
            const visibleProvisionalDates = window.EsameAppelli?.getVisibleSectionDates?.() || [];
            const validationResult = isDateValid(info.date, dateValide, visibleProvisionalDates);

            // Gestione date disabilitate per utenti non admin
            if (!validationResult.isValid && !isAdmin) {
              // Controlla se è un conflitto con sessioni (non con altri eventi)
              if (!validationResult.isSameDayConflict && !validationResult.isProvisionalConflict) {
                // Data fuori dalle sessioni - mostra popup di conferma
                const confirmMessage = "Si sta inserendo un esame fuori dalle sessioni, è possibile inserire solo prove parziali non ufficiali (queste date non appariranno nel calendario).";
                
                if (confirm(confirmMessage)) {
                  // Apri form con modalità prova parziale non ufficiale
                  const formContainer = document.getElementById('form-container');
                  const isFormOpen = formContainer?.style.display === 'block';
                  
                  if (isFormOpen) {
                    window.FormEsameData?.handleDateSelection?.(selDateFormatted, { isNonOfficialPartial: true });
                  } else {
                    window.EsameForm?.showForm({ date: selDateFormatted, isNonOfficialPartial: true })
                      .then(formOpened => {
                        if (formOpened) {
                          setTimeout(() => window.FormEsameData?.handleDateSelection?.(selDateFormatted, { isNonOfficialPartial: true }), 100);
                        }
                      })
                      .catch(error => console.error('Errore apertura form:', error));
                  }
                }
                return;
              } else {
                // Altri tipi di conflitto - mostra messaggio di errore
                const messages = {
                  isSameDayConflict: 'Non è possibile inserire due esami nello stesso giorno.',
                  isProvisionalConflict: 'Non è possibile inserire esami a meno di 14 giorni di distanza da altri eventi con proprietà "Appello ufficiale".',
                  default: validationResult.message
                };
                
                const messageKey = validationResult.isSameDayConflict ? 'isSameDayConflict' : 
                                 validationResult.isProvisionalConflict ? 'isProvisionalConflict' : 'default';
                
                window.showMessage?.(messages[messageKey], 'Attenzione', 'warning');
                return;
              }
            }
            
            // Gestione apertura form ottimizzata per date valide
            const formContainer = document.getElementById('form-container');
            const isFormOpen = formContainer?.style.display === 'block';
            
            if (isFormOpen) {
              window.FormEsameData?.handleDateSelection?.(selDateFormatted);
            } else {
              window.EsameForm?.showForm({ date: selDateFormatted })
                .then(formOpened => {
                  if (formOpened) {
                    setTimeout(() => window.FormEsameData?.handleDateSelection?.(selDateFormatted), 100);
                  }
                })
                .catch(error => console.error('Errore apertura form:', error));
            }
          },

          eventClick: async function (clickInfo) {
            const { event } = clickInfo;
            
            if (event.extendedProps?.isProvisional) {
              console.log("Evento provvisorio cliccato:", event);
              return;
            }

            // Gestione modifica esame esistente
            if (event.id) {
              // Apri il form
              window.EsameForm?.showForm?.({ id: event.id }, true);
            } else {
              console.error("ID dell'esame non trovato nell'evento:", event);
              alert("Impossibile modificare l'esame: ID non trovato.");
            }
          },

          eventContent: function (arg) {
            const titoloInsegnamento = arg.event.title || 'Insegnamento';
            const cognomeDocente = arg.event.extendedProps?.docenteCognome || (userData?.user_data?.cognome || 'Docente');

            if (arg.event.extendedProps?.isProvisional) {
              const dataAppello = arg.event.start?.toLocaleDateString('it-IT') || '';
              const isDuplication = arg.event.extendedProps?.isDuplication || false;
              const titleText = isDuplication ? 'Nuovo esame (duplicato)' : 'Nuovo esame';
              
              return {
                html: `<div class="fc-event-time fc-sticky">${dataAppello}</div>
                       <div class="fc-event-title">${cognomeDocente} - ${titleText}</div>`
              };
            }

            const timeString = arg.event.start?.toLocaleTimeString('it-IT', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            }) || '';

            return {
              html: `<div class="fc-event-time fc-sticky">${timeString}</div>
                     <div class="fc-event-title">${cognomeDocente} - ${titoloInsegnamento}</div>`
            };
          },

          dayCellClassNames: function (arg) {
            // Disabilita date non valide per utenti non admin
            if (!isAdmin) {
              const validation = isDateValid(arg.date, dateValide, []);
              return validation.isValid ? [] : ["fc-day-disabled"];
            }
            return [];
          }
        };

        calendar = new FullCalendar.Calendar(calendarEl, calendarConfig);
        setupDropdownClickListeners(calendar, dropdowns, currentUsername, updateDateValideState);
        setupGlobalClickListeners(dropdowns);
        calendar.render();
        window.calendar = calendar;

        // Gestione cambio insegnamenti con debounce
        if (window.InsegnamentiManager) {
          let debounceTimer;
          window.InsegnamentiManager.onChange(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              loadDateValide(currentUsername).then(newDates => {
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
    }

  });

  setupCloseHandlers(calendar);
});