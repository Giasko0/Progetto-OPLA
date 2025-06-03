// Script per la gestione del form di inserimento esame
const EsameForm = (function() {
  // Verifica che FormUtils sia caricato
  if (!window.FormUtils) {
    throw new Error('FormUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsame.js');
  }

  // Importa le utilità necessarie da FormUtils
  const {
    setElementValue,
    setRadioValue,
    setCheckboxValue,
    setDurationFromMinutes,
    parseTimeString
  } = window.FormUtils;

  let formContainer = null;
  let currentUsername = null;
  let userPreferences = [];
  let isEditMode = false;
  let usePreferences = true;

  // Riusa dateValide dal context globale del calendario
  const getDateValide = () => window.dateValide || [];

  // Verifica che EsameAppelli sia caricato
  if (!window.EsameAppelli) {
    throw new Error('EsameAppelli non è caricato. Assicurati che formEsameAppelli.js sia incluso prima di formEsame.js');
  }

  // Verifica che FormEsameControlli sia caricato
  if (!window.FormEsameControlli) {
    throw new Error('FormEsameControlli non è caricato. Assicurati che formEsameControlli.js sia incluso prima di formEsame.js');
  }

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
      
      // Reset del counter delle sezioni solo alla prima apertura del form (non ad ogni click su data)
      if (!isEdit && !formContainer.classList.contains('active') && window.EsameAppelli && window.EsameAppelli.resetSections) {
        window.EsameAppelli.resetSections();
      }
            
      // Componenti principali del form
      const formTitle = formContainer.querySelector(".form-header h2");
      const esameForm = formContainer.querySelector("#formEsame");
      
      if (formTitle) formTitle.textContent = isEdit ? "Modifica Esame" : "Aggiungi Esame";
      
      // Gestione campo ID per modifica
      const idField = formContainer.querySelector("#examIdField");
      if (idField) idField.value = isEdit && data.id ? data.id : "";
      
      // Reset form solo se non ci sono già sezioni con dati
      const existingSections = formContainer.querySelectorAll('.date-appello-section');
      const hasExistingData = Array.from(existingSections).some(section => {
        const inputs = section.querySelectorAll('input, select, textarea');
        return Array.from(inputs).some(input => {
          if (input.type === 'checkbox') return input.checked;
          if (input.type === 'radio') return input.checked;
          return input.value && input.value.trim() !== '';
        });
      });
      
      // Reset solo se siamo in modalità edit o non ci sono dati esistenti
      if (isEdit || !hasExistingData) {
        if (esameForm) esameForm.reset();
      }
      
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
        
        // Carica preferenze solo in modalità creazione e se non ci sono sezioni con dati
        if (usePreferences && !hasExistingData) {
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
          setTimeout(() => window.EsameAppelli.updateAuleForSection(firstSectionCounter), 100);
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
      // Verifica se esiste già una sezione con questa data
      const existingSections = document.querySelectorAll('.date-appello-section');
      const dateAlreadyExists = Array.from(existingSections).some(section => 
        section.dataset.date === partialData.date
      );
      
      if (!dateAlreadyExists) {
        // Controlla se esiste una sezione vuota (senza data)
        const emptySections = Array.from(existingSections).filter(section => 
          !section.dataset.date || section.dataset.date === ''
        );

        if (emptySections.length > 0) {
          // Se c'è una sezione vuota, riempila con la nuova data
          const emptySection = emptySections[0];
          const dateInput = emptySection.querySelector('[id^="dataora_"]');
          if (dateInput) {
            dateInput.value = partialData.date;
            emptySection.dataset.date = partialData.date;
            // Trigger l'evento change per aggiornare l'aula
            dateInput.dispatchEvent(new Event('change'));
          }
        } else {
          // Se non ci sono sezioni vuote, aggiungi una nuova sezione
          window.EsameAppelli.addDateSection(partialData.date);
        }
      } else {
        // Se la data esiste già, evidenzia la sezione esistente
        const existingSection = Array.from(existingSections).find(section => 
          section.dataset.date === partialData.date
        );
        if (existingSection) {
          existingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          existingSection.style.border = '2px solid #007bff';
          setTimeout(() => {
            existingSection.style.border = '';
          }, 2000);
        }
      }
    }
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
      // Inizializza le sezioni di date
      window.EsameAppelli.initializeDateSections();
      
      // Verifica se esistono già sezioni
      const existingSections = document.querySelectorAll('.date-appello-section');
      
      // Aggiungi almeno una sezione vuota solo se non ce ne sono già E non c'è una data preselezionata
      if (existingSections.length === 0 && !options.date) {
        window.EsameAppelli.addDateSection();
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

  function handleInsegnamentoSelection(data) {
    if (window.InsegnamentiManager && data.insegnamento_codice) {
      window.InsegnamentiManager.clearSelection();
      window.InsegnamentiManager.selectInsegnamento(data.insegnamento_codice, {
        semestre: data.semestre || 1,
        anno_corso: data.anno_corso || 1,
        cds: data.cds_codice || ""
      });
      
      const multiSelectBox = document.getElementById("insegnamentoBox");
      if (multiSelectBox) {
        window.InsegnamentiManager.syncUI(multiSelectBox);
      }
    }
  }

  // Configura i gestori per combinare i valori di ora e durata - aggiornato per sezioni modulari
  function setupTimeCombiningHandlers() {
    const form = document.getElementById("formEsame");
    if (!form) return;
    
    // Combina l'ora al submit del form
    form.addEventListener("submit", combineTimeValuesForAllSections);
    
    // Aggiungi anche al pulsante di bypass
    const bypassBtn = document.getElementById("bypassChecksBtn");
    if (bypassBtn) {
      bypassBtn.addEventListener("click", combineTimeValuesForAllSections);
    }
  }

  // Combina i valori di ora e durata per tutte le sezioni
  function combineTimeValuesForAllSections() {
    const dateSections = document.querySelectorAll('.date-appello-section');
    
    dateSections.forEach((section, index) => {
      const sectionIndex = index + 1;
      
      // Combina ora per questa sezione
      const ora_h = section.querySelector(`[id^="ora_h_"]`)?.value;
      const ora_m = section.querySelector(`[id^="ora_m_"]`)?.value;
      
      if (ora_h && ora_m) {
        const oraField = section.querySelector(`[id^="ora_"]`);
        if (oraField && oraField.type === 'hidden') {
          oraField.value = `${ora_h}:${ora_m}`;
        }
      }
      
      // Combina durata per questa sezione
      const durata_h = parseInt(section.querySelector(`[id^="durata_h_"]`)?.value) || 0;
      const durata_m = parseInt(section.querySelector(`[id^="durata_m_"]`)?.value) || 0;
      const durata_totale = (durata_h * 60) + durata_m;
      
      const durataField = section.querySelector(`[id^="durata_"][type="hidden"]`);
      if (durataField) {
        durataField.value = durata_totale.toString();
      }
    });
  }
  
  // Combina i valori di ora e durata - ora delegata alla funzione per tutte le sezioni
  function combineTimeValues() {
    combineTimeValuesForAllSections();
  }

  // Controlla se l'utente è un amministratore
  async function isUserAdmin() {
    return await window.FormEsameControlli.isUserAdmin();
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

    // Per l'inserimento, prepara il FormData con le sezioni multiple
    const formData = new FormData();
    
    // Aggiungi solo i campi globali (docente e insegnamenti)
    const docenteField = document.getElementById('docente');
    if (docenteField && docenteField.value) {
      formData.append('docente', docenteField.value);
    }
    
    // Gestisci gli insegnamenti usando InsegnamentiManager
    let insegnamentiSelected = [];
    if (window.InsegnamentiManager && typeof window.InsegnamentiManager.getSelectedInsegnamenti === 'function') {
      insegnamentiSelected = window.InsegnamentiManager.getSelectedInsegnamenti();
    } else {
      // Fallback: usa il select nascosto
      const insegnamentoSelect = document.getElementById('insegnamento');
      if (insegnamentoSelect && insegnamentoSelect.selectedOptions.length > 0) {
        insegnamentiSelected = Array.from(insegnamentoSelect.selectedOptions).map(option => option.value);
      }
    }
    
    // Aggiungi gli insegnamenti al FormData
    if (insegnamentiSelected && insegnamentiSelected.length > 0) {
      insegnamentiSelected.forEach(codice => {
        formData.append('insegnamento', codice);
      });
    } else {
      if (window.showMessage) {
        window.showMessage('Nessun insegnamento selezionato', 'Errore', 'error');
      }
      return;
    }
    
    // Raccogli tutti i dati dalle sezioni di appelli
    const dateSections = document.querySelectorAll('.date-appello-section');
    let hasValidSections = false;
    
    dateSections.forEach((section, index) => {
      const sectionIndex = index + 1;
      
      // Raccogli tutti i campi della sezione
      const fields = {
        descrizione: section.querySelector(`[id^="descrizione_"]`)?.value,
        dataora: section.querySelector(`[id^="dataora_"]`)?.value,
        ora_h: section.querySelector(`[id^="ora_h_"]`)?.value,
        ora_m: section.querySelector(`[id^="ora_m_"]`)?.value,
        durata_h: section.querySelector(`[id^="durata_h_"]`)?.value,
        durata_m: section.querySelector(`[id^="durata_m_"]`)?.value,
        aula: section.querySelector(`[id^="aula_"]`)?.value,
        inizioIscrizione: section.querySelector(`[id^="inizioIscrizione_"]`)?.value,
        fineIscrizione: section.querySelector(`[id^="fineIscrizione_"]`)?.value,
        verbalizzazione: section.querySelector(`[id^="verbalizzazione_"]`)?.value,
        tipoEsame: section.querySelector(`[id^="tipoEsame_"]`)?.value,
        note: section.querySelector(`[id^="note_"]`)?.value,
        mostra_nel_calendario: section.querySelector(`[id^="mostra_nel_calendario_"]`)?.checked,
        tipo_appello_radio: section.querySelector(`input[name^="tipo_appello_radio_"]:checked`)?.value
      };
      
      // Verifica che i campi obbligatori siano presenti
      if (fields.descrizione && fields.dataora && fields.ora_h && fields.ora_m && fields.aula) {
        // Calcola durata totale
        const durataH = parseInt(fields.durata_h) || 0;
        const durataM = parseInt(fields.durata_m) || 0;
        const durataTotale = (durataH * 60) + durataM;
        
        // Aggiungi tutti i campi della sezione con indice
        formData.append(`descrizione_${sectionIndex}`, fields.descrizione);
        formData.append(`dataora_${sectionIndex}`, fields.dataora);
        formData.append(`ora_h_${sectionIndex}`, fields.ora_h);
        formData.append(`ora_m_${sectionIndex}`, fields.ora_m);
        formData.append(`durata_${sectionIndex}`, durataTotale.toString());
        formData.append(`aula_${sectionIndex}`, fields.aula);
        formData.append(`verbalizzazione_${sectionIndex}`, fields.verbalizzazione || 'FSS');
        formData.append(`tipo_appello_${sectionIndex}`, fields.tipo_appello_radio || 'PF');
        
        if (fields.inizioIscrizione) {
          formData.append(`inizioIscrizione_${sectionIndex}`, fields.inizioIscrizione);
        }
        if (fields.fineIscrizione) {
          formData.append(`fineIscrizione_${sectionIndex}`, fields.fineIscrizione);
        }
        if (fields.tipoEsame) {
          formData.append(`tipoEsame_${sectionIndex}`, fields.tipoEsame);
        }
        if (fields.note) {
          formData.append(`note_${sectionIndex}`, fields.note);
        }
        
        formData.append(`mostra_nel_calendario_${sectionIndex}`, fields.mostra_nel_calendario ? 'true' : 'false');
        
        hasValidSections = true;
      }
    });
    
    if (!hasValidSections) {
      if (window.showMessage) {
        window.showMessage('Nessuna sezione appello valida trovata', 'Errore', 'error');
      }
      return;
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
      if (data.status === 'success') {
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
        
      } else if (data.status === 'error') {
        // Errore - mostra messaggio di errore
        if (window.showMessage) {
          window.showMessage(
            data.message || 'Errore durante l\'inserimento degli esami',
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
      
      // Usa la validazione del modulo di controllo per il bypass
      if (!window.FormEsameControlli.validateFormWithBypass()) {
        return;
      }
      
      // Combina i valori di ora e durata prima dell'invio
      combineTimeValuesForAllSections();
      
      submitFormData({ bypassChecks: true });
    });
  }

  // Gestisce l'invio standard del form
  function handleFormSubmit(e) {
    e.preventDefault();

    // Combina ora e durata per tutte le sezioni
    combineTimeValuesForAllSections();

    // Usa la validazione del modulo di controllo
    if (!window.FormEsameControlli.validateForm()) {
      return;
    }

    submitFormData();
  }

  // Helper functions per la validazione - delegate to FormEsameControlli (aggiornate)
  function getFirstDateValue() {
    return window.FormEsameControlli.getFirstDateValue();
  }

  function getFirstTimeValue() {
    return window.FormEsameControlli.getFirstTimeValue();
  }

  function getDurationValue() {
    return window.FormEsameControlli.getDurationValue();
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
          
          // Reset delle sezioni date
          if (window.EsameAppelli && window.EsameAppelli.resetSections) {
            window.EsameAppelli.resetSections();
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

  // Interfaccia pubblica - aggiunta nuova funzione
  return {
    loadForm,
    showForm,
    hideForm,
    combineTimeValues,
    combineTimeValuesForAllSections,
    combineDurataValues,
    setupTimeCombiningHandlers,
    usePreferences: true,
    setupProvisionalDeleteButton,
    handleDeleteProvisional,
    cleanupAndHideForm
  };
}());
window.EsameForm = EsameForm;

// Funzioni globali per la gestione delle sezioni date (delegate to EsameAppelli)
window.removeDateSection = function(sectionId) {
  EsameAppelli.removeDateSection(sectionId);
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