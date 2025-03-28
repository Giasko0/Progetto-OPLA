import {
  getValidDateRange,
  getPlanningYear,
  createDropdown,
  populateInsegnamentiDropdown,
  fetchCalendarEvents,
  loadDateValide,
} from "./calendarUtils.js";

document.addEventListener("DOMContentLoaded", function () {
  // Assicuriamoci che i dati utente siano precaricati
  window.preloadUserData();
  
  // Inizializzazione
  const planningYear = getPlanningYear();
  const dateRange = getValidDateRange();
  var calendarEl = document.getElementById("calendar");

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
      `/api/getInsegnamentiDocente?docente=${loggedDocente}&anno=${planningYear}`
    ).then((r) => r.json()),
  ])
    .then(
      ([dateValideResponse, adminPermissions, insegnamentiData]) => {
        // Salva le date valide
        dateValide = dateValideResponse;

        // Memorizza nelle cache i risultati delle chiamate API
        // Se i dati sono nel nuovo formato gerarchico, usa la funzione di utilità
        if (insegnamentiData.cds) {
          cachedCds = insegnamentiData.cds.map(cds => ({
            codice: cds.codice,
            nome_corso: cds.nome
          }));
          
          // Usa la funzione di utilità se disponibile
          cachedInsegnamenti = window.InsegnamentiManager && window.InsegnamentiManager.flattenInsegnamenti
            ? window.InsegnamentiManager.flattenInsegnamenti(insegnamentiData.cds)
            : []; // altrimenti inizializza vuoto
        } else {
          // Formato di dati precedente
          cachedInsegnamenti = insegnamentiData;
        }

        // Crea dropdown una sola volta
        dropdowns.sessioni = createDropdown("sessioni");
        dropdowns.insegnamenti = createDropdown("insegnamenti");

        // Popola dropdown sessioni
        updateSessioniDropdown(dropdowns.sessioni, dateValide);

        // Determina quali pulsanti mostrare in base ai permessi
        const rightButtons = isAdmin
          ? "pulsanteInsegnamenti pulsanteSessioni pulsanteDebug prev,next today"
          : "pulsanteInsegnamenti pulsanteSessioni prev,next today";

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

          validRange: getValidDateRange,

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
                  // Verifica se abbiamo dati validi in cache
                  if (cachedCds && cachedCds.length > 0 && cachedInsegnamenti && cachedInsegnamenti.length > 0) {
                    // Crea un oggetto con la struttura attesa dalla funzione populateInsegnamentiDropdown
                    const dataToPass = {
                      cds: cachedCds.map(cds => {
                        return {
                          codice: cds.codice,
                          nome: cds.nome_corso || cds.nome,
                          insegnamenti: cachedInsegnamenti
                            .filter(ins => ins.cds_codice === cds.codice)
                            .map(ins => ({
                              codice: ins.codice,
                              titolo: ins.titolo,
                              semestre: ins.semestre,
                              anno_corso: ins.anno_corso
                            }))
                        };
                      }).filter(cds => cds.insegnamenti.length > 0) // Rimuovi i CdS senza insegnamenti
                    };
                    
                    // Usa i dati precaricati per popolare il dropdown
                    populateInsegnamentiDropdown(
                      dropdowns.insegnamenti,
                      loggedDocente,
                      planningYear,
                      null,
                      dataToPass
                    );
                  } else {
                    // Se non ci sono dati in cache o sono incompleti, effettua una nuova chiamata API
                    fetch(`/api/getInsegnamentiDocente?docente=${loggedDocente}&anno=${planningYear}`)
                      .then(response => {
                        if (!response.ok) {
                          throw new Error(`Errore HTTP: ${response.status}`);
                        }
                        return response.json();
                      })
                      .then(data => {
                        // Aggiorna la cache con i nuovi dati
                        if (data.cds && Array.isArray(data.cds)) {
                          cachedCds = data.cds.map(cds => ({
                            codice: cds.codice,
                            nome_corso: cds.nome
                          }));
                          
                          // Cache insegnamenti piatti per altre funzionalità
                          if (window.InsegnamentiManager && window.InsegnamentiManager.flattenInsegnamenti) {
                            cachedInsegnamenti = window.InsegnamentiManager.flattenInsegnamenti(data.cds);
                          } else {
                            // Implementazione fallback se flattenInsegnamenti non è disponibile
                            cachedInsegnamenti = [];
                            data.cds.forEach(cds => {
                              if (cds.insegnamenti && Array.isArray(cds.insegnamenti)) {
                                cds.insegnamenti.forEach(ins => {
                                  cachedInsegnamenti.push({
                                    codice: ins.codice,
                                    titolo: ins.titolo,
                                    semestre: ins.semestre || 1,
                                    anno_corso: ins.anno_corso || 1,
                                    cds_codice: cds.codice,
                                    cds_nome: cds.nome
                                  });
                                });
                              }
                            });
                          }
                          
                          // Passa i dati originali
                          populateInsegnamentiDropdown(
                            dropdowns.insegnamenti,
                            loggedDocente,
                            planningYear,
                            null,
                            data
                          );
                        } else {
                          dropdowns.insegnamenti.innerHTML = 
                            "<div class='dropdown-error'>Formato dati non valido</div>";
                        }
                      })
                      .catch(error => {
                        console.error("Errore nel caricamento degli insegnamenti:", error);
                        dropdowns.insegnamenti.innerHTML = 
                          "<div class='dropdown-error'>Errore nel caricamento degli insegnamenti</div>";
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

                // Carica tutti gli esami
                fetch("/api/getEsami?docente=*")
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

            // Verifica data in sessione valida (solo per non-admin)
            const dataValida = isAdmin || dateValide.some(([start, end]) => {
              const startDate = new Date(start);
              // Reset delle ore per la data di inizio per un confronto corretto
              startDate.setHours(0, 0, 0, 0);

              const endDate = new Date(end);
              endDate.setHours(23, 59, 59, 999);

              return dataClick >= startDate && dataClick <= endDate;
            });

            // Blocca date fuori sessione (solo per non-admin)
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
            // Controlla se questo è un esame del docente corrente
            const eventDocente = info.event.extendedProps.docente;
            const loggedDocente = document.cookie
              .split("; ")
              .find((row) => row.startsWith("username="))
              ?.split("=")[1];
            
            // Ottieni l'ID dell'esame
            const examId = info.event.id;
            
            console.log("Click su evento del calendario:");
            console.log("ID esame:", examId);
            console.log("Docente esame:", eventDocente);
            console.log("Docente loggato:", loggedDocente);
            
            // Se l'esame è del docente corrente, apri il form per la modifica
            if (eventDocente === loggedDocente) {
              // Verifica che EsameForm esista
              if (window.EsameForm) {
                // Carica i dettagli dell'esame e mostra il form
                fetch(`/api/getEsameById?id=${examId}`)
                  .then(response => {
                    console.log("Risposta API getEsameById status:", response.status);
                    return response.json();
                  })
                  .then(data => {
                    console.log("Dati ricevuti da getEsameById:", data);
                    if (data.success) {
                      try {
                        // Passa i dettagli dell'esame al form con flag editMode true
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
            } else {
              // Se l'esame non è del docente corrente, mostra solo i dettagli
              const title = info.event.title;
              const description = info.event.extendedProps.description || "Nessuna descrizione disponibile";
              const docenteNome = info.event.extendedProps.docenteNome || eventDocente || "Docente non specificato";
              
              showMessage(
                `<strong>${title}</strong><br>
                Docente: ${docenteNome}<br>
                ${description}`,
                "Dettagli esame",
                "info"
              );
            }
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
              // Carica insegnamenti selezionati usando la nuova API
              const username = loggedDocente;
              if (!username) return;
              
              window.InsegnamentiManager.loadInsegnamenti(
                username, 
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
              loadDateValide(loggedDocente, selectedInsegnamenti)
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
              loadDateValide(loggedDocente)
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
