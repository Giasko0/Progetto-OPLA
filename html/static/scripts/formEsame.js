// Script per la gestione del form di inserimento esame
const EsameForm = (function() {
  // Verifica che FormUtils e FormEsameAppelli siano caricati
  if (!window.FormUtils) {
    throw new Error('FormUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsame.js');
  }
  if (!window.FormEsameAppelli) {
    throw new Error('FormEsameAppelli non è caricato. Assicurati che formEsameAppelli.js sia incluso prima di formEsame.js');
  }

  // Importa tutte le utilità da FormUtils
  const {
    setElementValue,
    setRadioValue,
    setCheckboxValue,
    showValidationError,
    showOperationMessage,
    validateFormField,
    validators,
    getCommonValidationRules,
    setupEventListeners: setupCommonEventListeners,
    setDurationFromMinutes,
    combineTimeValues: combineTimeValuesUtil,
    saveFormPreference,
    loadFormPreferences,
    deleteFormPreference,
    resetForm,
    parseTimeString,
    formatTimeFromHourMinute,
    isValidDate,
    isWeekday,
    loadAuleForDateTime,
    populateAulaSelect,
    checkUserPermissions,
    createConfirmationDialog,
    formatDateForInput,
    getUserData,
    loadHTMLTemplate,
    createProvisionalEvent,
    removeProvisionalEvent,
    clearAllProvisionalEvents,
    processHTMLTemplate,
    validateExamDate,
    validateExamTime,
    isValidDateFormat,
    aggiornaVerbalizzazione,
    getFirstDateValue,
    getFirstTimeValue,
    getDurationValue,
    handleInsegnamentoSelection,
    checkPreselectedInsegnamenti
  } = window.FormUtils;

  // Importa le utilità per la gestione delle sezioni appelli
  const {
    initializeDateSections,
    addDateSection,
    removeDateSection,
    collectSectionsData,
    populateSectionsWithData,
    reset: resetAppelliSections
  } = window.FormEsameAppelli;

  // Configurazione validatori e regole
  const validaOraAppello = validators.oraAppello;
  const validaDurataEsame = validators.durataEsame;
  const validaGiornoSettimana = validators.giornoSettimana;
  const formValidationRules = getCommonValidationRules();

  let formContainer = null;
  let currentUsername = null;
  let userPreferences = [];
  let isEditMode = false;
  let usePreferences = true;

  // Riusa dateValide dal context globale del calendario
  const getDateValide = () => window.dateValide || [];

  // Carica il form HTML dinamicamente
  async function loadForm() {
    try {
      // Usa il form-container dal calendario.html
      formContainer = document.getElementById('form-container');
      if (!formContainer) {
        throw new Error('Elemento form-container non trovato');
      }
      
      // Se il contenuto è già stato caricato, non è necessario ricaricare
      if (formContainer.querySelector('#formEsame')) {
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
      formContainer.classList.add('form-content-area');
      
      // Inizializza il listener di chiusura
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
      
      return formContainer;
    } catch (error) {
      console.error('Errore nel caricamento del form:', error);
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
      formContainer.style.display = 'block';
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
      
      // Inizializza componenti UI PRIMA di compilare il form
      initUI(data);
      setupEventListeners();
      
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
                if (window.EsamePreferenze) {
                  window.EsamePreferenze.setCurrentUsername(currentUsername);
                  window.EsamePreferenze.loadUserPreferences();
                }
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
  
  // Compila il form con i dati dell'esame (modalità modifica)
  function fillFormWithExamData(elements, examData) {
    // Imposta i campi diretti usando la funzione helper
    setFormFields(examData);

    // Gestione tipo appello (radio buttons)
    setRadioValue('tipo_appello_radio', examData.tipo_appello === 'PP' ? 'PP' : 'PF');
    aggiornaVerbalizzazione(); // Aggiorna le opzioni di verbalizzazione
    
    // Gestione checkbox mostra_nel_calendario
    setCheckboxValue('mostra_nel_calendario', examData.mostra_nel_calendario);

    // Usa handleSpecialFields per gestire ora e durata
    handleSpecialFields(examData);

    // Gestione insegnamento
    handleInsegnamentoSelection(examData);
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
      const oraParts = parseTimeString(data.ora_appello);
      if (oraParts && oraParts.hours) {
        const firstOraH = document.querySelector('[id^="ora_h_"]');
        const firstOraM = document.querySelector('[id^="ora_m_"]');
        
        if (firstOraH) firstOraH.value = oraParts.hours.padStart(2, '0');
        if (firstOraM) firstOraM.value = oraParts.minutes.padStart(2, '0');
        
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
          const aulaOption = Array.from(firstAulaSelect.options).find(option => option.value === data.aula);
          if (aulaOption) {
            firstAulaSelect.value = data.aula;
          }
        }
      }, 200);
    }
    
    // Durata
    if (data.durata_appello) {
      setDurationFromMinutes(data.durata_appello);
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
  
  // Funzione unificata per la gestione degli event listener
  function setupEventListeners() {
    const eventListeners = [
      { id: "formEsame", event: "submit", handler: handleFormSubmit },
      { id: "savePreferenceBtn", event: "click", handler: window.EsamePreferenze?.toggleSavePreferenceForm },
      { id: "loadPreferenceBtn", event: "click", handler: window.EsamePreferenze?.togglePreferencesMenu },
      { id: "confirmSavePreference", event: "click", handler: window.EsamePreferenze?.handleSavePreference },
      { id: "cancelSavePreference", event: "click", handler: window.EsamePreferenze?.toggleSavePreferenceForm },
      { id: "closeOverlay", event: "click", handler: hideForm }
    ];

    eventListeners.forEach(({ id, event, handler }) => {
      const element = document.getElementById(id);
      if (element && handler) {
        element.removeEventListener(event, handler); // Rimuovi listener esistenti
        element.addEventListener(event, handler);
      }
    });

    // Gestione tipo appello (radio buttons)
    const tipoAppelloRadios = document.querySelectorAll('input[name="tipo_appello_radio"]');
    tipoAppelloRadios.forEach(radio => {
      radio.removeEventListener("change", aggiornaVerbalizzazione);
      radio.addEventListener("change", aggiornaVerbalizzazione);
    });

    // Gestione del pulsante bypass controlli (solo per admin)
    isUserAdmin().then(isAdmin => {
      const bypassChecksBtn = document.getElementById("bypassChecksBtn");
      if (bypassChecksBtn && isAdmin) {
        bypassChecksBtn.style.display = "block";
        bypassChecksBtn.removeEventListener("click", handleBypassChecksSubmit);
        bypassChecksBtn.addEventListener("click", handleBypassChecksSubmit);
      }
    });

    // Configura i gestori per combinare durata_h e durata_m
    setupTimeCombiningHandlers();
  }
  
  // Inizializza l'interfaccia utente del form
  function initUI(options = {}) {
    // Aspetta un frame per assicurarsi che il DOM sia pronto
    setTimeout(() => {
      // Inizializza le sezioni di date usando il nuovo modulo
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

    // Configura gli event listeners
    setupEventListeners();

    // Configura i gestori per combinare ora e durata
    setupTimeCombiningHandlers();
  }


  // Funzione unificata per impostare i valori dei campi del form
  function setFormFields(data) {
    const fieldMappings = {
      // Campi di testo semplici
      'descrizione': data.descrizione,
      'dataora': data.data_appello,
      'inizioIscrizione': data.data_inizio_iscrizione,
      'fineIscrizione': data.data_fine_iscrizione,
      'note': data.note_appello,
      'verbalizzazione': data.verbalizzazione,
      'tipoEsame': data.tipo_esame,
    };

    // Imposta campi di testo
    Object.entries(fieldMappings).forEach(([id, value]) => {
      if (value !== undefined && value !== null) {
        setElementValue(id, value);
      }
    });

    // Imposta radio buttons
    if (data.tipo_appello) {
      setRadioValue('tipo_appello_radio', data.tipo_appello === 'PP' ? 'PP' : 'PF');
    }

    // Imposta checkbox
    if (data.hasOwnProperty('mostra_nel_calendario')) {
      setCheckboxValue('mostra_nel_calendario', data.mostra_nel_calendario);
    }
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
                     data-data="${esame.data_appello}" data-aula="${esame.aula}" 
                     data-ora="${esame.ora_appello}" data-durata="${esame.durata_appello}"
                     data-periodo="${esame.periodo}" data-inizio="${esame.data_inizio_iscrizione}" 
                     data-fine="${esame.data_fine_iscrizione}" checked>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${esame.titolo} - ${esame.data_appello}</td>
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
          data_appello: checkbox.dataset.data,
          aula: checkbox.dataset.aula,
          ora_appello: checkbox.dataset.ora,
          durata_appello: parseInt(checkbox.dataset.durata),
          periodo: parseInt(checkbox.dataset.periodo),
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
              cleanupAndHideForm();

              const messageType = response.status === "success" ? "notification" : "warning";
              const messageTitle = response.status === "success" ? "Operazione completata" : "Inserimento parziale";

              // Usa la funzione showMessage per mostrare notifiche nella sidebar
              if (window.showMessage) {
                window.showMessage(response.message, messageTitle, messageType, { timeout: 5000 });
              }

              // Aggiorna calendario
              hideForm(true);

              // Se ci sono errori specifici in caso di inserimento parziale
              if (response.status === "partial" && response.errors) {
                response.errors.forEach((error) => {
                  if (window.showMessage) {
                    window.showMessage(
                      `Errore per ${error.codice}: ${error.errore}`,
                      "Dettagli errore",
                      "warning"
                    );
                  }
                });
              }
            } else {
              // Errore
              if (window.showMessage) {
                window.showMessage(
                  response.message || "Errore durante l'inserimento degli esami",
                  "Errore",
                  "error"
                );
              }
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            // Rimuovi il dialogo anche in caso di errore
            if (document.body.contains(dialogContainer)) {
              removeDialog();
            }
            
            if (window.showMessage) {
              window.showMessage(
                "Si è verificato un errore durante l'inserimento degli esami",
                "Errore di rete",
                "error"
              );
            }
          });
      });
    }
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
    combineTimeValuesUtil();
  }
  
  // Controlla se l'utente è un amministratore
  async function isUserAdmin() {
    const permissions = await checkUserPermissions();
    return permissions.isAdmin;
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
    hideForm(true);
    
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
      // ...existing code...
      return;
    }

    // Per l'inserimento, prepara il FormData con gli insegnamenti e sezioni multiple
    const formData = new FormData();
    
    // Aggiungi i campi base del form
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.type === 'checkbox') {
        if (input.checked) {
          formData.append(input.name, 'on');
        }
      } else if (input.type === 'radio') {
        if (input.checked) {
          formData.append(input.name, input.value);
        }
      } else if (input.name && input.value) {
        // Salta campi che gestiremo separatamente
        if (!input.name.includes('dataora_') && 
            !input.name.includes('ora_h_') && 
            !input.name.includes('ora_m_') && 
            !input.name.includes('aula_') &&
            !input.name.includes('durata_') &&
            input.name !== 'insegnamento') {
          formData.append(input.name, input.value);
        }
      }
    });
    
    // Gestisci gli insegnamenti multipli
    const insegnamentoSelect = document.getElementById('insegnamento');
    if (insegnamentoSelect && insegnamentoSelect.selectedOptions.length > 0) {
      Array.from(insegnamentoSelect.selectedOptions).forEach(option => {
        formData.append('insegnamento', option.value);
      });
    }
    
    // Gestisci le sezioni di date multiple
    const dateSections = document.querySelectorAll('.date-appello-section');
    let sectionIndex = 1;
    
    dateSections.forEach(section => {
      const dataInput = section.querySelector(`[id^="dataora_"]`);
      const oraHInput = section.querySelector(`[id^="ora_h_"]`);
      const oraMInput = section.querySelector(`[id^="ora_m_"]`);
      const aulaSelect = section.querySelector(`[id^="aula_"]`);
      
      if (dataInput && dataInput.value && 
          oraHInput && oraHInput.value && 
          oraMInput && oraMInput.value && 
          aulaSelect && aulaSelect.value) {
        
        formData.append(`dataora_${sectionIndex}`, dataInput.value);
        formData.append(`ora_h_${sectionIndex}`, oraHInput.value);
        formData.append(`ora_m_${sectionIndex}`, oraMInput.value);
        formData.append(`aula_${sectionIndex}`, aulaSelect.value);
        
        // Gestisci la durata dalla sezione globale
        const durataField = document.getElementById('durata');
        if (durataField && durataField.value) {
          formData.append(`durata_${sectionIndex}`, durataField.value);
        }
        
        sectionIndex++;
      }
    });
    
    // Se non ci sono sezioni di date, fallback ai campi legacy
    if (sectionIndex === 1) {
      const legacyData = document.getElementById('dataora');
      const legacyOra = document.getElementById('ora');
      const legacyAula = document.getElementById('aula');
      
      if (legacyData && legacyData.value) {
        formData.append('dataora', legacyData.value);
      }
      if (legacyOra && legacyOra.value) {
        formData.append('ora', legacyOra.value);
      }
      if (legacyAula && legacyAula.value) {
        formData.append('aula', legacyAula.value);
      }
    }

    // Aggiungi flag per bypass se richiesto
    if (options.bypassChecks) {
      formData.append('bypass_checks', 'true');
    }

    // Invia il form
    fetch('/api/inserisciEsame', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success' || data.status === 'direct_insert') {
        // Successo - mostra notifica verde
        if (window.showMessage) {
          window.showMessage(
            data.message || 'Esami inseriti con successo',
            'Operazione completata',
            'notification',
            { timeout: 5000 }
          );
        }
        
        // Reset del form e pulisci eventi provvisori
        document.getElementById('formEsame').reset();
        cleanupAndHideForm();
        
        window.forceCalendarRefresh();
        hideForm(true);
        
      } else if (data.status === 'validation') {
        // Mostra popup di conferma
        mostraPopupConferma(data);
        
      } else if (data.status === 'partial') {
        // Inserimento parziale - mostra warning
        if (window.showMessage) {
          window.showMessage(
            `${data.message}. Inseriti: ${data.inserted.join(', ')}`,
            'Inserimento parziale',
            'warning'
          );
        }
        
      } else if (data.status === 'error') {
        // Errore - mostra notifica rossa
        if (window.showMessage) {
          window.showMessage(
            data.message || 'Errore durante l\'inserimento',
            'Errore',
            'error'
          );
        }
      }
    })
    .catch(error => {
      console.error('Errore di rete:', error);
      if (window.showMessage) {
        window.showMessage(
          'Errore di connessione al server',
          'Errore di rete',
          'error'
        );
      }
    });
  }

  // Gestisce l'invio del form con bypass dei controlli
  function handleBypassChecksSubmit() {
    isUserAdmin().then(isAdmin => {
      if (!isAdmin) {
        showValidationError("Solo gli amministratori possono utilizzare questa funzione");
        return;
      }
      
      // Anche per il bypass, controlla se ci sono errori di validazione delle date
      const errorFields = document.querySelectorAll('.form-input-error');
      if (errorFields.length > 0) {
        showValidationError("Correggi gli errori nelle date prima di inviare il form, anche con bypass");
        errorFields[0].focus();
        return;
      }
      
      // Combina i valori di ora e durata prima dell'invio
      combineTimeValues();
      
      submitFormData({ bypassChecks: true });
    });
  }

  // Gestisce l'invio standard del form
  function handleFormSubmit(e) {
    e.preventDefault();

    // Combina ora e durata
    combineTimeValues();

    // Controlla se ci sono campi data con errori di validazione
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di inviare il form");
      // Focalizza il primo campo con errore
      errorFields[0].focus();
      return;
    }

    // Validazione usando le regole unificate
    const validationResults = {
      giorno_settimana: validateFormField('giorno_settimana', getFirstDateValue(), formValidationRules),
      ora_appello: validateFormField('ora_appello', getFirstTimeValue(), formValidationRules),
      durata_esame: validateFormField('durata_esame', getDurationValue(), formValidationRules)
    };

    // Controlla se ci sono errori di validazione
    for (const [field, result] of Object.entries(validationResults)) {
      if (!result.isValid) {
        showValidationError(result.message);
        return;
      }
    }

    // Validazione aula
    const firstAulaSelect = document.querySelector('[id^="aula_"]');
    if (firstAulaSelect && !firstAulaSelect.value) {
      showValidationError("Seleziona un'aula disponibile");
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
  function hideForm(cleanupProvisional = false) {
    if (formContainer) {
      // Rimuovi la classe active per animare la chiusura
      formContainer.classList.remove('active');
      formContainer.classList.remove('form-content-area');
      
      // Nascondi completamente il form container dopo la transizione
      setTimeout(() => {formContainer.style.display = 'none';}, 300);
      
      // Ripristina il calendario a larghezza piena
      const calendarEl = document.getElementById('calendar');
      if (calendarEl) {
        calendarEl.classList.remove('form-visible');
      }
      
      // Pulisci gli eventi provvisori solo se richiesto esplicitamente
      if (cleanupProvisional) {
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
          console.error('Errore durante la pulizia del form:', error);
        }
      }
    } else {
      console.warn('formContainer non trovato durante la chiusura del form');
    }
  }

  // Funzione helper per gestire la chiusura di overlay e pulizia
  function cleanupAndHideForm() {
    // Pulisci eventi provvisori
    if (window.clearCalendarProvisionalEvents) {
      window.clearCalendarProvisionalEvents();
    }
    selectedDates = [];
    
    // Ricarica le date valide per rimuovere i "dintorni" degli eventi provvisori
    if (currentUsername && window.loadDateValide) {
      window.loadDateValide(currentUsername).then(newDates => {
        dateValide = newDates;
      }).catch(error => {
        console.error('Errore nel ricaricare le date valide:', error);
      });
    }
    
    window.forceCalendarRefresh();
  }


  // Interfaccia pubblica
  return {
    loadForm,
    showForm,
    hideForm,
    combineTimeValues,
    combineDurataValues,
    setupTimeCombiningHandlers,
    usePreferences: true,
    removeDateSection,
    addDateSection,
    initializeDateSections,
    setupProvisionalDeleteButton,
    handleDeleteProvisional
  };
}());
window.EsameForm = EsameForm;

// Funzioni globali per la gestione delle sezioni date - delega al nuovo modulo
window.removeDateSection = function(sectionId) {
  if (window.FormEsameAppelli) {
    window.FormEsameAppelli.removeDateSection(sectionId);
  } else {
    console.error('FormEsameAppelli non è caricato');
  }
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