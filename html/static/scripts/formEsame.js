// Script per la gestione del form di inserimento esame
const EsameForm = (function() {
  // Variabili private
  let isLoaded = false;
  let isLoading = false;
  let formContainer = null;
  let popupOverlay = null;
  let currentUsername = null;
  let userPreferences = [];
  let isEditMode = false;
  let usePreferences = true;
  let dateAppelliCounter = 0;
  let selectedDates = [];
  
  // Carica il form HTML dinamicamente
  async function loadForm() {
    if (isLoaded || isLoading) return Promise.resolve(formContainer);
    
    isLoading = true;
    
    try {
      // Usa il form-container dal calendario.html
      formContainer = document.getElementById('form-container');
      if (!formContainer) {
        throw new Error('Elemento form-container non trovato');
      }
      
      // Se il contenuto è già stato caricato, non è necessario ricaricare
      if (formContainer.querySelector('#formEsame')) {
        isLoaded = true;
        isLoading = false;
        return formContainer;
      }
      
      // Ottieni il contenuto del form
      const formContent = document.getElementById('form-esame-content');
      if (!formContent) {
        throw new Error('Elemento form-esame-content non trovato');
      }
      
      // Inserisci il contenuto dal template nel form-container
      formContainer.innerHTML = formContent.innerHTML;
      
      // Aggiungi la classe side-form al form-container
      formContainer.classList.add('side-form');
      formContainer.classList.add('form-content-area');        // Inizializza il listener di chiusura
        const closeBtn = formContainer.querySelector("#closeOverlay");
        if (closeBtn) {
          closeBtn.removeEventListener("click", hideForm);
          closeBtn.addEventListener("click", function(e) {
            e.preventDefault();
            hideForm();
          });
        } else {
          console.warn("Pulsante di chiusura non trovato dopo il caricamento del form");
        }
        
        isLoaded = true;
        isLoading = false;
        
        return formContainer;
    } catch (error) {
      console.error('Errore nel caricamento del form:', error);
      isLoading = false;
      throw error;
    }
  }
  
  // Mostra il form di inserimento esame
  async function showForm(data = {}, isEdit = false) {
    try {
      await loadForm();
      
      if (!formContainer) {
        console.error('Errore: formContainer non disponibile');
        return false;
      }
      
      // Mostra il form container e il calendario
      formContainer.classList.add('active');
      const calendar = document.getElementById('calendar');
      if (calendar) {
        calendar.classList.add('form-visible');
      }
      
      // Reset dello stato e impostazione modalità
      isEditMode = isEdit;
            
      // Componenti principali del form
      const formTitle = formContainer.querySelector(".form-header h2");
      const esameForm = formContainer.querySelector("#formEsame");
      
      if (formTitle) formTitle.textContent = isEdit ? "Modifica Esame" : "Aggiungi Esame";
      
      // Gestione campo ID per modifica
      const idField = formContainer.querySelector("#examIdField");
      if (idField) idField.value = isEdit && data.id ? data.id : "";
      
      // Reset form per partire puliti
      if (esameForm) esameForm.reset();
      
      // Aggiorna pulsante submit
      const submitButton = formContainer.querySelector('#formEsame button[type="submit"]');
      if (submitButton) submitButton.textContent = isEdit ? "Salva Modifiche" : "Crea Esame";
      
      // Gestione pulsante eliminazione
      setupButtons(isEdit, data.id);
      
      // Popolamento form
      const elements = formContainer.querySelectorAll("#formEsame input, #formEsame select");
      
      // Prima imposta i valori di default
      setDefaultValues(elements);
      
      // Inizializza componenti UI PRIMA di compilare il form
      initUI(data);
      initEventListeners();
      
      if (isEdit) {       
        // Compila il form con i dati dell'esame
        fillFormWithExamData(elements, data);
      } else {        
        // Applica dati preselezionati (es. data selezionata)
        if (Object.keys(data).length > 0) {
          fillFormWithPartialData(elements, data);
        }
        
        // Carica preferenze solo in modalità creazione
        if (usePreferences) {
          getUserData()
            .then(data => {
              if (data?.authenticated && data?.user_data) {
                currentUsername = data.user_data.username;
                loadUserPreferences();
              }
            })
            .catch(error => console.error("Errore dati utente:", error));
        }
      }
      
      // Aggiorna campi dinamici
      updateDynamicFields();
      return true;
    } catch (error) {
      console.error('Errore nel mostrare il form:', error);
      window.showMessage("Errore nell'apertura del form", "Errore", "error");
      return false;
    }
  }
  
  // Imposta valori di default sui campi
  function setDefaultValues(elements) {
    const defaults = {
      "tipo_appello": "AP",
      "verbalizzazione": "FSS",
      "tipo_esame": "S",
      "posti": "100"
    };
    
    elements.forEach(element => {
      const name = element.name || element.id;
      if (name && defaults[name]) element.value = defaults[name];
    });
  }
  
  // Compila il form con i dati dell'esame (modalità modifica)
  function fillFormWithExamData(elements, examData) {
    // Prima imposta i campi diretti
    const fieldsToSet = {
      'descrizione': examData.descrizione,
      'dataora': examData.data_appello,
      'inizioIscrizione': examData.data_inizio_iscrizione,
      'fineIscrizione': examData.data_fine_iscrizione,
      'note': examData.note_appello,
      'posti': examData.posti,
      'verbalizzazione': examData.verbalizzazione,
      'tipoEsame': examData.tipo_esame,
    };

    // Imposta i valori dei campi
    Object.entries(fieldsToSet).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && value !== undefined && value !== null) {
        element.value = value;
      }
    });

    // Gestione tipo appello (radio buttons)
    if (examData.tipo_appello === 'PP') {
      document.getElementById('tipoAppelloPP').checked = true;
    } else {
      document.getElementById('tipoAppelloPF').checked = true;
    }
    aggiornaVerbalizzazione(); // Aggiorna le opzioni di verbalizzazione
    
    // Gestione checkbox mostra_nel_calendario
    const mostraInCalendarioCheckbox = document.getElementById('mostra_nel_calendario');
    if (mostraInCalendarioCheckbox) {
      // Impostiamo il checkbox basandoci sul valore dal backend
      mostraInCalendarioCheckbox.checked = examData.mostra_nel_calendario === true || examData.mostra_nel_calendario === 'true';
    }

    // Usa handleSpecialFields per gestire ora e durata
    handleSpecialFields(examData);

    // Gestione insegnamento
    if (window.InsegnamentiManager && examData.insegnamento_codice) {
      window.InsegnamentiManager.clearSelection();
      window.InsegnamentiManager.selectInsegnamento(examData.insegnamento_codice, {
        semestre: examData.semestre || 1,
        anno_corso: examData.anno_corso || 1,
        cds: examData.cds_codice || ""
      });
      
      const multiSelectBox = document.getElementById("insegnamentoBox");
      if (multiSelectBox) {
        const username = document.getElementById("docente")?.value;
        if (username) {
          window.InsegnamentiManager.loadInsegnamenti(
            username, 
            { filter: [examData.insegnamento_codice] }, 
            (data) => window.InsegnamentiManager.syncUI(multiSelectBox, data)
          );
        }
      }
    }
  }
  
  // Gestione campi speciali (es. data, ora) - aggiornato per sezioni modulari
  function handleSpecialFields(data) {
    // Data appello - imposta nella prima sezione disponibile
    if (data.data_appello) {
      const firstDateField = document.querySelector('[id^="dataora_"]');
      if (firstDateField) firstDateField.value = data.data_appello;
    }
    
    // Ora appello - imposta nella prima sezione disponibile
    if (data.ora_appello) {
      const oraParts = data.ora_appello.split(':');
      if (oraParts.length >= 2) {
        const firstOraH = document.querySelector('[id^="ora_h_"]');
        const firstOraM = document.querySelector('[id^="ora_m_"]');
        
        if (firstOraH) firstOraH.value = oraParts[0].padStart(2, '0');
        if (firstOraM) firstOraM.value = oraParts[1].padStart(2, '0');
        
        // Trigger update aule per la prima sezione
        const firstSectionCounter = firstOraH?.id.split('_')[2];
        if (firstSectionCounter) {
          setTimeout(() => updateAuleForSection(firstSectionCounter), 100);
        }
      }
    }
    
    // Aula - imposta nella prima sezione disponibile  
    if (data.aula) {
      setTimeout(() => {
        const firstAulaSelect = document.querySelector('[id^="aula_"]');
        if (firstAulaSelect) {
          // Cerca l'opzione con il valore dell'aula
          const aulaOption = Array.from(firstAulaSelect.options).find(option => option.value === data.aula);
          if (aulaOption) {
            firstAulaSelect.value = data.aula;
          }
        }
      }, 200);
    }
    
    // Durata
    if (data.durata_appello) {
      const durata = parseInt(data.durata_appello);
      if (!isNaN(durata)) {
        const ore = Math.floor(durata / 60);
        const minuti = durata % 60;
        
        const durataH = document.getElementById("durata_h");
        const durataM = document.getElementById("durata_m");
        
        if (durataH) {
          durataH.value = ore.toString();
        }
        
        if (durataM) {
          // Forza sempre il valore dei minuti a "0" quando è un'ora tonda
          durataM.value = minuti.toString().padStart(2, '0');
        }
        
        const durataField = document.getElementById("durata");
        if (durataField) {
          durataField.value = durata.toString();
        }
      }
    }
    
    // Tipo appello (prova parziale)
    if (data.tipo_appello === 'PP') {
      const provaParzialeCheckbox = document.getElementById("provaParziale");
      if (provaParzialeCheckbox) {
        provaParzialeCheckbox.checked = true;
        aggiornaVerbalizzazione();
      }
    }
  }
  
  // Compilazione form con dati parziali (es. data dal calendario)
  function fillFormWithPartialData(elements, partialData) {
    if (partialData.date) {
      const dateField = document.getElementById("dataora");
      if (dateField) dateField.value = partialData.date;
    }
    // Altri dati preselezionati possono essere gestiti qui
  }
  
  // Inizializza gli ascoltatori di eventi
  function initEventListeners() {
    // Gestione opzioni aggiuntive
    const pulsanteAdv = document.getElementById("buttonOpzioniAggiuntive");
    pulsanteAdv?.addEventListener("click", toggleOpzioniAggiuntive);

    // Gestione tipo appello (radio buttons)
    const tipoAppelloRadios = document.querySelectorAll('input[name="tipo_appello_radio"]');
    tipoAppelloRadios.forEach(radio => {
      radio.addEventListener("change", aggiornaVerbalizzazione);
    });

    // Gestione submit del form
    const form = document.getElementById("formEsame");
    form?.addEventListener("submit", handleFormSubmit);
    
    // Gestione del pulsante bypass controlli (solo per admin)
    const bypassChecksBtn = document.getElementById("bypassChecksBtn");
    if (bypassChecksBtn) {
      // Mostra solo agli admin
      isUserAdmin().then(isAdmin => {
        if (isAdmin) {
          bypassChecksBtn.style.display = "block";
          bypassChecksBtn.addEventListener("click", handleBypassChecksSubmit);
        } else {
          bypassChecksBtn.style.display = "none";
        }
      });
    }

    // Gestione chiusura overlay
    const closeOverlay = document.getElementById("closeOverlay");
    if (closeOverlay) {
      // Rimuovi eventuali listener esistenti per evitare duplicazioni
      closeOverlay.removeEventListener("click", hideForm);
      // Aggiungi un nuovo listener
      closeOverlay.addEventListener("click", function(e) {
        e.preventDefault();
        hideForm();
      });
    } else {
      console.warn("Elemento closeOverlay non trovato");
    }

    // Aggiungi event listeners per le preferenze
    document.getElementById("savePreferenceBtn")?.addEventListener("click", toggleSavePreferenceForm);
    document.getElementById("loadPreferenceBtn")?.addEventListener("click", togglePreferencesMenu);
    document.getElementById("confirmSavePreference")?.addEventListener("click", handleSavePreference);
    document.getElementById("cancelSavePreference")?.addEventListener("click", toggleSavePreferenceForm);
    
    // Aggiungi event listener per combinare durata_h e durata_m
    setupTimeCombiningHandlers();
  }
  
  // Inizializza l'interfaccia utente del form
  function initUI(options = {}) {
    // Aspetta un frame per assicurarsi che il DOM sia pronto
    setTimeout(() => {
      // Inizializza le sezioni di date
      initializeDateSections();
      
      // Se c'è una data pre-selezionata, aggiungi la prima sezione con quella data
      if (options.date) {
        addDateSection(options.date);
      } else {
        // Aggiungi almeno una sezione vuota
        addDateSection();
      }
      
      // Continua con il resto dell'inizializzazione
      initUIRest(options);
    }, 10);
  }
  
  // Continua l'inizializzazione UI
  function initUIRest(options = {}) {    
    // Imposta username nel campo docente
    getUserData()
      .then((data) => {
        if (data?.authenticated && data?.user_data) {
          const field = document.getElementById("docente");
          if (field) {
            field.value = data.user_data.username;
            currentUsername = data.user_data.username;
            
            // Inizializza la select multipla tramite InsegnamentiManager
            if (window.InsegnamentiManager) {
              try {
                // Inizializza solo se gli elementi esistono
                const boxElement = document.getElementById("insegnamentoBox");
                const dropdownElement = document.getElementById("insegnamentoDropdown");
                const optionsElement = document.getElementById("insegnamentoOptions");
                
                if (boxElement && dropdownElement && optionsElement) {
                  // Prima pulizia
                  window.InsegnamentiManager.cleanup();
                  
                  // Poi inizializzazione usando la nuova API
                  window.InsegnamentiManager.initUI(
                    "insegnamentoBox", 
                    "insegnamentoDropdown", 
                    "insegnamentoOptions",
                    currentUsername
                  );
                  
                  // Controlla se ci sono insegnamenti preselezionati dall'URL
                  checkPreselectedInsegnamenti();
                } else {
                  console.error("Elementi DOM per multi-select non trovati");
                }
              } catch (error) {
                console.error("Errore nell'inizializzazione multi-select:", error);
              }
            }
          }
        }
      })
      .catch((error) => {
        console.error("Errore nel recupero dei dati utente:", error);
      });
    
    // Personalizza il saluto
    window.updatePageTitle?.();
    
    // Aggiungi listener per aggiornare i tag
    if (window.InsegnamentiManager) {
      window.InsegnamentiManager.onChange(() => {
        const username = document.getElementById("docente")?.value;
        if (!username) return;
        
        const multiSelectBox = document.getElementById("insegnamentoBox");
        if (!multiSelectBox) return;
        
        // Usa la nuova API per sincronizzare l'UI
        window.InsegnamentiManager.syncUI(multiSelectBox);
      });
    }

    // Configura i gestori per combinare ora e durata
    setupTimeCombiningHandlers();
  }

  // Mostra/nasconde le opzioni aggiuntive
  function toggleOpzioniAggiuntive() {
    const opzioni = document.getElementById("opzioniAggiuntive");
    const button = document.getElementById("buttonOpzioniAggiuntive");

    if (!opzioni || !button) return;

    const isVisible = opzioni.style.display === "grid";
    opzioni.style.display = isVisible ? "none" : "grid";
    button.innerHTML = isVisible 
      ? "Opzioni aggiuntive <span class='material-symbols-outlined'>arrow_right</span>" // freccia verso destra
      : "Opzioni aggiuntive <span class='material-symbols-outlined'>arrow_drop_down</span>"; // freccia verso il basso
  }
  
  // Aggiorna le opzioni di verbalizzazione in base al tipo di appello selezionato
  function aggiornaVerbalizzazione() {
    const tipoAppelloPP = document.getElementById("tipoAppelloPP");
    const verbalizzazioneSelect = document.getElementById("verbalizzazione");

    if (!tipoAppelloPP || !verbalizzazioneSelect) return;

    verbalizzazioneSelect.innerHTML = ""; // Svuota le opzioni esistenti

    const options = tipoAppelloPP.checked // Controlla se Prova Parziale è selezionata
      ? [
          { value: "PAR", text: "Prova parziale" },
          { value: "PPP", text: "Prova parziale con pubblicazione" },
        ]
      : [
          { value: "FSS", text: "Firma digitale singola" },
          { value: "FWP", text: "Firma digitale con pubblicazione" },
        ];

    options.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      verbalizzazioneSelect.appendChild(optionElement);
    });

    // Imposta un valore di default
    verbalizzazioneSelect.value = tipoAppelloPP.checked ? "PAR" : "FSS";
  }

  // Controlla e carica insegnamenti preselezionati dall'URL
  function checkPreselectedInsegnamenti() {
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedParam = urlParams.get("insegnamenti");
    
    if (!preselectedParam) return;
    
    const preselectedCodes = preselectedParam.split(",");
    const username = document.getElementById("docente")?.value;
    
    if (!username || !window.InsegnamentiManager) return;
    
    // Usa la nuova API loadInsegnamenti con filtro
    window.InsegnamentiManager.loadInsegnamenti(
      username, 
      { filter: preselectedCodes },
      data => {
        if (data.length > 0) {
          data.forEach(ins => {
            const metadata = {
              semestre: ins.semestre || 1,
              anno_corso: ins.anno_corso || 1,
              cds: ins.cds_codice || ""
            };
            
            window.InsegnamentiManager.selectInsegnamento(ins.codice, metadata);
          });
          
          const multiSelectBox = document.getElementById("insegnamentoBox");
          if (multiSelectBox) {
            // Usa syncUI invece di syncTags
            window.InsegnamentiManager.syncUI(multiSelectBox, data);
          }
        }
      }
    );
  }



  // Valida l'ora dell'appello
  function validaOraAppello(ora) {
    if (!ora) return false;
    const [hours, minutes] = ora.split(":").map(Number);
    return hours >= 8 && hours <= 23;
  }

  // Valida la durata dell'esame
  function validaDurataEsame(durataMinuti) {
    if (!durataMinuti) return false;
    const durata = parseInt(durataMinuti, 10);
    return durata >= 30 && durata <= 480; // min 30 minuti, max 8 ore (480 minuti)
  }

  // Mostra il dialogo di conferma per la validazione degli esami
  function mostraPopupConferma(data) {
    // Crea il contenitore del dialogo
    const dialogContainer = document.createElement("div");
    dialogContainer.id = "exam-confirmation-dialog";
    dialogContainer.className = "specific-confirmation-overlay";
    dialogContainer.style.display = "flex";

    // Crea il contenuto del dialogo
    const dialogContent = document.createElement("div");
    dialogContent.className = "specific-confirmation-panel";
    dialogContent.style.width = "clamp(500px, 50vw, 800px)";

    // Header del dialogo
    const header = document.createElement("div");
    header.className = "specific-confirmation-header";
    header.innerHTML = `
      <h2>Conferma inserimento esami</h2>
      <span id="closeExamConfirmationDialog" class="form-close">&times;</span>
    `;

    // Contenuto del dialogo
    const content = document.createElement("div");
    content.className = "specific-confirmation-body";

    // Costruisci l'HTML per gli esami validi e invalidi
    let htmlContent = "";

    // Se ci sono esami invalidi, mostra un avviso
    if (data.esami_invalidi?.length > 0) {
      htmlContent += `
        <div class="alert alert-warning">
          <p><strong>Attenzione!</strong> Alcuni esami non possono essere inseriti:</p>
          <ul style="margin-left: 20px;">
      `;

      data.esami_invalidi.forEach((esame) => {
        htmlContent += `<li>${esame.titolo || esame.codice}: ${
          esame.errore
        }</li>`;
      });

      htmlContent += `
          </ul>
        </div>
      `;
    }

    // Tabella degli esami validi
    if (data.esami_validi?.length > 0) {
      htmlContent += `
        <p>I seguenti esami possono essere inseriti:</p>
        <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" id="selectAllExams" checked> Seleziona tutti
                </th>
                <th>Insegnamento</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.esami_validi.forEach((esame) => {
        htmlContent += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
              <input type="checkbox" class="esame-checkbox" data-codice="${esame.codice}" 
                     data-inizio="${esame.data_inizio_iscrizione}" data-fine="${esame.data_fine_iscrizione}" checked>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${esame.titolo}</td>
          </tr>
        `;
      });

      htmlContent += `
            </tbody>
          </table>
        </div>
        <div style="text-align: center;">
          <button id="btnConfermaEsami" class="invia" style="margin-right: 10px;">Conferma</button>
          <button id="btnAnnullaEsami" class="invia" style="background-color: #6c757d;">Annulla</button>
        </div>
      `;
    } else {
      htmlContent += `
        <p>Non ci sono esami validi da inserire.</p>
        <div style="text-align: center;">
          <button id="btnAnnullaEsami" class="invia">Chiudi</button>
        </div>
      `;
    }

    content.innerHTML = htmlContent;

    // Assembla il dialogo
    dialogContent.appendChild(header);
    dialogContent.appendChild(content);
    dialogContainer.appendChild(dialogContent);

    // Aggiungi il dialogo al DOM
    document.body.appendChild(dialogContainer);

    // Funzione per rimuovere il dialogo
    const removeDialog = () => document.body.removeChild(dialogContainer);

    // Aggiungi event listeners
    document.getElementById("closeExamConfirmationDialog")?.addEventListener("click", removeDialog);
    document.getElementById("btnAnnullaEsami")?.addEventListener("click", removeDialog);

    // Event listener per "Seleziona tutti"
    const selectAllCheckbox = document.getElementById("selectAllExams");
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener("change", () => {
        const checkboxes = document.querySelectorAll(".esame-checkbox");
        checkboxes.forEach((checkbox) => {
          checkbox.checked = selectAllCheckbox.checked;
        });
      });
    }

    // Event listener per il pulsante di conferma
    const btnConferma = document.getElementById("btnConfermaEsami");
    if (btnConferma) {
      btnConferma.addEventListener("click", () => {
        // Raccogli gli esami selezionati
        const checkboxes = document.querySelectorAll(".esame-checkbox:checked");

        const esamiSelezionati = Array.from(checkboxes).map((checkbox) => ({
          codice: checkbox.dataset.codice,
          data_inizio_iscrizione: checkbox.dataset.inizio,
          data_fine_iscrizione: checkbox.dataset.fine,
        }));

        // Se non ci sono esami selezionati, mostra un messaggio e non fare nulla
        if (esamiSelezionati.length === 0) {
          window.showMessage(
            "Seleziona almeno un esame da inserire",
            "Attenzione",
            "warning"
          );
          return;
        }

        // Invia la richiesta al server per inserire gli esami selezionati
        fetch("/api/confermaEsami", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dati_comuni: data.dati_comuni,
            esami_da_inserire: esamiSelezionati,
          }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Errore HTTP: ${response.status}`);
            }
            return response.json();
          })
          .then((response) => {
            // Rimuovi il dialogo
            removeDialog();

            if (
              response.status === "success" ||
              response.status === "partial"
            ) {
              window.preselectedInsegnamenti = [];
              window.InsegnamentiManager?.clearSelection();
              window.forceCalendarRefresh?.();

              const messageType = response.status === "success" ? "notification" : "warning";
              const messageTitle = response.status === "success" ? "Operazione completata" : "Inserimento parziale";

              window.showMessage(response.message, messageTitle, messageType);

              // Aggiorna calendario
              if (window.calendar) {
                window.calendar.refetchEvents();
                hideForm();
              }

              // Se ci sono errori specifici in caso di inserimento parziale
              if (response.status === "partial" && response.errors) {
                response.errors.forEach((error) => {
                  window.showMessage(
                    `Errore per ${error.codice}: ${error.errore}`,
                    "Dettagli errore",
                    "warning"
                  );
                });
              }
            } else {
              window.showMessage(
                "Errore: " + response.message,
                "Errore",
                "error"
              );
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            window.showMessage(
              "Si è verificato un errore durante l'inserimento degli esami",
              "Errore",
              "error"
            );
          });
      });
    }
  }

  // Funzioni per la gestione delle preferenze
  
  // Carica le preferenze dell'utente
  function loadUserPreferences() {
    if (!currentUsername) {
      // Ottieni l'username dal campo nascosto
      currentUsername = document.getElementById("docente")?.value;
      if (!currentUsername) {
        console.error("Username non trovato, impossibile caricare le preferenze");
        return;
      }
    }
        
    fetch(`/api/getPreferenzeForm?username=${encodeURIComponent(currentUsername)}&form_type=esame`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Errore nella risposta del server: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.status === 'success' && data.preferences) {
          userPreferences = data.preferences;
          
          // Aggiorna il menu delle preferenze
          updatePreferencesMenu();
          
          // Se ci sono preferenze, carica l'ultima come predefinita
          if (userPreferences.length > 0 && !document.getElementById("preferenceAlreadyLoaded")) {
            applyPreference(userPreferences[0].preferences);
            
            // Aggiungi un marker nascosto per evitare caricamenti multipli
            const marker = document.createElement('input');
            marker.type = 'hidden';
            marker.id = 'preferenceAlreadyLoaded';
            document.getElementById('formEsame')?.appendChild(marker);
          } else {
            console.log("Nessuna preferenza trovata o già caricata");
          }
        } else {
          console.error("Errore nel caricamento delle preferenze:", data.message);
        }
      })
      .catch(error => {
        console.error('Errore nel caricamento delle preferenze:', error);
      });
  }
  
  // Salva le preferenze correnti
  function saveCurrentPreference(preferenceName) {
    if (!currentUsername) {
      currentUsername = document.getElementById("docente")?.value;
      if (!currentUsername) {
        window.showMessage("Errore: nessun utente identificato", "Errore", "error");
        return;
      }
    }
    
    // Ottieni gli insegnamenti selezionati direttamente dall'elemento select nascosto
    let selectedInsegnamenti = [];
    try {
      const insegnamentoSelect = document.getElementById("insegnamento");
      if (insegnamentoSelect && insegnamentoSelect.options) {
        for (let i = 0; i < insegnamentoSelect.options.length; i++) {
          if (insegnamentoSelect.options[i].selected) {
            selectedInsegnamenti.push({
              codice: insegnamentoSelect.options[i].value,
              titolo: insegnamentoSelect.options[i].textContent
            });
          }
        }
      }
      
      // Alternativa - recupera i tag dal box se il select è vuoto
      if (selectedInsegnamenti.length === 0) {
        const tags = document.querySelectorAll('#insegnamentoBox .multi-select-tag');
        tags.forEach(tag => {
          const codiceMatch = tag.textContent.match(/\(([A-Z0-9]+)\)/);
          if (codiceMatch && codiceMatch[1]) {
            const codice = codiceMatch[1];
            const titolo = tag.textContent.replace(/\s*\([A-Z0-9]+\)$/, '').trim();
            selectedInsegnamenti.push({ codice, titolo });
          }
        });
      }
    } catch (error) {
      console.error("Errore nel recupero degli insegnamenti selezionati:", error);
    }
        
    // Raccogli i valori comuni del form escludendo i campi specifici dell'esame
    const preferences = {
      descrizione: document.getElementById("descrizione")?.value,
      insegnamenti: selectedInsegnamenti,
      tipoEsame: document.getElementById("tipoEsame")?.value,
      verbalizzazione: document.getElementById("verbalizzazione")?.value,
      oraAppello: document.getElementById("ora")?.value,
      durata: document.getElementById("durata")?.value,
      posti: document.getElementById("posti")?.value,
      tipo_appello: document.querySelector('input[name="tipo_appello_radio"]:checked')?.value,
      note: document.getElementById("note")?.value
    };
    
    // Invia i dati al server
    fetch('/api/salvaPreferienzaForm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: currentUsername,
        form_type: 'esame',
        name: preferenceName,
        preferences: preferences
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        window.showMessage(data.message, "Preferenze salvate", "notification");
        
        // Ricarica le preferenze
        loadUserPreferences();
      } else {
        window.showMessage(data.message, "Errore", "error");
      }
    })
    .catch(error => {
      console.error('Errore nel salvataggio delle preferenze:', error);
      window.showMessage("Errore nel salvataggio delle preferenze", "Errore", "error");
    });
  }
  
  // Applica una preferenza
  function applyPreference(preference) {
    // Imposta descrizione
    if (preference.descrizione) {
      const descrizione = document.getElementById("descrizione");
      if (descrizione) descrizione.value = preference.descrizione;
    }
    
    // Imposta insegnamenti
    if (preference.insegnamenti && preference.insegnamenti.length > 0 && window.InsegnamentiManager) {
      // Pulisci selezioni precedenti
      window.InsegnamentiManager.clearSelection();
      
      // Carica gli insegnamenti selezionati
      const username = document.getElementById("docente")?.value;
      if (username) {
        const insegnamentoCodes = preference.insegnamenti.map(ins => ins.codice);
        
        // Ora usiamo solo il filtro per selezionare gli insegnamenti dalla lista completa
        window.InsegnamentiManager.loadInsegnamenti(
          username, 
          { 
            filter: insegnamentoCodes
          },
          data => {
            if (data.length > 0) {
              data.forEach(ins => {
                window.InsegnamentiManager.selectInsegnamento(ins.codice, {
                  semestre: ins.semestre || 1,
                  anno_corso: ins.anno_corso || 1,
                  cds: ins.cds_codice || ""
                });
              });
              
              const multiSelectBox = document.getElementById("insegnamentoBox");
              if (multiSelectBox) {
                window.InsegnamentiManager.syncUI(multiSelectBox, data);
              }
            }
          }
        );
      }
    }
    
    // Imposta tipo esame
    if (preference.tipoEsame) {
      const tipoEsame = document.getElementById("tipoEsame");
      if (tipoEsame) tipoEsame.value = preference.tipoEsame;
    }
    
    // Imposta verbalizzazione
    if (preference.verbalizzazione) {
      const verbalizzazione = document.getElementById("verbalizzazione");
      if (verbalizzazione) verbalizzazione.value = preference.verbalizzazione;
    }
    
    let oraImpostata = false;
    // Imposta ora appello
    if (preference.oraAppello) {
      const ora_h = document.getElementById("ora_h");
      const ora_m = document.getElementById("ora_m");
      
      if (ora_h && ora_m && preference.oraAppello) {
        // Dividi l'ora in ore e minuti e assicurati che ci siano entrambi
        const [hours, minutes] = preference.oraAppello.split(":").map(val => val.padStart(2, '0'));
        if (hours) {
          ora_h.value = hours;
        }
        if (minutes) {
          ora_m.value = minutes;
        }
        
        // Combina i valori per aggiornare il campo nascosto
        combineTimeValues();
        oraImpostata = true;
      }
    }
    
    // Imposta durata
    if (preference.durata) {
      impostaDurataFromMinuti(preference.durata);
    }
    
    // Imposta posti
    if (preference.posti) {
      const posti = document.getElementById("posti");
      if (posti) posti.value = preference.posti;
    }
    
    // Gestione tipo appello (radio button)
    if (preference.hasOwnProperty('tipo_appello')) {
      if (preference.tipo_appello === 'PP') {
        document.getElementById('tipoAppelloPP').checked = true;
      } else {
        document.getElementById('tipoAppelloPF').checked = true;
      }
      aggiornaVerbalizzazione();
    }
    
    // Imposta note
    if (preference.note) {
      const note = document.getElementById("note");
      if (note) note.value = preference.note;
    }
    
    // Se è stata impostata l'ora, aggiorna le aule disponibili per la prima sezione
    if (oraImpostata) {
      // Attendiamo un piccolo delay per essere sicuri che tutti i valori siano stati aggiornati
      setTimeout(() => {
        // Trova la prima sezione disponibile e aggiorna le aule
        const firstOraH = document.querySelector('[id^="ora_h_"]');
        if (firstOraH) {
          const sectionCounter = firstOraH.id.split('_')[2];
          updateAuleForSection(sectionCounter);
        }
      }, 50);
    }
  }

  // Funzione per impostare la durata negli elementi di interfaccia a partire dai minuti
  function impostaDurataFromMinuti(durataMinuti) {
    const durata = parseInt(durataMinuti, 10);
    if (!isNaN(durata)) {
      const ore = Math.floor(durata / 60);
      const minuti = durata % 60;
      
      const durata_h = document.getElementById("durata_h");
      const durata_m = document.getElementById("durata_m");
      
      if (durata_h) {
        durata_h.value = ore.toString();
      }
      
      if (durata_m) {
        // Usa sempre "0" come valore quando i minuti sono 0
        durata_m.value = "0";
        
        // Se ci sono minuti diversi da zero, usa il valore corretto
        if (minuti > 0) {
          durata_m.value = minuti.toString();
        }
      }
      
      // Aggiorniamo anche il campo nascosto
      const durataHidden = document.getElementById("durata");
      if (durataHidden) {
        durataHidden.value = durata.toString();
      }
    }
  }

  // Aggiorna il menu delle preferenze
  function updatePreferencesMenu() {
    const preferencesMenu = document.getElementById("preferencesMenu");
    if (!preferencesMenu) return;
    
    // Svuota il menu
    preferencesMenu.innerHTML = "";
    
    if (userPreferences.length === 0) {
      preferencesMenu.innerHTML = "<div class='preference-item'>Nessuna preferenza salvata</div>";
      return;
    }
    
    // Crea un elemento per ogni preferenza
    userPreferences.forEach(pref => {
      const item = document.createElement("div");
      item.className = "preference-item";
      item.innerHTML = `
        <span>${pref.name}</span>
        <span class="delete-btn" data-id="${pref.id}" title="Elimina"><span class="material-symbols-outlined">delete</span></span>
      `;
      
      // Event listener per caricare la preferenza
      item.addEventListener("click", (e) => {
        // Se il click è sulla X, non caricare la preferenza
        if (e.target.classList.contains("delete-btn")) return;
        
        applyPreference(pref.preferences);
        togglePreferencesMenu();
      });
      
      preferencesMenu.appendChild(item);
    });
    
    // Event listener per eliminare le preferenze
    preferencesMenu.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deletePreference(btn.dataset.id);
      });
    });
  }
  
  // Elimina una preferenza
  function deletePreference(id) {
    if (!confirm("Sei sicuro di voler eliminare questa preferenza?")) return;
    
    fetch('/api/eliminaPreferenzaForm', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: currentUsername,
        id: id
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        window.showMessage(data.message, "Preferenze", "notification");
        
        // Ricarica le preferenze
        loadUserPreferences();
      } else {
        window.showMessage(data.message, "Errore", "error");
      }
    })
    .catch(error => {
      console.error('Errore nell\'eliminazione della preferenza:', error);
      window.showMessage("Errore nell'eliminazione della preferenza", "Errore", "error");
    });
  }
  
  // Mostra/nasconde il form per salvare le preferenze
  function toggleSavePreferenceForm() {
    const saveForm = document.getElementById("savePreferenceForm");
    const menu = document.getElementById("preferencesMenu");
    
    if (!saveForm) return;
     
    const isVisible = saveForm.style.display === "flex";
    saveForm.style.display = isVisible ? "none" : "flex";
    
    // Nascondi il menu se è visibile
    if (menu && menu.style.display === "block") {
      menu.style.display = "none";
    }
    
    // Imposta il focus sul campo di input
    if (!isVisible) {
      document.getElementById("preferenceNameInput")?.focus();
    }
  }
  
  // Mostra/nasconde il menu delle preferenze
  function togglePreferencesMenu() {
    const menu = document.getElementById("preferencesMenu");
    const saveForm = document.getElementById("savePreferenceForm");
    
    if (!menu) return;
    
    const isVisible = menu.style.display === "block";
    menu.style.display = isVisible ? "none" : "block";
    
    // Nascondi il form di salvataggio se è visibile
    if (saveForm && saveForm.style.display === "flex") {
      saveForm.style.display = "none";
    }
  }
  
  // Gestisce il salvataggio di una preferenza
  function handleSavePreference() {
    const preferenceNameInput = document.getElementById("preferenceNameInput");
    if (!preferenceNameInput) return;
    
    const preferenceName = preferenceNameInput.value.trim();
    if (!preferenceName) {
      window.showMessage("Inserisci un nome per la preferenza", "Attenzione", "warning");
      return;
    }
    
    // Verifica se esiste già una preferenza con questo nome
    const exists = userPreferences.some(p => p.name === preferenceName);
    if (exists) {
      if (!confirm(`Esiste già una preferenza chiamata "${preferenceName}". Vuoi sovrascriverla?`)) {
        return;
      }
    }
    
    saveCurrentPreference(preferenceName);
    toggleSavePreferenceForm();
  }

  // Configura i gestori per combinare i valori di ora e durata
  function setupTimeCombiningHandlers() {
    const form = document.getElementById("formEsame");
    if (!form) return;
    
    // Combina l'ora al submit del form
    form.addEventListener("submit", combineTimeValues);
    
    // Aggiungi anche al pulsante di bypass
    const bypassBtn = document.getElementById("bypassChecksBtn");
    if (bypassBtn) {
      bypassBtn.addEventListener("click", combineTimeValues);
    }
    
    // Aggiungi gestori per aggiornare i campi quando i valori cambiano
    const ora_h = document.getElementById("ora_h");
    const ora_m = document.getElementById("ora_m");
    const durata_h = document.getElementById("durata_h");
    const durata_m = document.getElementById("durata_m");
    
    if (ora_h && ora_m) {
      ora_h.addEventListener("change", combineTimeValues);
      ora_m.addEventListener("change", combineTimeValues);
    }
    
    if (durata_h && durata_m) {
      durata_h.addEventListener("change", combineDurataValues);
      durata_m.addEventListener("change", combineDurataValues);
    }
  }
  
  // Combina i valori di ora e durata
  function combineTimeValues() {
    // Combina ora_h e ora_m in ora (formato HH:MM)
    const ora_h = document.getElementById('ora_h')?.value;
    const ora_m = document.getElementById('ora_m')?.value;
    if (ora_h && ora_m) {
      const oraField = document.getElementById('ora');
      if (oraField) oraField.value = `${ora_h}:${ora_m}`;
    }
    
    // Converte durata_h e durata_m in durata totale in minuti
    const durata_h = parseInt(document.getElementById('durata_h')?.value) || 0;
    const durata_m = parseInt(document.getElementById('durata_m')?.value) || 0;
    const durata_totale = (durata_h * 60) + durata_m;
    
    const durataField = document.getElementById('durata');
    if (durataField) durataField.value = durata_totale.toString();
  }
  
  // Controlla se l'utente è un amministratore
  async function isUserAdmin() {
    try {
      const data = await getUserData();
      return data.authenticated && data.user_data && data.user_data.permessi_admin;
    } catch (error) {
      console.error("Errore nel controllo dei permessi admin:", error);
      return false;
    }
  }

  // Configura i pulsanti del form
  async function setupButtons(isEdit, examId) {
    const formActions = document.querySelector('.form-actions');
    if (!formActions) return;

    // Pulisci i pulsanti esistenti
    formActions.innerHTML = '';

    // Verifica se l'utente è admin
    const isAdmin = await isUserAdmin();

    if (isEdit) {
      // Edit mode buttons
      const modifyBtn = document.createElement("button");
      modifyBtn.type = "submit";
      modifyBtn.className = "invia";
      modifyBtn.textContent = "Modifica";
      formActions.appendChild(modifyBtn);

      if (isAdmin) {
        // Admin bypass button in edit mode
        const bypassBtn = document.createElement("button");
        bypassBtn.type = "button";
        bypassBtn.id = "bypassChecksBtn";
        bypassBtn.className = "invia bypass";
        bypassBtn.textContent = "Modifica senza controlli";
        bypassBtn.addEventListener("click", handleBypassChecksSubmit);
        formActions.appendChild(bypassBtn);
      }

      // Delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.id = "deleteExamBtn";
      deleteBtn.type = "button";
      deleteBtn.className = "invia danger";
      deleteBtn.textContent = "Elimina Esame";
      deleteBtn.onclick = () => {
        if (confirm("Sei sicuro di voler eliminare questo esame?")) {
          if (typeof window.deleteEsame === 'function') {
            window.deleteEsame(examId);
          }
        }
      };
      formActions.appendChild(deleteBtn);
    } else {
      // Create mode buttons
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.className = "form-button";
      submitBtn.textContent = "Inserisci";
      formActions.appendChild(submitBtn);

      if (isAdmin) {
        // Admin bypass button in create mode
        const bypassBtn = document.createElement("button");
        bypassBtn.type = "button";
        bypassBtn.id = "bypassChecksBtn";
        bypassBtn.className = "invia bypass";
        bypassBtn.textContent = "Inserisci senza controlli";
        bypassBtn.addEventListener("click", handleBypassChecksSubmit);
        formActions.appendChild(bypassBtn);
      }
    }

    // Aggiungi pulsante per eliminare evento provvisorio se applicabile
    setupProvisionalDeleteButton();
  }

  // Setup del pulsante per eliminare eventi provvisori
  function setupProvisionalDeleteButton() {
    const formActions = document.querySelector('.form-actions');
    if (!formActions) return;

    // Rimuovi pulsante esistente se presente
    const existingBtn = document.getElementById('deleteProvisionalBtn');
    if (existingBtn) existingBtn.remove();

    // Verifica se ci sono sezioni di date con eventi provvisori
    const dateSections = document.querySelectorAll('.date-appello-section');
    let hasProvisionalEvents = false;
    
    dateSections.forEach(section => {
      const dateInput = section.querySelector('input[name^="data_appello_"]');
      if (dateInput && dateInput.value && window.provisionalEvents) {
        const matchingEvent = window.provisionalEvents.find(event => 
          event.extendedProps.formSectionDate === dateInput.value
        );
        if (matchingEvent) {
          hasProvisionalEvents = true;
        }
      }
    });

    if (hasProvisionalEvents) {
      const deleteBtn = document.createElement('button');
      deleteBtn.id = 'deleteProvisionalBtn';
      deleteBtn.type = 'button';
      deleteBtn.className = 'form-button danger';
      deleteBtn.textContent = 'Elimina Evento Provvisorio';
      deleteBtn.style.marginLeft = '10px';
      
      deleteBtn.addEventListener('click', handleDeleteProvisional);
      formActions.appendChild(deleteBtn);
    }
  }

  // Gestisce l'eliminazione di eventi provvisori
  function handleDeleteProvisional() {
    if (!confirm('Sei sicuro di voler eliminare questo evento provvisorio?')) {
      return;
    }

    const dateSections = document.querySelectorAll('.date-appello-section');
    const provisionalEventIds = [];

    // Raccoglie tutti gli ID degli eventi provvisori da eliminare
    dateSections.forEach(section => {
      const dateInput = section.querySelector('input[name^="data_appello_"]');
      if (dateInput && dateInput.value && window.provisionalEvents) {
        const matchingEvent = window.provisionalEvents.find(event => 
          event.extendedProps.formSectionDate === dateInput.value
        );
        if (matchingEvent) {
          provisionalEventIds.push(matchingEvent.id);
        }
      }
    });

    // Rimuove gli eventi dal calendario
    if (window.removeProvisionalEvents) {
      provisionalEventIds.forEach(eventId => {
        window.removeProvisionalEvents(eventId);
      });
    }

    // Chiudi il form
    hideForm();
    
    // Mostra messaggio di conferma
    if (window.showMessage) {
      window.showMessage('Eventi provvisori eliminati con successo.', 'Eliminazione completata', 'success');
    }
  }

  // Funzione specifica per combinare solo i valori della durata
  function combineDurataValues() {
    const durata_h = parseInt(document.getElementById('durata_h')?.value) || 0;
    const durata_m = parseInt(document.getElementById('durata_m')?.value) || 0;
    const durata_totale = (durata_h * 60) + durata_m;
    
    const durataField = document.getElementById('durata');
    if (durataField) durataField.value = durata_totale.toString();
  }
  
  // Funzione unificata per inviare i dati del form
  function submitFormData(options = {}) {
    const form = document.getElementById("formEsame");
    if (!form) return;

    // Se siamo in modalità modifica, inviamo JSON
    if (isEditMode) {
      const formData = new FormData(form);
      
      // Recupera i tag degli insegnamenti selezionati dal box
      const selectedTags = document.querySelectorAll('#insegnamentoBox .multi-select-tag');
      const selectedCodes = Array.from(selectedTags).map(tag => {
        const codiceMatch = tag.textContent.match(/\(([A-Z0-9]+)\)/);
        return codiceMatch ? codiceMatch[1] : null;
      }).filter(code => code);

      // Uso il primo insegnamento per la modifica (modalità edit supporta solo un insegnamento)
      const insegnamento = selectedCodes[0] || formData.get('insegnamento');

      // Recupera i dati dalla prima sezione per la modifica (edit mode supporta solo una sezione)
      const firstDateInput = document.querySelector('[id^="dataora_"]');
      const firstOraH = document.querySelector('[id^="ora_h_"]');
      const firstOraM = document.querySelector('[id^="ora_m_"]');
      const firstAula = document.querySelector('[id^="aula_"]');
      
      const oraAppello = firstOraH && firstOraM ? `${firstOraH.value}:${firstOraM.value}` : '';
      
      const examData = {
        id: formData.get('examIdField'),
        insegnamento: insegnamento,
        descrizione: formData.get('descrizione'),
        tipo_appello: document.querySelector('input[name="tipo_appello_radio"]:checked')?.value,
        aula: firstAula ? firstAula.value : '',
        data_appello: firstDateInput ? firstDateInput.value : '',
        data_inizio_iscrizione: formData.get('inizioIscrizione'),
        data_fine_iscrizione: formData.get('fineIscrizione'),
        ora_appello: oraAppello,
        durata_appello: formData.get('durata'),
        periodo: oraAppello ? (parseInt(oraAppello.split(':')[0]) >= 14 ? 1 : 0) : 0,
        verbalizzazione: formData.get('verbalizzazione'),
        definizione_appello: 'STD',
        gestione_prenotazione: 'STD',
        riservato: false,
        tipo_iscrizione: formData.get('tipoEsame'),
        tipo_esame: formData.get('tipoEsame'),
        note_appello: formData.get('note'),
        posti: formData.get('posti') ? parseInt(formData.get('posti')) : 200,
        mostra_nel_calendario: formData.get('mostra_nel_calendario') === 'on'
      };

      // Per la modifica inviamo JSON
      fetch("/api/updateEsame", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(examData)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.showMessage("Esame modificato con successo", "Operazione completata", "notification");
          window.forceCalendarRefresh?.();
          hideForm();
        } else {
          window.showMessage(data.message || "Errore durante la modifica", "Errore", "error");
        }
      })
      .catch(error => {
        console.error("Error:", error);
        window.showMessage("Si è verificato un errore durante la modifica dell'esame", "Errore", "error");
      });
      return;
    }

    // Per l'inserimento, prepara il FormData con gli insegnamenti
    const formData = new FormData(form);

    if (!isEditMode) {
      // Rimuovi eventuali vecchi valori di insegnamento
      formData.delete('insegnamento');

      // Recupera i codici degli insegnamenti direttamente da InsegnamentiManager
      const selectedCodes = window.InsegnamentiManager?.getSelectedCodes() || [];

      // Aggiungi ogni codice insegnamento al FormData
      selectedCodes.forEach(code => {
        formData.append('insegnamento', code);
      });

      if (selectedCodes.length === 0) {
        window.showMessage("Seleziona almeno un insegnamento", "Errore", "error");
        return;
      }

      // Continua con l'invio dei dati
      fetch("/api/inserisciEsame", {
        method: "POST",
        body: formData,
      })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "error") {
          window.showMessage(data.message, "Errore", "error");
        } else if (data.status === "validation") {
          mostraPopupConferma(data);
        } else {
          // Pulizia dopo l'inserimento riuscito
          window.InsegnamentiManager?.clearSelection();
          window.forceCalendarRefresh?.();

          const successMessage = options.bypassChecks 
            ? "Esame inserito con successo (controlli bypassati)"
            : data.message || "Esami inseriti con successo";
            
          window.showMessage(successMessage, "Operazione completata", "notification");
          hideForm(); // Assicurati che questa funzione sia definita e accessibile
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        window.showMessage(
          "Si è verificato un errore durante l'inserimento dell'esame",
          "Errore",
          "error"
        );
      });
    }
  }

  // Gestisce l'invio del form con bypass dei controlli
  function handleBypassChecksSubmit() {
    isUserAdmin().then(isAdmin => {
      if (!isAdmin) {
        window.showMessage(
          "Solo gli amministratori possono utilizzare questa funzione",
          "Accesso negato",
          "error"
        );
        return;
      }
      
      // Combina i valori di ora e durata prima dell'invio
      combineTimeValues();
      
      submitFormData({ bypassChecks: true });
    });
  }

  // Valida il giorno della settimana
  function validaGiornoSettimana(data) {
    const giorno = new Date(data).getDay();
    return giorno !== 0 && giorno !== 6; // 0 = domenica, 6 = sabato
  }

  // Gestisce l'invio standard del form
  function handleFormSubmit(e) {
    e.preventDefault();

    // Combina ora e durata
    combineTimeValues();

    // Validazione per la prima sezione di date
    const firstDateInput = document.querySelector('[id^="dataora_"]');
    if (firstDateInput) {
      const dataAppello = firstDateInput.value;
      if (!validaGiornoSettimana(dataAppello)) {
        window.showMessage(
          "Non è possibile inserire esami di sabato o domenica",
          "Errore di validazione",
          "error"
        );
        return;
      }
    }

    const firstOraH = document.querySelector('[id^="ora_h_"]');
    const firstOraM = document.querySelector('[id^="ora_m_"]');
    if (firstOraH && firstOraM) {
      const oraAppello = `${firstOraH.value}:${firstOraM.value}`;
      if (!validaOraAppello(oraAppello)) {
        window.showMessage(
          "L'ora dell'appello deve essere compresa tra le 08:00 e le 23:00",
          "Errore di validazione",
          "error"
        );
        return;
      }
    }

    const firstAulaSelect = document.querySelector('[id^="aula_"]');
    if (firstAulaSelect && !firstAulaSelect.value) {
      window.showMessage(
        "Seleziona un'aula disponibile",
        "Errore di validazione",
        "error"
      );
      return;
    }

    const durataEsame = document.getElementById("durata")?.value;
    if (!validaDurataEsame(durataEsame)) {
      window.showMessage(
        "La durata dell'esame deve essere di almeno 30 minuti e non superiore a 480 minuti (8 ore)",
        "Errore di validazione",
        "error"
      );
      return;
    }

    submitFormData();
  }

  // Aggiorna i campi dinamici del form
  function updateDynamicFields() {
    aggiornaVerbalizzazione();
    // Aggiorna l'aula per gli eventi provvisori nel calendario, se presenti
    const dateSections = document.querySelectorAll('.date-appello-section');
    dateSections.forEach(section => {
      const dateInput = section.querySelector('input[name^="data_appello_"]');
      const aulaSelect = section.querySelector('select[name^="aula_"]');
      if (dateInput && dateInput.value && aulaSelect && window.calendar && window.provisionalEvents) {
        const selectedDate = dateInput.value;
        const selectedAula = aulaSelect.options[aulaSelect.selectedIndex]?.text || '';
        // Trova l'evento provvisorio corrispondente e aggiorna la sua proprietà aula
        const provisionalEvent = window.provisionalEvents.find(event => event.extendedProps.formSectionDate === selectedDate);
        if (provisionalEvent) {
          const calendarEvent = window.calendar.getEventById(provisionalEvent.id);
          if (calendarEvent) {
            calendarEvent.setExtendedProp('aula', selectedAula);
          }
        }
      }
    });

    // Aggiorna il pulsante per eventi provvisori
    setupProvisionalDeleteButton();
  }

  // Nasconde il form e pulisce gli handler degli eventi
  function hideForm() {
    if (formContainer) {
      // Rimuovi la classe active per animare la chiusura
      formContainer.classList.remove('active');
      formContainer.classList.remove('form-content-area'); // Rimuovi la classe specifica del form
      
      // Ripristina il calendario a larghezza piena
      const calendarEl = document.getElementById('calendar'); // Rinominato per evitare conflitto
      if (calendarEl) {
        calendarEl.classList.remove('form-visible');
      }
      
      try {
        // Resetta il dropdown
        const dropdown = document.getElementById('insegnamentoDropdown');
        if (dropdown) {
          dropdown.style.display = 'none';
        }
        
        // Pulisci gli event listener per evitare duplicazioni
        if (window.InsegnamentiManager && window.InsegnamentiManager.cleanup) {
          window.InsegnamentiManager.cleanup();
        }

        // Pulisci gli eventi provvisori dal calendario quando il form viene chiuso
        if (window.clearCalendarProvisionalEvents) {
          window.clearCalendarProvisionalEvents();
        }
                
        // Se esiste una funzione di callback nel calendario, richiamiamo il refresh
        if (window.forceCalendarRefresh) {
          window.forceCalendarRefresh();
        }
      } catch (error) {
        console.error('Errore durante la chiusura del form:', error);
      }
    } else {
      console.warn('formContainer non trovato durante la chiusura del form');
    }
  }

  // Gestione sezioni modulari per date e appelli
  
  function addDateSection(date = '') {
    const container = document.getElementById('dateAppelliContainer');
    if (!container) {
      console.error("Container dateAppelliContainer non trovato");
      return;
    }
    
    dateAppelliCounter++;
    const sectionId = `dateSection_${dateAppelliCounter}`;
        
    const section = document.createElement('div');
    section.className = 'date-appello-section';
    section.id = sectionId;
    section.dataset.date = date;
        
    section.innerHTML = `
      <div class="date-appello-header">
        <h4 class="date-appello-title">Appello ${dateAppelliCounter}</h4>
        <button type="button" class="remove-date-btn" onclick="removeDateSection('${sectionId}')">
          <span class="material-symbols-outlined">delete</span>
          Rimuovi
        </button>
      </div>
      <div class="date-appello-fields">
        <div>
          <label for="dataora_${dateAppelliCounter}">Data Appello*</label>
          <input type="date" id="dataora_${dateAppelliCounter}" name="dataora[]" class="form-input" value="${date}" required>
        </div>
        <div>
          <label for="ora_${dateAppelliCounter}">Ora Appello*</label>
          <div class="time-select-container">
            <select id="ora_h_${dateAppelliCounter}" name="ora_h[]" class="form-input" required>
              <option value="" disabled selected hidden>Ora</option>
              <option value="08">08</option>
              <option value="09">09</option>
              <option value="10">10</option>
              <option value="11">11</option>
              <option value="12">12</option>
              <option value="13">13</option>
              <option value="14">14</option>
              <option value="15">15</option>
              <option value="16">16</option>
              <option value="17">17</option>
              <option value="18">18</option>
            </select>
            <span class="time-separator">:</span>
            <select id="ora_m_${dateAppelliCounter}" name="ora_m[]" class="form-input" required>
              <option value="" disabled selected hidden>Min</option>
              <option value="00">00</option>
              <option value="15">15</option>
              <option value="30">30</option>
              <option value="45">45</option>
            </select>
          </div>
        </div>
        <div>
          <label for="aula_${dateAppelliCounter}">Aula*</label>
          <select id="aula_${dateAppelliCounter}" name="aula[]" class="form-input" required>
            <option value="" disabled selected hidden>Seleziona prima data e ora</option>
          </select>
        </div>
      </div>
    `;
    
    // Inserisci la sezione prima del pulsante "Aggiungi data"
    const addButton = container.querySelector('.add-date-btn');
    if (addButton) {
      container.insertBefore(section, addButton);
    } else {
      container.appendChild(section);
    }
    
    // Aggiungi event listeners per questa sezione
    setupDateSectionListeners(sectionId, dateAppelliCounter);
    
    // Se è stata fornita una data, crea subito l'evento provvisorio
    if (date) {
      createProvisionalEventForDate(date);
    }
    
    // Aggiungi la data al tracking se non è vuota
    if (date) {
      selectedDates.push(date);
    }
    
    return sectionId;
  }
  
  function removeDateSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const date = section.dataset.date;
    
    // Rimuovi l'evento provvisorio associato dal calendario se esiste
    if (date && window.provisionalEvents && window.removeProvisionalEvents) {
      const matchingEvent = window.provisionalEvents.find(event => 
        event.extendedProps.formSectionDate === date
      );
      if (matchingEvent) {
        window.removeProvisionalEvents(matchingEvent.id);
      }
    }
    
    // Rimuovi dal tracking delle date
    if (date) {
      const index = selectedDates.indexOf(date);
      if (index > -1) {
        selectedDates.splice(index, 1);
      }
    }
    
    section.remove();
    
    // Rinumera le sezioni rimanenti
    renumberDateSections();
  }
  
  function renumberDateSections() {
    const sections = document.querySelectorAll('.date-appello-section');
    sections.forEach((section, index) => {
      const newNumber = index + 1;
      const title = section.querySelector('.date-appello-title');
      if (title) {
        title.textContent = `Appello ${newNumber}`;
      }
    });
  }
  
  function setupDateSectionListeners(sectionId, counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const oraH = document.getElementById(`ora_h_${counter}`);
    const oraM = document.getElementById(`ora_m_${counter}`);
    
    if (dateInput) {
      dateInput.addEventListener('change', () => {
        updateAuleForSection(counter);
        handleDateInputChange(sectionId, counter);
      });
    }
    if (oraH) {
      oraH.addEventListener('change', () => updateAuleForSection(counter));
    }
    if (oraM) {
      oraM.addEventListener('change', () => updateAuleForSection(counter));
    }
  }

  function handleDateInputChange(sectionId, counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const section = document.getElementById(sectionId);
    
    if (!dateInput || !section) return;
    
    const newDate = dateInput.value;
    const oldDate = section.dataset.date;
    
    // Se la data è cambiata
    if (newDate !== oldDate) {
      // Rimuovi l'evento provvisorio precedente se esisteva
      if (oldDate && window.provisionalEvents && window.removeProvisionalEvents) {
        const oldEvent = window.provisionalEvents.find(event => 
          event.extendedProps.formSectionDate === oldDate
        );
        if (oldEvent) {
          window.removeProvisionalEvents(oldEvent.id);
        }
      }
      
      // Aggiorna il dataset della sezione
      section.dataset.date = newDate;
      
      // Crea nuovo evento provvisorio se la data è valida
      if (newDate && window.calendar) {
        createProvisionalEventForDate(newDate);
      }
    }
  }

  // Funzione per verificare se esiste già un evento provvisorio per una data specifica
  function isProvisionalEventExistsForDate(date) {
    if (window.provisionalEvents) {
      return window.provisionalEvents.some(event => event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date));
    }
    return false;
  }
  
  // Modificata per prevenire la creazione di eventi duplicati usando la funzione unificata
  function createProvisionalEventForDate(date) {
    if (!window.calendar || !date) {
      return;
    }

    // Usa la funzione unificata importata da calendarUtils
    const provisionalEvent = window.creaEventoProvvisorio(date, window.calendar, window.provisionalEvents || []);
    
    if (provisionalEvent && window.updateDateValideWithExclusions) {
      window.updateDateValideWithExclusions();
    }
  }
  
  function updateAuleForSection(counter) {
    const dateInput = document.getElementById(`dataora_${counter}`);
    const oraH = document.getElementById(`ora_h_${counter}`);
    const oraM = document.getElementById(`ora_m_${counter}`);
    const aulaSelect = document.getElementById(`aula_${counter}`);
    
    if (!dateInput || !oraH || !oraM || !aulaSelect) return;
    
    const data = dateInput.value;
    const ora_hValue = oraH.value;
    const ora_mValue = oraM.value;
    
    if (!data) {
      aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima una data</option>';
      return;
    }
    
    if (!ora_hValue || !ora_mValue) {
      aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima un\'ora</option>';
      return;
    }
    
    aulaSelect.innerHTML = '<option value="" disabled selected hidden>Caricamento aule in corso...</option>';
    
    const ora = `${ora_hValue}:${ora_mValue}`;
    const periodo = parseInt(ora_hValue) >= 14 ? 1 : 0;
    
    fetch(`/api/getAule?data=${data}&periodo=${periodo}`)
      .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
      .then(aule => {
        aulaSelect.innerHTML = '<option value="" disabled selected hidden>Scegli l\'aula</option>';
        
        const studioDocenteNome = "Studio docente DMI";
        let studioDocentePresente = aule.some(aula => aula.nome === studioDocenteNome);
        
        if (!studioDocentePresente) {
          aule.push({ nome: studioDocenteNome });
          aule.sort((a, b) => a.nome.localeCompare(b.nome));
        }
        
        aule.forEach(aula => {
          const option = document.createElement("option");
          option.value = aula.nome;
          option.textContent = aula.nome === studioDocenteNome 
            ? aula.nome 
            : `${aula.nome} (${aula.posti} posti)`;
          
          if (aula.nome === studioDocenteNome && aule.length === 1) {
            option.selected = true;
          }
          
          aulaSelect.appendChild(option);
        });
        
        // Aggiungi listener per aggiornare l'evento provvisorio quando cambia l'aula
        aulaSelect.addEventListener('change', function() {
          if (window.aggiornaAulaEventoProvvisorio && window.calendar && window.provisionalEvents) {
            window.aggiornaAulaEventoProvvisorio(data, this.value, window.calendar, window.provisionalEvents);
          }
        });
      })
      .catch(error => {
        console.error("Errore nel recupero delle aule:", error);
        aulaSelect.innerHTML = '<option value="" disabled selected>Errore nel caricamento delle aule</option>';
        
        const option = document.createElement("option");
        option.value = "Studio docente DMI";
        option.textContent = "Studio docente DMI";
        aulaSelect.appendChild(option);
      });
  }
  
  function initializeDateSections() {
    const container = document.getElementById('dateAppelliContainer');
    if (!container) {
      console.error("Container dateAppelliContainer non trovato durante l'inizializzazione");
      return;
    }
        
    // Rimuovi il pulsante se già esiste
    const existingButton = container.querySelector('.add-date-btn');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Aggiungi il pulsante per aggiungere nuove date
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'add-date-btn';
    addButton.innerHTML = '<span class="material-symbols-outlined">add</span> Aggiungi data appello';
    addButton.addEventListener('click', () => addDateSection());
    
    container.appendChild(addButton);
  }

  // Interfaccia pubblica
  return {
    loadForm,
    showForm,
    hideForm,
    isFormLoaded: () => isLoaded,
    loadPreferences: loadUserPreferences,
    applyPreference,
    combineTimeValues,
    combineDurataValues,
    setupTimeCombiningHandlers,
    usePreferences: true,
    removeDateSection,
    addDateSection,
    initializeDateSections,
    setupProvisionalDeleteButton,
    handleDeleteProvisional,
    createProvisionalEventForDate,
    isProvisionalEventExistsForDate
  };
}());

// Esportazione globale
window.EsameForm = EsameForm;

// Rendi disponibili le funzioni per la gestione delle sezioni date
window.removeDateSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) {
    return;
  }
  
  const date = section.dataset.date;
  
  // Rimuovi l'evento provvisorio associato dal calendario se esiste
  if (date && window.provisionalEvents && window.removeProvisionalEvents) {
    const matchingEvent = window.provisionalEvents.find(event => 
      event.extendedProps.formSectionDate === date
    );
    if (matchingEvent) {
      window.removeProvisionalEvents(matchingEvent.id);
    } else {
      console.warn("Nessun evento provvisorio trovato per la data:", date);
    }
  } else {
    console.warn("Nessun evento provvisorio o funzione di rimozione trovata per la data:", date);
  }
  
  // Rimuovi dal tracking delle date se la variabile esiste
  if (window.selectedDates && date) {
    const index = window.selectedDates.indexOf(date);
    if (index > -1) {
      window.selectedDates.splice(index, 1);
    }
  }
  
  section.remove();
  
  // Rinumera le sezioni rimanenti
  const sections = document.querySelectorAll('.date-appello-section');
  sections.forEach((section, index) => {
    const newNumber = index + 1;
    const title = section.querySelector('.date-appello-title');
    if (title) {
      title.textContent = `Appello ${newNumber}`;
    }
  });
};

// Aggiungi un listener per l'evento DOMContentLoaded per assicurarti che 
// gli elementi del form siano pronti quando vengono caricati dinamicamente
document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('formEsame');
  // Se il form è stato già caricato nella pagina, configura i gestori
  if (form) {
    EsameForm.setupTimeCombiningHandlers();
  }
});