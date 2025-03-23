import {
  getValidDateRange,
  getPlanningYear,
  createDropdown,
  populateInsegnamentiDropdown,
  fetchCalendarEvents,
  loadDateValide,
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

  // Variabile per cache eventi
  let eventsCache = [];
  let lastFetchTime = 0;

  // Controlla se l'utente è un amministratore
  let isAdmin = false;

  // Cache per CdS e insegnamenti
  let cachedCds = [];
  let cachedInsegnamenti = [];

  // Oggetto per gestire i dropdown
  let dropdowns = {
    cds: null,
    insegnamenti: null,
    sessioni: null,
  };

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

  // Carica le date valide, verifica i permessi, e precarica CdS e insegnamenti
  Promise.all([
    loadDateValide(loggedDocente),
    checkAdminPermissions(),
    fetch(
      `/api/ottieniCdSDocente?docente=${loggedDocente}&anno=${planningYear}`
    ).then((r) => r.json()),
    fetch(
      `/api/getInsegnamentiDocente?anno=${planningYear}&docente=${loggedDocente}`
    ).then((r) => r.json()),
  ])
    .then(
      ([dateValideResponse, adminPermissions, cdsList, insegnamentiList]) => {
        // Salva le date valide
        dateValide = dateValideResponse;

        // Memorizza nelle cache i risultati delle chiamate API
        cachedCds = cdsList;
        cachedInsegnamenti = insegnamentiList;

        // Crea dropdown una sola volta
        dropdowns.sessioni = createDropdown("sessioni");
        dropdowns.insegnamenti = createDropdown("insegnamenti");
        dropdowns.cds = createDropdown("cds");

        // Popola dropdown sessioni
        updateSessioniDropdown(dropdowns.sessioni, dateValide);

        // Determina quali pulsanti mostrare in base ai permessi
        const rightButtons = isAdmin
          ? "pulsanteCds pulsanteInsegnamenti pulsanteSessioni pulsanteDebug prev,next today"
          : "pulsanteCds pulsanteInsegnamenti pulsanteSessioni prev,next today";

        // Verifica se il docente ha più di un CdS
        const hasMultipleCds = cachedCds.length > 1;
        const finalRightButtons = hasMultipleCds
          ? rightButtons
          : rightButtons.replace("pulsanteCds ", "");

        // Se c'è un solo CdS, impostalo come selezionato
        if (cachedCds.length === 1) {
          selectedCds = cachedCds[0].codice;
        }

        // Configurazione calendario
        var calendar = new FullCalendar.Calendar(calendarEl, {
          contentHeight: "60dvh",
          locale: "it",
          initialDate: dateRange.start,
          initialView: "dayGridMonth",
          selectable: true,

          // Funzione per caricare gli eventi con cache
          events: function (info, successCallback) {
            // Se abbiamo eventi in cache e sono stati caricati meno di 5 minuti fa, usali
            const currentTime = new Date().getTime();
            if (
              eventsCache.length > 0 &&
              currentTime - lastFetchTime < 300000
            ) {
              // 5 minuti
              successCallback(eventsCache);
              return;
            }

            // Altrimenti, carica gli eventi
            let params = new URLSearchParams();
            params.append("docente", loggedDocente);

            // Includi filtri solo se necessario
            if (selectedCds) {
              params.append("cds", selectedCds);
            }

            if (
              window.InsegnamentiManager &&
              window.InsegnamentiManager.getSelectedCodes().length > 0
            ) {
              params.append(
                "insegnamenti",
                window.InsegnamentiManager.getSelectedCodes().join(",")
              );
            }

            // Carica gli eventi
            fetch(`/api/ottieniEsami?${params.toString()}`)
              .then((response) => response.json())
              .then((events) => {
                // Memorizza gli eventi nella cache
                eventsCache = events;
                lastFetchTime = currentTime;
                successCallback(events);
              })
              .catch((error) => {
                console.error("Errore nel caricamento degli esami:", error);
                successCallback([]);
              });
          },

          validRange: getValidDateRange,

          headerToolbar: {
            left: "title",
            center: "",
            right: finalRightButtons + " aggiungiEsame", // Aggiungi il pulsante alla toolbar
          },

          // Pulsanti personalizzati
          customButtons: {
            // Corso di Studio
            pulsanteCds: {
              text: "Corso di Studio",
              click: function (e) {
                handleDropdownButtonClick(e, "cds", () => {
                  // Popola il dropdown con i dati dalla cache
                  dropdowns.cds.innerHTML = "";

                  // Aggiungi l'opzione "Tutti i CdS"
                  const itemAll = document.createElement("div");
                  itemAll.className = "dropdown-item";
                  itemAll.dataset.codice = "";
                  itemAll.textContent = "Tutti i CdS";
                  if (!selectedCds) {
                    itemAll.classList.add("selected");
                  }
                  dropdowns.cds.appendChild(itemAll);

                  // Aggiungi le opzioni per ogni CdS dalla cache
                  cachedCds.forEach((cds) => {
                    const item = document.createElement("div");
                    item.className = "dropdown-item";
                    item.dataset.codice = cds.codice;
                    item.textContent = `${cds.nome_corso} (${cds.codice})`;
                    if (selectedCds === cds.codice) {
                      item.classList.add("selected");
                    }
                    dropdowns.cds.appendChild(item);
                  });
                });
              },
            },
            // Sessioni d'esame
            pulsanteSessioni: {
              text: "Sessioni",
              click: function (e) {
                handleDropdownButtonClick(e, "sessioni");
              },
            },
            // Filtro insegnamenti
            pulsanteInsegnamenti: {
              text: "Insegnamenti",
              click: function (e) {
                handleDropdownButtonClick(e, "insegnamenti", () => {
                  // Verifica se abbiamo gli insegnamenti in cache
                  if (cachedInsegnamenti && cachedInsegnamenti.length > 0) {
                    // Usa i dati precaricati per popolare il dropdown o chiuderlo se è già aperto
                    populateInsegnamentiDropdown(
                      dropdowns.insegnamenti,
                      loggedDocente,
                      planningYear,
                      selectedCds,
                      cachedInsegnamenti
                    );
                  } else {
                    // Fallback alla chiamata API
                    populateInsegnamentiDropdown(
                      dropdowns.insegnamenti,
                      loggedDocente,
                      planningYear,
                      selectedCds
                    );
                  }
                });
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
              text: "Aggiungi Esame",
              click: function () {
                // Controlla login usando il sistema di cache
                getUserData()
                  .then((data) => {
                    if (data.authenticated) {
                      // Utilizza direttamente EsameForm
                      if (window.EsameForm) {
                        window.EsameForm.showForm({});
                      } else {
                        console.error("EsameForm non disponibile");
                      }
                    } else {
                      showMessage(
                        "Effettua il login per inserire un esame",
                        "Informazione",
                        "notification"
                      );
                    }
                  })
                  .catch((error) => {
                    console.error(
                      "Errore nella verifica dell'autenticazione:",
                      error
                    );
                    showMessage(
                      "Devi essere loggato per inserire un esame.",
                      "Errore",
                      "error"
                    );
                  });
              },
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
              showMessage(
                "Non è possibile inserire esami al di fuori delle sessioni o delle pause didattiche",
                "Informazione",
                "notification"
              );
              return;
            }

            // Controlla login usando il sistema di cache
            getUserData()
              .then((data) => {
                if (data.authenticated) {
                  // Utilizza direttamente EsameForm passando la data del click
                  if (window.EsameForm) {
                    window.EsameForm.showForm({ date: info.dateStr });
                  } else {
                    console.error("EsameForm non disponibile");
                  }
                } else {
                  showMessage(
                    "Effettua il login per inserire un esame",
                    "Informazione",
                    "notification"
                  );
                }
              })
              .catch((error) => {
                console.error(
                  "Errore nella verifica dell'autenticazione:",
                  error
                );
                showMessage(
                  "Devi essere loggato per inserire un esame.",
                  "Errore",
                  "error"
                );
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
              info.event.extendedProps.docente === loggedDocente ||
              info.event.extendedProps.insegnamentoDocente
                ? "var(--color-light-blue)" // blu: propri esami o esami di propri insegnamenti
                : "#FFD700"; // giallo: altri esami

            const textColor = "var(--color-bg)";

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
                      window.InsegnamentiManager.createInsegnamentoTag(ins.codice, ins.titolo, multiSelectBox);
                    });

                    // Aggiorna select nascosta
                    window.InsegnamentiManager.updateHiddenSelect(multiSelectBox);

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
        dropdowns.cds.addEventListener("click", (e) => {
          const item = e.target.closest(".dropdown-item");
          if (!item) return;

          // Rimuovi selezione precedente
          dropdowns.cds.querySelectorAll(".dropdown-item").forEach((el) => {
            el.classList.remove("selected");
          });

          // Aggiungi selezione al nuovo item
          item.classList.add("selected");

          // Salva il CdS selezionato sia localmente che in InsegnamentiManager
          selectedCds = item.dataset.codice || null;
          if (window.InsegnamentiManager) {
            window.InsegnamentiManager.setCds(selectedCds);
          }

          // Ottieni le nuove date valide e aggiorna il calendario
          loadDateValide(loggedDocente, selectedCds)
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
              updateSessioniDropdown(dropdowns.sessioni, dateValide);

              // Chiudi il dropdown
              dropdowns.cds.classList.remove("show");

              // Invalida la cache quando cambia il filtro
              eventsCache = [];
              lastFetchTime = 0;

              // Ricarica il calendario
              calendar.refetchEvents();
            })
            .catch((error) => {
              console.error("Errore nel caricamento delle date valide:", error);
              // In caso di errore, mantieni le date precedenti
            });
        });

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
        dropdowns.sessioni.addEventListener("click", (e) => {
          const item = e.target.closest(".dropdown-item");
          if (item) {
            const data = item.dataset.data;
            if (data) {
              // Naviga alla data
              calendar.gotoDate(data);
              dropdowns.sessioni.classList.remove("show");
            }
          }
        });

        // Dropdown insegnamenti
        dropdowns.insegnamenti.addEventListener("click", (e) => {
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
            const semestre = parseInt(item.dataset.semestre) || 1;
            const annoCorso = parseInt(item.dataset.annoCorso) || 1;
            const cds = item.dataset.cds || "";
            const titolo = item.querySelector('label')?.textContent || "";

            if (checkbox.checked) {
              // Seleziona l'insegnamento in InsegnamentiManager
              window.InsegnamentiManager.selectInsegnamento(codice, {
                semestre: semestre,
                anno_corso: annoCorso,
                cds: cds,
              });
            } else {
              // Deseleziona l'insegnamento in InsegnamentiManager
              window.InsegnamentiManager.deselectInsegnamento(codice);
            }

            // Invalida la cache quando cambia il filtro
            eventsCache = [];
            lastFetchTime = 0;
          }
        });

        // Funzione unificata per gestire i click sui pulsanti dei dropdown
        function handleDropdownButtonClick(e, type, populateCallback = null) {
          // Ottieni riferimenti al button e al dropdown
          const button = e.currentTarget;
          const dropdown = dropdowns[type];

          // Posiziona il dropdown
          const rect = button.getBoundingClientRect();
          dropdown.style.top = `${rect.bottom}px`;
          dropdown.style.left = `${rect.left}px`;

          // Chiudi gli altri dropdown
          Object.entries(dropdowns).forEach(([key, value]) => {
            if (key !== type && value) {
              value.classList.remove("show");
            }
          });

          // Per il dropdown CdS e Sessioni, utilizziamo sempre un toggle semplice
          // ma invochiamo prima la callback se necessario
          if (populateCallback) {
            populateCallback();
          }

          // Toggle della visibilità
          dropdown.classList.toggle("show");
        }

        // Chiusura dropdown su click fuori
        document.addEventListener("click", (e) => {
          // Gestione unificata per tutti i dropdown
          const dropdownTypes = [
            { button: ".fc-pulsanteCds-button", dropdown: "#cdsDropdown" },
            {
              button: ".fc-pulsanteInsegnamenti-button",
              dropdown: "#insegnamentiDropdown",
            },
            {
              button: ".fc-pulsanteSessioni-button",
              dropdown: "#sessioniDropdown",
            },
          ];

          // Chiudi i dropdown se il click è fuori dai relativi elementi
          dropdownTypes.forEach(({ button, dropdown }) => {
            if (!e.target.closest(button) && !e.target.closest(dropdown)) {
              const dropdownElement = document.querySelector(dropdown);
              if (dropdownElement) {
                dropdownElement.classList.remove("show");
              }
            }
          });
        });

        // InsegnamentiManager con debounce
        if (window.InsegnamentiManager) {
          let debounceTimer;
          window.InsegnamentiManager.onChange(() => {
            // Cancella timer precedente
            if (debounceTimer) clearTimeout(debounceTimer);

            // Aggiorna dopo breve delay e invalida cache
            debounceTimer = setTimeout(() => {
              eventsCache = [];
              lastFetchTime = 0;
              calendar.refetchEvents();
            }, 500); // Aumentato a 500ms per dare più tempo
          });
        }

        // Inizializza calendario
        calendar.render();
        window.calendar = calendar;

        // Aggiungi funzione per forzare il refresh
        window.forceCalendarRefresh = function () {
          eventsCache = [];
          lastFetchTime = 0;
          if (calendar) {
            calendar.refetchEvents();
          }
        };

        // Utilizziamo la funzione di InsegnamentiManager per updateHiddenSelect
        window.updateHiddenSelect = null;
      }
    )
    .catch((error) => {
      console.error("Errore durante l'inizializzazione:", error);
      document.getElementById("calendar").innerHTML =
        "Si è verificato un errore durante il caricamento del calendario.";
    });

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
      closeButton.addEventListener("click", function () {
        popupOverlay.style.display = "none";
      });
    }
  };

  // Inizializza handler
  setupCloseHandlers();
});
