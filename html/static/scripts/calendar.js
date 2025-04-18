import {
  createDropdown,
  populateInsegnamentiDropdown,
  loadDateValide,
  updateSessioniDropdown,
  handleDropdownButtonClick,
  setupDropdownClickListeners,
  setupGlobalClickListeners,
  updateCalendarWithDates,
  setupCloseHandlers
} from "./calendarUtils.js";

document.addEventListener("DOMContentLoaded", function () {
  // Assicuriamoci che i dati utente siano precaricati
  window.preloadUserData();

  // Calcola il range valido direttamente qui
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11
  const startYear = currentMonth < 8 ? currentYear : currentYear + 1; // Se prima di settembre (indice 8), anno corrente, altrimenti prossimo
  const dateRange = {
      start: `${startYear}-01-01`,
      end: `${startYear + 1}-04-30`, // Finisce sempre ad Aprile dell'anno successivo allo startYear
      today: today.toISOString().split('T')[0]
  };

  var calendarEl = document.getElementById("calendar");

  // Variabili globali per i dati dell'utente
  let userData = null;
  let currentUsername = null;
  let isAdmin = false;

  // Variabile per memorizzare le date valide correnti
  let dateValide = [];

  // Variabile per cache eventi
  let eventsCache = [];
  let lastFetchTime = 0;

  // Oggetto per gestire i dropdown
  let dropdowns = {
    insegnamenti: null,
    sessioni: null
  };

  // Riferimento al calendario FullCalendar
  let calendar = null;

  // Funzione globale per forzare il refresh (usata da deleteEsame e potenzialmente da EsameForm)
  window.forceCalendarRefresh = function () {
    eventsCache = [];
    lastFetchTime = 0;
    if (calendar) {
      calendar.refetchEvents();
    }
  };

  // Callback per aggiornare dateValide state
  const updateDateValideState = (newDates) => {
    dateValide = newDates;
  };

  // Ottieni i dati dell'utente una sola volta all'inizio
  getUserData().then(data => {
    userData = data;
    currentUsername = data?.user_data?.username;
    isAdmin = data?.authenticated && data?.user_data?.permessi_admin;

    // Carica le date valide iniziali e precarica gli insegnamenti
    Promise.all([
      loadDateValide(currentUsername), // Carica date per l'utente corrente
      window.InsegnamentiManager ?
        window.InsegnamentiManager.loadInsegnamenti(currentUsername) :
        Promise.resolve([]) // Carica insegnamenti
    ])
      .then(
        ([dateValideResponse, insegnamentiCachedResult]) => {
          // Salva le date valide iniziali
          dateValide = dateValideResponse;

          // Crea dropdown una sola volta
          dropdowns.sessioni = createDropdown("sessioni");
          dropdowns.insegnamenti = createDropdown("insegnamenti");

          // Popola dropdown sessioni iniziale
          updateSessioniDropdown(dropdowns.sessioni, dateValide);

          // Determina quali pulsanti mostrare in base ai permessi
          const rightButtons = isAdmin
            ? "pulsanteInsegnamenti pulsanteDebug"
            : "pulsanteInsegnamenti";

          // Configurazione calendario
          calendar = new FullCalendar.Calendar(calendarEl, {
            contentHeight: "auto",
            locale: "it",
            initialView: 'multiMonthList',
            duration: { months: 16 },
            initialDate: dateRange.start,
            validRange: dateRange,
            selectable: true,

            views: {
              multiMonthList: {
                type: 'multiMonth',
                buttonText: 'Lista',
                multiMonthMaxColumns: 1
              },
              multiMonthGrid: {
                type: 'multiMonth',
                buttonText: 'Griglia',
                multiMonthMaxColumns: 3
              },
              listaEventi: {
                type: 'listYear',
                duration: { years: 2 },
                buttonText: 'Eventi',
                listDayFormat: { month: 'long', year: 'numeric' }
              }
            },

            // Funzione per caricare gli eventi con cache
            events: function (fetchInfo, successCallback, failureCallback) {
              const currentTime = new Date().getTime();
              // Usa cache se valida (es. 5 minuti)
              if (eventsCache.length > 0 && currentTime - lastFetchTime < 300000) {
                // Filtra eventi senza start valido
                const validEvents = (eventsCache || []).filter(ev => ev && ev.start);
                successCallback(validEvents);
                return;
              }

              // Altrimenti, carica gli eventi
              let params = new URLSearchParams();
              params.append("docente", currentUsername); // Sempre il docente loggato

              // Aggiungi insegnamenti selezionati da InsegnamentiManager
              if (window.InsegnamentiManager) {
                const selected = window.InsegnamentiManager.getSelectedCodes();
                if (selected.length > 0) {
                  params.append("insegnamenti", selected.join(","));
                }
              }

              // Carica gli eventi
              fetch(`/api/getEsami?${params.toString()}`)
                .then(response => {
                    if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
                    return response.json();
                })
                .then((events) => {
                  // Filtra eventi senza start valido
                  const validEvents = (events || []).filter(ev => ev && ev.start);
                  eventsCache = validEvents;
                  lastFetchTime = currentTime;
                  successCallback(validEvents); // Passa solo eventi validi
                })
                .catch((error) => {
                  console.error("Errore nel caricamento degli esami:", error);
                  failureCallback(error); // Notifica FullCalendar dell'errore
                });
            },

            headerToolbar: {
              left: "title",
              center: "pulsanteSessioni multiMonthList,multiMonthGrid,listaEventi",
              right: rightButtons + " aggiungiEsame", // Pulsanti personalizzati e viste
            },

            // Pulsanti personalizzati
            customButtons: {
              // Sessioni d'esame
              pulsanteSessioni: {
                text: "Sessioni",
                click: function (e) {
                  handleDropdownButtonClick(e, "sessioni", calendar, dropdowns);
                },
              },
              // Filtro insegnamenti
              pulsanteInsegnamenti: {
                text: "Insegnamenti",
                click: function (e) {
                  handleDropdownButtonClick(e, "insegnamenti", calendar, dropdowns, () => {
                    if (window.InsegnamentiManager) {
                       // Non serve più planningYear qui
                       populateInsegnamentiDropdown(
                         dropdowns.insegnamenti,
                         currentUsername
                       );
                    } else {
                       dropdowns.insegnamenti.innerHTML = "<div class='dropdown-error'>Manager non disponibile</div>";
                    }
                  });
                },
              },
              // Debug: tutti gli esami (solo admin)
              pulsanteDebug: isAdmin ? {
                text: "(Debug) Tutti gli esami",
                click: function () {
                  eventsCache = [];
                  lastFetchTime = 0;
                  const originalUsername = currentUsername;
                  currentUsername = 'admin';
                  calendar.refetchEvents();
                  currentUsername = originalUsername;
                },
              } : undefined,
              aggiungiEsame: {
                text: "Aggiungi Esame",
                click: function () {
                  if (userData?.authenticated) {
                    if (window.EsameForm) {
                      window.EsameForm.showForm({}, false);
                    } else {
                      console.error("EsameForm non disponibile");
                      showMessage("Modulo non disponibile", "Errore", "error");
                    }
                  } else {
                    showMessage(
                      "Effettua il login per inserire un esame",
                      "Informazione",
                      "notification"
                    );
                  }
                },
              },
            },

            // Impostazioni visualizzazione
            weekends: false,
            displayEventTime: true,
            eventDisplay: "block",
            eventTimeFormat: {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            },
            showNonCurrentDates: false,
            fixedWeekCount: false,

            // Aggiorna titolo con mese e sessione quando cambia la vista/data
            datesSet: function (dateInfo) {
              updateCalendarWithDates(calendar, dateValide);
            },

            // Click su una data per aggiungere esame
            dateClick: function (info) {
              const dataClick = info.date;
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              if (dataClick < today) {
                showMessage(
                  "Non è possibile inserire esami in date passate",
                  "Informazione",
                  "notification"
                );
                return;
              }

              const dataValida = isAdmin || dateValide.some(([start, end]) => {
                const startDate = new Date(start);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(end);
                endDate.setHours(23, 59, 59, 999);
                return dataClick >= startDate && dataClick <= endDate;
              });

              if (!dataValida) {
                showMessage(
                  "Non è possibile inserire esami al di fuori delle sessioni o delle pause didattiche",
                  "Informazione",
                  "notification"
                );
                return;
              }

              if (userData?.authenticated) {
                if (window.EsameForm) {
                  window.EsameForm.showForm({ date: info.dateStr }, false);
                } else {
                  console.error("EsameForm non disponibile");
                  showMessage("Modulo non disponibile", "Errore", "error");
                }
              } else {
                showMessage(
                  "Effettua il login per inserire un esame",
                  "Informazione",
                  "notification"
                );
              }
            },

            // Click su un evento esistente per modificarlo
            eventClick: function (info) {
              const eventDocente = info.event.extendedProps.docente;
              const examId = info.event.id;

              if (eventDocente !== currentUsername && !isAdmin) {
                window.showMessage(
                  "Non hai i permessi per modificare esami di un altro docente",
                  "Permesso negato",
                  "notification"
                );
                return;
              }

              if (window.EsameForm) {
                fetch(`/api/getEsameById?id=${examId}`)
                  .then(response => {
                      if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
                      return response.json();
                  })
                  .then(data => {
                    if (data.success && data.esame) {
                      try {
                        window.EsameForm.showForm(data.esame, true);
                      } catch (err) {
                        console.error("Errore nella compilazione del form:", err);
                        showMessage("Errore nella compilazione del form: " + err.message, "Errore", "error");
                      }
                    } else {
                      console.error("Errore nella risposta API:", data.message);
                      showMessage(data.message || "Esame non trovato", "Errore", "error");
                    }
                  })
                  .catch(error => {
                    console.error("Errore nel caricamento dei dettagli dell'esame:", error);
                    showMessage("Errore nel caricamento dei dettagli dell'esame", "Errore", "error");
                  });
              } else {
                console.error("EsameForm non disponibile");
                showMessage("Impossibile modificare l'esame: modulo non disponibile", "Errore", "error");
              }
            },

            // Stile eventi (quando montati nel DOM)
            eventDidMount: function (info) {
              if (info.event.extendedProps.description) {
                  info.el.title = info.event.extendedProps.description;
              }

              const isOwnExam = info.event.extendedProps.docente === currentUsername;
              const isOwnInsegnamento = info.event.extendedProps.insegnamentoDocente;

              const eventColor = (isOwnExam || isOwnInsegnamento)
                  ? "var(--color-light-blue)"
                  : "#FFD700";

              const textColor = (isOwnExam || isOwnInsegnamento)
                  ? "var(--color-bg)"
                  : "#000";

              info.el.style.backgroundColor = eventColor;
              info.el.style.borderColor = eventColor;

              const innerContent = info.el.querySelector('.fc-event-main-frame');
              if (innerContent) {
                  innerContent.style.color = textColor;
                  const links = innerContent.querySelectorAll('a');
                  links.forEach(link => link.style.color = textColor);
              }
            },

            // Contenuto HTML custom per gli eventi
            eventContent: function (arg) {
              const event = arg.event;
              const docenteNome = event.extendedProps.docenteNome || 'Docente non specificato';
              const tipoAppello = event.extendedProps.tipo_appello;
              const isProvaParziale = tipoAppello === 'PP';

              const titolo = isProvaParziale
                ? `${event.title} (Parziale)`
                : event.title;

              return {
                html: `
                <div class="fc-event-main-frame">
                  ${arg.timeText ? `<div class="fc-event-time">${arg.timeText}</div>` : ''}
                  <div class="fc-event-title">${titolo}</div>
                  <div class="fc-event-description">${docenteNome}</div>
                </div>
              `};
            },

            // Disabilita date fuori sessione (o passate) per utenti non admin
            dayCellClassNames: function (arg) {
              const dataCorrente = arg.date;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const cellDate = new Date(dataCorrente.getTime());
              cellDate.setHours(0, 0, 0, 0);

              if (cellDate < today) {
                return ['fc-disabled-day'];
              }

              if (!isAdmin) {
                const dataValida = dateValide.some(([start, end]) => {
                  const startDate = new Date(start);
                  startDate.setHours(0, 0, 0, 0);
                  const endDate = new Date(end);
                  endDate.setHours(23, 59, 59, 999);
                  return cellDate >= startDate && cellDate <= endDate;
                });
                return dataValida ? [] : ["fc-disabled-day"];
              }

              return [];
            },

            // Disabilita selezione date passate
            selectConstraint: {
              start: dateRange.today
            },
          });

          setupDropdownClickListeners(calendar, dropdowns, currentUsername, updateDateValideState, dateRange);
          setupGlobalClickListeners(dropdowns);

          calendar.render();
          window.calendar = calendar;

          if (window.InsegnamentiManager) {
            let debounceTimer;
            window.InsegnamentiManager.onChange(() => {
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                loadDateValide(currentUsername)
                  .then(newDates => {
                    dateValide = newDates;
                    updateSessioniDropdown(dropdowns.sessioni, dateValide);
                    updateCalendarWithDates(calendar, dateValide);
                    eventsCache = [];
                    lastFetchTime = 0;
                    calendar.refetchEvents();
                  })
                  .catch(error => console.error("Errore ricaricando date valide post selezione:", error));
              }, 300);
            });
          }
        }
      )
      .catch((error) => {
        console.error("Errore durante l'inizializzazione del calendario:", error);
        if (calendarEl) {
            calendarEl.innerHTML =
              '<div class="error-message">Si è verificato un errore durante il caricamento del calendario.</div>';
        }
      });
  });

  setupCloseHandlers(calendar);

  function deleteEsame(examId) {
    if (!examId) return;

    if (!confirm("Sei sicuro di voler eliminare questo esame?")) {
        return;
    }

    fetch('/api/deleteEsame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: examId }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showMessage("Esame eliminato con successo", "Successo", "success");
          const popupOverlay = document.getElementById("popupOverlay");
          if (popupOverlay) popupOverlay.style.display = "none";
          window.forceCalendarRefresh();
        } else {
          showMessage(data.message || "Errore nell'eliminazione dell'esame", "Errore", "error");
        }
      })
      .catch(error => {
        console.error("Errore nella richiesta di eliminazione:", error);
        showMessage("Errore nella richiesta di eliminazione", "Errore", "error");
      });
  }
  window.deleteEsame = deleteEsame;

});
