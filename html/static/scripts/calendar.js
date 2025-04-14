import {
  getValidDateRange,
  getPlanningYear,
  createDropdown,
  populateInsegnamentiDropdown,
  fetchCalendarEvents,
  loadDateValide,
  getInitialDate
} from "./calendarUtils.js";

function createAnnoDropdown() {
  const dropdown = document.createElement("div");
  dropdown.className = "calendar-dropdown"; // Usa la stessa classe degli altri dropdown
  dropdown.id = "annoDropdown";
  document.body.appendChild(dropdown);
  return dropdown;
}

document.addEventListener("DOMContentLoaded", function () {
  // Assicuriamoci che i dati utente siano precaricati
  window.preloadUserData();
  
  // Inizializzazione
  const planningYear = getPlanningYear();
  const dateRange = getValidDateRange();
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
    sessioni: null,
  };

  // Ottieni i dati dell'utente una sola volta all'inizio
  getUserData().then(data => {
    userData = data;
    currentUsername = data?.user_data?.username;
    isAdmin = data?.authenticated && data?.user_data?.permessi_admin;

    // Carica le date valide e precarica gli insegnamenti usando InsegnamentiManager
    Promise.all([
      loadDateValide(currentUsername),
      window.InsegnamentiManager ? 
        window.InsegnamentiManager.loadInsegnamenti(currentUsername) : 
        Promise.resolve([])
    ])
      .then(
        ([dateValideResponse, insegnamentiCachedResult]) => {
          // Salva le date valide
          dateValide = dateValideResponse;

          // Crea dropdown una sola volta
          dropdowns.sessioni = createDropdown("sessioni");
          dropdowns.insegnamenti = createDropdown("insegnamenti");

          // Popola dropdown sessioni
          updateSessioniDropdown(dropdowns.sessioni, dateValide);

          // Determina quali pulsanti mostrare in base ai permessi
          const rightButtons = isAdmin
            ? "pulsanteAnno pulsanteInsegnamenti pulsanteSessioni pulsanteDebug prev,next today"
            : "pulsanteAnno pulsanteInsegnamenti pulsanteSessioni prev,next today";

          // Configurazione calendario
          var calendar = new FullCalendar.Calendar(calendarEl, {
            contentHeight: "60dvh",
            locale: "it",
            initialDate: getInitialDate(dateValide),
            validRange: getValidDateRange(),
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
              params.append("docente", currentUsername);

              // Gestisci i parametri in base agli insegnamenti selezionati
              if (window.InsegnamentiManager) {
                const selected = window.InsegnamentiManager.getSelectedCodes();
                
                if (selected.length > 0) {
                  // Se ci sono insegnamenti selezionati, passa i loro codici
                  // Il backend si occuperà di includere anche gli esami di insegnamenti con stesso anno e semestre
                  params.append("insegnamenti", selected.join(","));
                }
                // Se non ci sono insegnamenti selezionati, verranno mostrati solo gli esami del docente
              }

              // Carica gli eventi
              fetch(`/api/getEsami?${params.toString()}`)
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

            headerToolbar: {
              left: "title",
              center: "",
              right: rightButtons + " aggiungiEsame", // Aggiornata la toolbar senza pulsanteCds
            },

            // Pulsanti personalizzati
            customButtons: {
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
                    // Verifica se InsegnamentiManager ha una cache valida
                    if (window.InsegnamentiManager && window.InsegnamentiManager.isCacheValid()) {
                      // Usa la cache esistente per popolare il dropdown
                      window.InsegnamentiManager.loadInsegnamenti(currentUsername, (insegnamenti) => {
                        // Organizza i dati nel formato aspettato da populateInsegnamentiDropdown
                        if (insegnamenti.length > 0) {
                          // Raccogli i CdS unici
                          const cdsCodes = [...new Set(insegnamenti.map(ins => ins.cds_codice))];
                          
                          // Costruisci la struttura dati
                          const dataToPass = {
                            cds: cdsCodes.map(cdsCode => {
                              const cdsInsegnamenti = insegnamenti.filter(ins => ins.cds_codice === cdsCode);
                              const cdsNome = cdsInsegnamenti.length > 0 ? 
                                  cdsInsegnamenti[0].cds_nome || "Sconosciuto" : "Sconosciuto";
                              
                              return {
                                codice: cdsCode,
                                nome: cdsNome,
                                insegnamenti: cdsInsegnamenti.map(ins => ({
                                  codice: ins.codice,
                                  titolo: ins.titolo,
                                  semestre: ins.semestre,
                                  anno_corso: ins.anno_corso
                                }))
                              };
                            }).filter(cds => cds.insegnamenti.length > 0)
                          };
                          
                          // Popola il dropdown con i dati dalla cache
                          populateInsegnamentiDropdown(
                            dropdowns.insegnamenti,
                            currentUsername,
                            planningYear,
                            null,
                            dataToPass
                          );
                        } else {
                          // Se la cache è vuota ma valida, mostra un messaggio
                          dropdowns.insegnamenti.innerHTML = 
                            "<div class='dropdown-error'>Nessun insegnamento disponibile</div>";
                        }
                      });
                    } else {
                      // Se la cache non è valida, carica i dati freschi
                      // Questo farà una sola richiesta API e memorizzerà i dati in cache
                      window.InsegnamentiManager.loadInsegnamenti(currentUsername, (insegnamenti) => {
                        // Usa la stessa logica di sopra per preparare i dati
                        if (insegnamenti.length > 0) {
                          const cdsCodes = [...new Set(insegnamenti.map(ins => ins.cds_codice))];
                          const dataToPass = {
                            cds: cdsCodes.map(cdsCode => {
                              const cdsInsegnamenti = insegnamenti.filter(ins => ins.cds_codice === cdsCode);
                              const cdsNome = cdsInsegnamenti.length > 0 ? 
                                  cdsInsegnamenti[0].cds_nome || "Sconosciuto" : "Sconosciuto";
                              
                              return {
                                codice: cdsCode,
                                nome: cdsNome,
                                insegnamenti: cdsInsegnamenti.map(ins => ({
                                  codice: ins.codice,
                                  titolo: ins.titolo,
                                  semestre: ins.semestre,
                                  anno_corso: ins.anno_corso
                                }))
                              };
                            }).filter(cds => cds.insegnamenti.length > 0)
                          };
                          
                          populateInsegnamentiDropdown(
                            dropdowns.insegnamenti,
                            currentUsername,
                            planningYear,
                            null,
                            dataToPass
                          );
                        } else {
                          dropdowns.insegnamenti.innerHTML = 
                            "<div class='dropdown-error'>Nessun insegnamento disponibile</div>";
                        }
                      });
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

                  // Ottieni tutti gli esami usando docente=admin
                  fetch("/api/getEsami?docente=admin")
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
                  if (userData?.authenticated) {
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
                },
              },
              // Aggiungi il pulsante Anno Accademico
              pulsanteAnno: {
                text: 'Anno Accademico',
                click: function(e) {
                  const button = e.currentTarget;
                  const dropdown = document.getElementById('annoDropdown') || createAnnoDropdown();
                  
                  // Posiziona il dropdown
                  const rect = button.getBoundingClientRect();
                  dropdown.style.top = `${rect.bottom}px`;
                  dropdown.style.left = `${rect.left}px`;
                  
                  // Popola il dropdown usando le classi esistenti
                  dropdown.innerHTML = `
                    <div class="dropdown-item">2024/2025</div>
                  `;
                  
                  // Il resto del codice rimane uguale
                  dropdown.querySelector('.dropdown-item').addEventListener('click', function() {
                    /*calendar.setOption('validRange', getValidDateRange(2024));
                    calendar.refetchEvents();*/
                    dropdown.classList.remove('show');
                  });
                  
                  // Toggle della visibilità
                  dropdown.classList.toggle('show');
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
                }
              } else {
                showMessage(
                  "Effettua il login per inserire un esame",
                  "Informazione",
                  "notification"
                );
              }
            },

            // Dettagli evento al click
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
                  .then(response => response.json())
                  .then(data => {
                    if (data.success) {
                      try {
                        window.EsameForm.showForm(data.esame, true);
                      } catch (err) {
                        console.error("Errore nella compilazione del form:", err);
                        showMessage("Errore nella compilazione del form: " + err.message, "Errore", "error");
                      }
                    } else {
                      console.error("Errore nella risposta API:", data.message);
                      showMessage(data.message, "Errore", "error");
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

            // Stile eventi
            eventDidMount: function (info) {
              const loggedDocente = currentUsername;
              
              // Tooltip
              info.el.title = info.event.extendedProps.description;

              // Colori differenziati
              const eventColor =
                info.event.extendedProps.docente === loggedDocente ||
                info.event.extendedProps.insegnamentoDocente
                  ? "var(--color-light-blue)" // blu: propri esami o esami di propri insegnamenti
                  : "#FFD700"; // giallo: altri esami

              const textColor =
                info.event.extendedProps.docente === loggedDocente ||
                info.event.extendedProps.insegnamentoDocente
                  ? "var(--color-bg)"
                  : "#000";

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
              
              // Verifica se è una prova parziale
              const tipoAppello = event.extendedProps.tipo_appello;
              const isProvaParziale = tipoAppello === 'PP';
              
              // Aggiungi "(Prova Parziale)" se necessario
              const titolo = isProvaParziale 
                ? `${event.title} (Parziale)` 
                : event.title;

              return {
                html: `
                <div class="fc-event-main-frame">
                  <div class="fc-event-time">${arg.timeText}</div>
                  <div class="fc-event-title">${titolo}</div>
                  <div class="fc-event-description">${docenteNome}</div>
                  </div>
                </div>
              `,
              };
            },

            // Disabilita date fuori sessione solo per utenti non admin
            dayCellClassNames: function (arg) {
              const dataCorrente = arg.date;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              dataCorrente.setHours(0, 0, 0, 0);

              // Disabilita sempre le date passate
              if (dataCorrente < today) {
                return ['fc-disabled-day'];
              }

              // Per le date future, verifica se sono in sessione (solo per non-admin)
              if (!isAdmin) {
                const dataValida = dateValide.some(([start, end]) => {
                  const startDate = new Date(start);
                  startDate.setHours(0, 0, 0, 0);
                  const endDate = new Date(end);
                  endDate.setHours(23, 59, 59, 999);
                  return dataCorrente >= startDate && dataCorrente <= endDate;
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

          // Funzione helper per precaricare gli insegnamenti selezionati nel form
          function preloadSelectedInsegnamenti() {
            if (
              window.InsegnamentiManager &&
              window.InsegnamentiManager.getSelectedCodes().length > 0
            ) {
              // Prepara contenitore
              const multiSelectBox = document.getElementById("insegnamentoBox");
              if (multiSelectBox) {
                // Usa la cache di InsegnamentiManager
                window.InsegnamentiManager.loadInsegnamenti(
                  currentUsername, 
                  { filter: window.InsegnamentiManager.getSelectedCodes() }, 
                  data => {
                    // Utilizza syncUI per aggiornare l'interfaccia
                    window.InsegnamentiManager.syncUI(multiSelectBox, data);
                  }
                );
              }
            }
          }

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

              // Aggiorna direttamente l'InsegnamentiManager in base allo stato del checkbox
              if (checkbox.checked) {
                window.InsegnamentiManager.selectInsegnamento(codice, {
                  semestre: semestre,
                  anno_corso: annoCorso,
                  cds: cds,
                });
              } else {
                window.InsegnamentiManager.deselectInsegnamento(codice);
              }

              // Invalida la cache eventi ma non ricaricare subito
              eventsCache = [];
              lastFetchTime = 0;
              
              // Ottieni gli insegnamenti selezionati
              const selectedInsegnamenti = window.InsegnamentiManager.getSelectedCodes();
              
              // Carica solo se ci sono insegnamenti selezionati (evita chiamate inutili)
              if (selectedInsegnamenti.length > 0) {
                loadDateValide(currentUsername, selectedInsegnamenti)
                  .then((newDates) => {
                    // Aggiorna le date valide solo se sono cambiate
                    if (JSON.stringify(dateValide) !== JSON.stringify(newDates)) {
                      dateValide = newDates;
                      
                      // Aggiorna il calendario
                      updateCalendarWithDates(calendar, dateValide);
                      
                      // Aggiorna il dropdown delle sessioni
                      updateSessioniDropdown(dropdowns.sessioni, dateValide);
                    }
                  })
                  .catch((error) => {
                    console.error("Errore nel caricamento delle date valide:", error);
                  });
              } else {
                // Se non ci sono insegnamenti selezionati, usa solo il docente
                loadDateValide(currentUsername)
                  .then((newDates) => {
                    if (JSON.stringify(dateValide) !== JSON.stringify(newDates)) {
                      dateValide = newDates;
                      updateCalendarWithDates(calendar, dateValide);
                      updateSessioniDropdown(dropdowns.sessioni, dateValide);
                    }
                  })
                  .catch((error) => {
                    console.error("Errore nel caricamento delle date valide:", error);
                  });
              }
            }
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

// Funzione per aggiornare il calendario con le nuove date
function updateCalendarWithDates(calendar, dates) {
  // Aggiorna il rendering per riflettere le nuove date valide
  calendar.render();
  
  // Aggiorna il titolo del mese corrente con la sessione attiva
  const currentDate = calendar.getDate();
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  // Trova la sessione corrente
  let sessioneCorrente = "";
  for (let [start, end, nome] of dates) {
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
  const titleElement = document.querySelector(".fc-toolbar-title");
  if (titleElement) {
    titleElement.textContent = title;
  }
}

// Funzione per eliminare un esame
function deleteEsame(examId) {
  fetch('/api/deleteEsame', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: examId }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage("Esame eliminato con successo", "Successo", "success");
        
        // Chiudi il form
        const popupOverlay = document.getElementById("popupOverlay");
        if (popupOverlay) {
          popupOverlay.style.display = "none";
        }
        
        // Aggiorna il calendario
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

// Esponi funzione deleteEsame globalmente
window.deleteEsame = deleteEsame;

document.addEventListener('click', (e) => {
  if (!e.target.closest('.fc-pulsanteAnno-button') && !e.target.closest('#annoDropdown')) {
    const dropdown = document.getElementById('annoDropdown');
    if (dropdown) {
      dropdown.classList.remove('show');
    }
  }
});
