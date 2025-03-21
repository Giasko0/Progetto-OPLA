import {
  getValidDateRange,
  getPlanningYear,
  createDropdown,
  populateInsegnamentiDropdown,
  fetchCalendarEvents,
  loadDateValide,
  createInsegnamentoTag,
  updateHiddenSelect,
} from "./calendarUtils.js";

document.addEventListener("DOMContentLoaded", function () {
  // Inizializzazione
  const planningYear = getPlanningYear();
  const dateRange = getValidDateRange();
  var calendarEl = document.getElementById("calendar");

  // Variabile per tener traccia del CdS selezionato
  let selectedCds = null;

  // Variabile per memorizzare le date valide correnti
  let dateValide = [];

  // Controlla se l'utente è un amministratore
  let isAdmin = false;

  // Funzione per verificare i permessi di amministratore
  function checkAdminPermissions() {
    return getUserData()
      .then((data) => {
        isAdmin =
          data.authenticated && data.user_data && data.user_data.permessi_admin;
        return isAdmin;
      })
      .catch((error) => {
        console.error("Errore nella verifica dei permessi:", error);
        return false;
      });
  }

  // Ottieni il docente loggato per riutilizzarlo
  const loggedDocente = document.cookie
    .split("; ")
    .find((row) => row.startsWith("username="))
    ?.split("=")[1];

  // Carica le date valide e verifica i permessi in modo ottimizzato
  Promise.all([
    loadDateValide(loggedDocente, planningYear), // Uso della nuova funzione
    checkAdminPermissions(),
  ])
    .then(([dateValideResponse]) => {
      // Salva le date valide
      dateValide = dateValideResponse;

      // Crea dropdown una sola volta
      const dropdownSessioni = createDropdown("sessioni");
      const dropdownInsegnamenti = createDropdown("insegnamenti");
      const dropdownCds = createDropdown("cds");

      // Popola dropdown sessioni
      updateSessioniDropdown(dropdownSessioni, dateValide);

      // Determina quali pulsanti mostrare in base ai permessi
      const rightButtons = isAdmin
        ? "pulsanteCds pulsanteInsegnamenti pulsanteSessioni pulsanteDebug prev,next today"
        : "pulsanteCds pulsanteInsegnamenti pulsanteSessioni prev,next today";

      // Verifica se il docente ha più di un CdS
      fetch(`/api/ottieniCdSDocente?docente=${loggedDocente}&anno=${planningYear}`)
        .then((response) => response.json())
        .then((data) => {
          // Se il docente ha un solo CdS, rimuovi il pulsante CdS
          const hasMultipleCds = data.length > 1;
          const finalRightButtons = hasMultipleCds 
            ? rightButtons 
            : rightButtons.replace('pulsanteCds ', '');

          // Aggiorna la configurazione del calendario
          calendar.setOption('headerToolbar', {
            left: "title",
            center: "",
            right: finalRightButtons + ' aggiungiEsame'
          });

          // Se c'è un solo CdS, impostalo come selezionato
          if (data.length === 1) {
            selectedCds = data[0].codice;
          }
        })
        .catch((error) => {
          console.error("Errore nel caricamento dei CdS:", error);
        });

      // Configurazione calendario
      var calendar = new FullCalendar.Calendar(calendarEl, {
        contentHeight: "60dvh",
        locale: "it",
        initialDate: dateRange.start,
        initialView: "dayGridMonth",
        selectable: true,
        // Eventi dal server
        events: (info, successCallback) =>
          fetchCalendarEvents(
            calendar,
            planningYear,
            info,
            successCallback,
            selectedCds
          ),
        validRange: getValidDateRange,

        headerToolbar: {
          left: "title",
          center: "",
          right: rightButtons + ' aggiungiEsame' // Aggiungi il pulsante alla toolbar
        },

        // Pulsanti personalizzati
        customButtons: {
          // Corso di Studio
          pulsanteCds: {
            text: "Corso di Studio",
            click: function (e) {
              // Mostra dropdown CdS
              const button = e.currentTarget;
              const rect = button.getBoundingClientRect();
              dropdownCds.style.top = `${rect.bottom}px`;
              dropdownCds.style.left = `${rect.left}px`;
              dropdownCds.classList.toggle("show");

              // Chiudi altri dropdown
              dropdownSessioni.classList.remove("show");
              dropdownInsegnamenti.classList.remove("show");

              // Recupera i CdS associati al docente
              if (loggedDocente) {
                fetch(
                  `/api/ottieniCdSDocente?docente=${loggedDocente}&anno=${planningYear}`
                )
                  .then((response) => response.json())
                  .then((data) => {
                    // Pulisci il dropdown
                    dropdownCds.innerHTML = "";

                    // Aggiungi l'opzione "Tutti i CdS"
                    const itemAll = document.createElement("div");
                    itemAll.className = "dropdown-item";
                    itemAll.dataset.codice = "";
                    itemAll.textContent = "Tutti i CdS";
                    if (!selectedCds) {
                      itemAll.classList.add("selected");
                    }
                    dropdownCds.appendChild(itemAll);

                    // Aggiungi le opzioni per ogni CdS
                    data.forEach((cds) => {
                      const item = document.createElement("div");
                      item.className = "dropdown-item";
                      item.dataset.codice = cds.codice;
                      item.textContent = `${cds.nome_corso} (${cds.codice})`;
                      if (selectedCds === cds.codice) {
                        item.classList.add("selected");
                      }
                      dropdownCds.appendChild(item);
                    });
                  })
                  .catch((error) => {
                    console.error("Errore nel caricamento dei CdS:", error);
                  });
              }
            },
          },
          // Sessioni d'esame
          pulsanteSessioni: {
            text: "Sessioni",
            click: function (e) {
              // Mostra dropdown sessioni
              const button = e.currentTarget;
              const rect = button.getBoundingClientRect();
              dropdownSessioni.style.top = `${rect.bottom}px`;
              dropdownSessioni.style.left = `${rect.left}px`;
              dropdownSessioni.classList.toggle("show");

              // Chiudi altri dropdown
              dropdownInsegnamenti.classList.remove("show");
              dropdownCds.classList.remove("show");
            },
          },
          // Filtro insegnamenti
          pulsanteInsegnamenti: {
            text: "Insegnamenti",
            click: function (e) {
              // Mostra dropdown insegnamenti
              const button = e.currentTarget;
              const rect = button.getBoundingClientRect();
              dropdownInsegnamenti.style.top = `${rect.bottom}px`;
              dropdownInsegnamenti.style.left = `${rect.left}px`;

              // Chiudi altri dropdown
              dropdownSessioni.classList.remove("show");
              dropdownCds.classList.remove("show");

              // Popola dropdown
              if (loggedDocente) {
                populateInsegnamentiDropdown(
                  dropdownInsegnamenti,
                  loggedDocente,
                  planningYear,
                  selectedCds
                );
              }
            },
          },
          // Debug: tutti gli esami (solo admin)
          pulsanteDebug: {
            text: "(Debug) Tutti gli esami",
            click: function () {
              // Rimuovi eventi esistenti
              calendar.getEventSources().forEach((source) => source.remove());

              // Carica tutti gli esami
              fetch("/api/ottieniEsami?all=true")
                .then((response) => response.json())
                .then((data) => {
                  calendar.addEventSource(data);
                })
                .catch((error) => {
                  console.error("Errore nel caricamento degli esami:", error);
                });
            },
          },
          aggiungiEsame: {
            text: 'Aggiungi Esame',
            click: function() {
              // Controlla login usando il sistema di cache
              getUserData()
                .then((data) => {
                  if (data.authenticated) {
                    // Importa il modulo esameFormModule.js e usa la funzione showEsameForm 
                    import('./esameFormModule.js')
                      .then(module => {
                        module.showEsameForm({}); // Passa un oggetto vuoto
                      })
                      .catch(error => {
                        console.error('Errore nell\'importazione del modulo form:', error);
                        document.getElementById('popupOverlay').style.display = 'flex';
                      });
                  } else {
                    showNotification("Effettua il login per inserire un esame", "Informazione");
                  }
                })
                .catch((error) => {
                  console.error("Errore nella verifica dell'autenticazione:", error);
                  showNotification("Devi essere loggato per inserire un esame.", "Errore");
                });
            }
          },
        },

        // Testo pulsanti
        buttonText: {
          today: "Oggi",
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
        slotMinTime: "08:00:00",
        slotMaxTime: "19:00:00",
        allDaySlot: false,
        slotDuration: "05:00:00",
        slotLabelContent: function (arg) {
          return arg.date.getHours() < 13 ? "Mattina" : "Pomeriggio";
        },

        // Aggiorna titolo con mese e sessione
        datesSet: function (info) {
          const currentDate = info.view.currentStart;
          const monthStart = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            1
          );
          const monthEnd = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0
          );

          // Trova la sessione corrente
          let sessioneCorrente = "";
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
          const monthName = currentDate.toLocaleString("it-IT", {
            month: "long",
            year: "numeric",
          });
          const title = `${
            monthName.charAt(0).toUpperCase() + monthName.slice(1)
          }${sessioneCorrente}`;

          // Aggiorna titolo
          document.querySelector(".fc-toolbar-title").textContent = title;
        },

        // Click su una data
        dateClick: function (info) {
          const dataClick = info.date;
          // Periodo: mattina/pomeriggio
          const periodo =
            info.view.type === "timeGrid"
              ? info.date.getHours() < 14
                ? "0"
                : "1"
              : null;

          // Verifica data in sessione valida
          const dataValida = dateValide.some(([start, end]) => {
            const startDate = new Date(start);
            // Reset delle ore per la data di inizio per un confronto corretto
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);

            return dataClick >= startDate && dataClick <= endDate;
          });

          // Blocca date fuori sessione
          if (!dataValida) {
            showNotification(
              "Non è possibile inserire esami al di fuori delle sessioni o delle pause didattiche",
              "Informazione"
            );
            return;
          }

          // Controlla login usando il sistema di cache
          getUserData()
            .then((data) => {
              if (data.authenticated) {
                // Importa il modulo esameFormModule.js e usa la funzione showEsameForm
                import('./esameFormModule.js')
                  .then(module => {
                    module.showEsameForm(info);
                  })
                  .catch(error => {
                    console.error('Errore nell\'importazione del modulo form:', error);
                    // Fallback al metodo tradizionale
                    const dataElement = document.getElementById('dataora');
                    if (dataElement) dataElement.value = info.dateStr;
                    document.getElementById('popupOverlay').style.display = 'flex';
                  });
              } else {
                showNotification("Effettua il login per inserire un esame", "Informazione");
              }
            })
            .catch((error) => {
              console.error(
                "Errore nella verifica dell'autenticazione:",
                error
              );
              showNotification("Devi essere loggato per inserire un esame.", "Errore");
            });
        },

        // Dettagli evento al click
        eventClick: function (info) {
          //TODO Inserire qui la modifica dell'appello
        },

        // Stile eventi
        eventDidMount: function (info) {
          // Tooltip
          info.el.title = info.event.extendedProps.description;

          // Colori differenziati
          const eventColor =
            info.event.extendedProps.docente === loggedDocente
              ? "#0A58CA" // blu: propri esami
              : "#FFD700"; // giallo: altri esami

          const textColor =
            info.event.extendedProps.docente === loggedDocente
              ? "white" // testo bianco
              : "black"; // testo nero

          // Applica colori
          info.el.style.backgroundColor = eventColor;
          info.el.style.borderColor = eventColor;

          // Colora testo interno
          const innerDivs = info.el.querySelectorAll("div");
          innerDivs.forEach((div) => {
            div.style.color = textColor;
          });
        },

        // Contenuto HTML eventi
        eventContent: function (arg) {
          const event = arg.event;
          const docenteNome = event.extendedProps.docenteNome;
          
          return {
            html: `
              <div class="fc-event-main-frame">
                <div class="fc-event-time">${arg.timeText}</div>
                <div class="fc-event-title">${event.title}</div>
                <div class="fc-event-description">${docenteNome}</div>
                </div>
              </div>
            `,
          };
        },

        // Disabilita date fuori sessione
        dayCellClassNames: function (arg) {
          const dataCorrente = arg.date;

          // Verifica data in sessione
          const dataValida = dateValide.some(([start, end]) => {
            const startDate = new Date(start);
            // Reset delle ore per la data di inizio per un confronto corretto
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);

            return dataCorrente >= startDate && dataCorrente <= endDate;
          });

          // Applica classe per date non valide
          return dataValida ? [] : ["fc-disabled-day"];
        },
      });

      // Funzione helper per precaricare gli insegnamenti selezionati nel form
      function preloadSelectedInsegnamenti() {
        if (
          window.InsegnamentiManager &&
          window.InsegnamentiManager.getSelectedCodes().length > 0
        ) {
          // Prepara contenitore
          const multiSelectBox = document.getElementById("insegnamentoBox");
          if (multiSelectBox) {
            // Salva placeholder
            const placeholder = multiSelectBox.querySelector(
              ".multi-select-placeholder"
            );

            // Svuota contenitore
            multiSelectBox.innerHTML = "";

            // Ripristina placeholder se necessario
            if (
              placeholder &&
              window.InsegnamentiManager.getSelectedCodes().length === 0
            ) {
              multiSelectBox.appendChild(placeholder.cloneNode(true));
            }

            // Carica insegnamenti selezionati
            window.InsegnamentiManager.loadSelectedInsegnamenti(
              loggedDocente,
              function (data) {
                if (data.length > 0) {
                  // Rimuovi placeholder
                  const placeholder = multiSelectBox.querySelector(
                    ".multi-select-placeholder"
                  );
                  if (placeholder) {
                    placeholder.remove();
                  }

                  // Crea tag per insegnamenti
                  data.forEach((ins) => {
                    createInsegnamentoTag(
                      ins.codice,
                      ins.titolo,
                      multiSelectBox
                    );
                  });

                  // Aggiorna select nascosta
                  updateHiddenSelect(multiSelectBox);

                  // Aggiorna opzioni nel dropdown
                  const options = document.querySelectorAll(
                    "#insegnamentoOptions .multi-select-option"
                  );
                  options.forEach((option) => {
                    if (
                      window.InsegnamentiManager.isSelected(
                        option.dataset.value
                      )
                    ) {
                      option.classList.add("selected");
                    }
                  });
                }
              }
            );
          }
        }
      }

      // Gestione click sui dropdown

      // Dropdown CdS
      dropdownCds.addEventListener("click", (e) => {
        const item = e.target.closest(".dropdown-item");
        if (!item) return;

        // Rimuovi selezione precedente
        dropdownCds.querySelectorAll(".dropdown-item").forEach((el) => {
          el.classList.remove("selected");
        });

        // Aggiungi selezione al nuovo item
        item.classList.add("selected");

        // Salva il CdS selezionato
        selectedCds = item.dataset.codice || null;

        // Ottieni le nuove date valide e aggiorna il calendario
        loadDateValide(loggedDocente, planningYear, selectedCds)
          .then((newDates) => {
            // Aggiorna le date valide
            dateValide = newDates;

            // Aggiorna il calendario con le nuove date
            updateCalendarWithDates(calendar, dateValide);

            // Aggiorna gli eventi
            calendar.setOption("events", (info, successCallback) =>
              fetchCalendarEvents(
                calendar,
                planningYear,
                info,
                successCallback,
                selectedCds
              )
            );

            // Aggiorna anche il dropdown delle sessioni
            updateSessioniDropdown(dropdownSessioni, dateValide);

            // Chiudi il dropdown
            dropdownCds.classList.remove("show");

            // Ricarica il calendario
            calendar.refetchEvents();
          })
          .catch((error) => {
            console.error("Errore nel caricamento delle date valide:", error);
            // In caso di errore, mantieni le date precedenti
          });
      });

      // Funzione helper per aggiornare il calendario con nuove date
      function updateCalendarWithDates(calendar, dates) {
        calendar.setOption("dayCellClassNames", function (arg) {
          const dataCorrente = arg.date;

          // Verifica data in sessione
          const dataValida = dates.some(([start, end]) => {
            const startDate = new Date(start);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);

            return dataCorrente >= startDate && dataCorrente <= endDate;
          });

          // Applica classe per date non valide
          return dataValida ? [] : ["fc-disabled-day"];
        });
      }

      // Funzione helper per aggiornare il dropdown delle sessioni
      function updateSessioniDropdown(dropdown, dates) {
        if (dropdown) {
          dropdown.innerHTML = "";
          // Aggiungi le voci di menu per ogni tipo di sessione
          for (const [start, end, nome] of dates) {
            const item = document.createElement("div");
            item.className = "dropdown-item";
            item.dataset.data = start;
            item.textContent = nome;
            dropdown.appendChild(item);
          }
        }
      }

      // Dropdown sessioni
      dropdownSessioni.addEventListener("click", (e) => {
        const item = e.target.closest(".dropdown-item");
        if (item) {
          const data = item.dataset.data;
          if (data) {
            // Naviga alla data
            calendar.gotoDate(data);
            dropdownSessioni.classList.remove("show");
          }
        }
      });

      // Dropdown insegnamenti
      dropdownInsegnamenti.addEventListener("click", (e) => {
        // Trova l'elemento dropdown-item o dropdown-item-indented più vicino
        const item = e.target.closest(
          ".dropdown-item, .dropdown-item-indented"
        );
        if (!item) return;

        const checkbox = item.querySelector('input[type="checkbox"]');
        if (!checkbox) return;

        // Se l'elemento cliccato è il checkbox, lascia che il browser gestisca lo stato
        // altrimenti inverti manualmente lo stato del checkbox
        if (e.target.type !== "checkbox") {
          e.preventDefault(); // Previene comportamenti predefiniti di altri elementi
          checkbox.checked = !checkbox.checked;
        }

        // Aggiorna InsegnamentiManager in base allo stato finale del checkbox
        if (window.InsegnamentiManager) {
          const codice = item.dataset.codice;
          const semestre = parseInt(item.dataset.semestre);
          const annoCorso = parseInt(item.dataset.annoCorso) || 1;
          const cds = item.dataset.cds;

          if (checkbox.checked) {
            window.InsegnamentiManager.selectInsegnamento(codice, {
              semestre: semestre,
              anno_corso: annoCorso,
              cds: cds,
            });
          } else {
            window.InsegnamentiManager.deselectInsegnamento(codice);
          }
        }
      });

      // Chiusura dropdown su click fuori
      document.addEventListener("click", (e) => {
        // Dropdown CdS
        if (
          !e.target.closest(".fc-pulsanteCds-button") &&
          !e.target.closest("#cdsDropdown")
        ) {
          dropdownCds.classList.remove("show");
        }

        // Dropdown insegnamenti
        if (
          !e.target.closest(".fc-pulsanteInsegnamenti-button") &&
          !e.target.closest(".calendar-dropdown")
        ) {
          dropdownInsegnamenti.classList.remove("show");
        }

        // Dropdown sessioni
        if (
          !e.target.closest(".fc-pulsanteSessioni-button") &&
          !e.target.closest("#sessioniDropdown")
        ) {
          dropdownSessioni.classList.remove("show");
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
            fetchCalendarEvents(
              calendar,
              planningYear,
              null,
              null,
              selectedCds
            );
          }, 100);
        });
      }

      // Inizializza calendario
      calendar.render();
      window.calendar = calendar;

      // Esponi funzione globale
      window.updateHiddenSelect = (multiSelectBox) =>
        updateHiddenSelect(multiSelectBox);
    })
    .catch((error) =>
      console.error(
        "Errore nel caricamento delle sessioni o verifica permessi:",
        error
      )
    );

  // Gestione chiusura form esami
  const setupCloseHandlers = () => {
    const closeButton = document.getElementById("closeOverlay");
    const popupOverlay = document.getElementById("popupOverlay");

    // Reset e aggiorna calendario
    const resetAndRefreshCalendar = () => {
      window.preselectedInsegnamenti = [];
      if (window.calendar) {
        window.calendar.refetchEvents();
      }
    };

    // Handler pulsante chiusura
    if (closeButton) {
      closeButton.addEventListener("click", function() {
        popupOverlay.style.display = "none";
      });
    }
  };

  // Inizializza handler
  setupCloseHandlers();
});

// Modifica il gestore di eventi per usare la sidebar invece dei popup
function handleCalendarEvents() {
  // ...existing code...
  
  // Modifica la gestione degli errori per usare la sidebar
  fetch('/api/checkPermissions')
    .then(response => {
      if (!response.ok) {
        throw new Error('Errore nella verifica dei permessi');
      }
      return response.json();
    })
    .then(data => {
      if (!data.canInsertExams) {
        // Al posto di showAlert, usa showNotification
        showNotification("Non hai i permessi per inserire esami. Contatta l'amministratore.", "Informazione");
        return;
      }
      
      // ...existing code...
    })
    .catch(error => {
      console.error('Errore:', error);
      showNotification("Si è verificato un errore. Riprova più tardi.", "Errore di sistema");
    });
}

// Sostituisci le chiamate di alert in tutto il file
// Esempio: 
// Da: alert("Messaggio di errore");
// A: showNotification("Messaggio di errore", "Errore");
