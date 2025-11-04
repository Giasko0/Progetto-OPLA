// Script semplificato per la gestione del form di inserimento esame
const EsameForm = (function() {
  let formContainer = null;
  let currentUsername = null;
  let isEditMode = false;
  let currentFormMode = null; // Traccia la modalità corrente: 'insert', 'edit', 'read-only'

  // Carica il form HTML dinamicamente
  async function loadForm() {
    formContainer = document.getElementById('form-container');
    
    // Se il contenuto è già stato caricato, non ricaricarlo
    if (formContainer.querySelector('#formEsame')) {
      return formContainer;
    }
    
    const formContent = document.getElementById('form-esame-content');
    formContainer.innerHTML = formContent.innerHTML;
    formContainer.classList.add('side-form', 'form-content-area');
    
    // Inizializza il listener di chiusura
    const closeBtn = formContainer.querySelector("#closeOverlay");
    closeBtn.addEventListener("click", hideForm);
    
    return formContainer;
  }
  
  // Mostra il form di inserimento esame
  async function showForm(data = {}, isEdit = false) {
    await loadForm();
    
    const isAlreadyOpen = formContainer.style.display === 'block';
    const newFormMode = isEdit ? 'edit' : 'insert';
    
    // Controlla se la modalità è cambiata
    const modeChanged = currentFormMode !== null && currentFormMode !== newFormMode;
    
    if (isAlreadyOpen && modeChanged) {
      // Reinizializza il form se la modalità è cambiata
      reinitializeForm();
    }
    
    // Aggiorna la modalità corrente
    currentFormMode = newFormMode;
    
    // Mostra form
    formContainer.style.display = 'block';
    formContainer.classList.add('active');
    document.getElementById('calendar').classList.add('form-visible');
    
    isEditMode = isEdit;
    
    const examIdField = formContainer.querySelector("#examIdField");
    examIdField.value = isEdit && data.id ? data.id : "";

    if (isEdit) {
      await handleEditMode(data.id);
    } else {
      await handleCreationMode(data, isAlreadyOpen);
    }
    
    // Setup listener comuni
    setupCommonListeners();
    setTimeout(() => {
      window.closeSidebar();
    }, 200);

    return true;
  }

  // Nuova funzione per reinizializzare il form
  function reinitializeForm() {
    // Reset completo del form
    const esameForm = formContainer.querySelector("#formEsame");
    if (esameForm) {
      esameForm.reset();
      delete esameForm.dataset.creationInProgress;
    }

    // IMPORTANTE: Pulisci gli eventi provvisori PRIMA di resettare le sezioni
    window.clearCalendarProvisionalEvents?.();

    // Pulisci le sezioni
    window.EsameAppelli?.resetSections();

    // Pulisci gli insegnamenti
    window.InsegnamentiManager?.cleanup();
    const dropdownElement = document.getElementById("insegnamentoDropdown");
    if (dropdownElement) {
      dropdownElement.style.display = '';
    }

    // Rimuovi stili di sola lettura se presenti
    removeReadOnlyMode();

    // Ripristina titolo
    const formTitle = formContainer.querySelector(".form-header h2");
    if (formTitle) formTitle.textContent = "Aggiungi Esame";

    // Mostra pulsanti preferenze
    const preferencesButtons = formContainer.querySelectorAll('#savePreferenceBtn, #loadPreferenceBtn');
    preferencesButtons.forEach(btn => {
      if (btn) btn.style.display = '';
    });

    // Svuota e mostra area pulsanti azione
    const formActions = formContainer.querySelector('.form-actions');
    if (formActions) {
      formActions.innerHTML = '';
      formActions.style.display = '';
    }

    // Mostra pulsanti aggiunta/rimozione sezioni
    const sectionButtons = formContainer.querySelectorAll('.add-date-btn, .remove-date-btn');
    sectionButtons.forEach(btn => {
      if (btn) btn.style.display = '';
    });

    // Ripristina il campo insegnamento
    const multiSelectBox = document.getElementById("insegnamentoBox");
    if (multiSelectBox) {
      multiSelectBox.classList.remove('disabled');
      multiSelectBox.style.pointerEvents = '';
      multiSelectBox.style.opacity = '';
      multiSelectBox.style.color = '';
      multiSelectBox.title = '';
      multiSelectBox.innerHTML = '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
    }

    // Reset della modalità corrente
    currentFormMode = null;
    isEditMode = false;
    
    // IMPORTANTE: Forza la reinizializzazione dell'UI dopo un breve delay
    setTimeout(() => {
      // Reinizializza le sezioni per modalità inserimento
      window.EsameAppelli?.initializeDateSections();
      
      // Aggiungi una sezione vuota se non ce ne sono
      const existingSections = document.querySelectorAll('.date-appello-section');
      if (existingSections.length === 0) {
        window.EsameAppelli?.addDateSection('');
      }
    }, 50);
  }

  // Gestione modalità modifica
  async function handleEditMode(examId) {
    try {
      const examData = await window.EditEsame.editExam(examId);
      // Controlla se è modalità sola lettura
      if (examData.is_read_only) {
        setupReadOnlyMode(examData);
      }
    } catch (error) {
      hideForm(true, true);
      throw error;
    }
  }

  // Gestione modalità creazione (aggiornata)
  async function handleCreationMode(data, isAlreadyOpen) {
    const formTitle = formContainer.querySelector(".form-header h2");
    if (formTitle) formTitle.textContent = "Aggiungi Esame";
    const esameForm = formContainer.querySelector("#formEsame");

    // Rimuovi eventuali stili di sola lettura rimasti
    removeReadOnlyMode();

    // Mostra pulsanti preferenze
    const preferencesButtons = formContainer.querySelectorAll('#savePreferenceBtn, #loadPreferenceBtn');
    preferencesButtons.forEach(btn => {
      if (btn) btn.style.display = '';
    });

    // Mostra pulsanti aggiunta/rimozione sezioni
    const sectionButtons = formContainer.querySelectorAll('.add-date-btn, .remove-date-btn');
    sectionButtons.forEach(btn => {
      if (btn) btn.style.display = '';
    });

    // Mostra e svuota area azioni
    const formActions = formContainer.querySelector('.form-actions');
    if (formActions) {
      formActions.style.display = '';
      formActions.innerHTML = '';
    }

    // Reset form
    esameForm.reset();
    
    // IMPORTANTE: Non chiamare resetSections qui se è già stato fatto in reinitializeForm
    // Controlla se ci sono già sezioni inizializzate
    const existingSections = document.querySelectorAll('.date-appello-section');
    if (existingSections.length === 0) {
      window.EsameAppelli.resetSections();
      initUI(data);
    }
    
    loadUserPreferences();
    
    setTimeout(() => {
      if (!window.FormEsameAutosave?.loadSavedData()) {
        setDefaultCheckboxes();
      }
    }, 150);
    
    esameForm.dataset.creationInProgress = "true";
    
    // IMPORTANTE: Setup pulsanti dopo il reset
    await setupButtons(false, null);
    setupEventListeners();
  }

  // Funzione helper per checkbox default
  function setDefaultCheckboxes() {
    const firstSection = document.querySelector('.date-appello-section');
    if (firstSection) {
      const counter = firstSection.id.split('_')[1] || '1';
      const checkbox = firstSection.querySelector(`#mostra_nel_calendario_${counter}`);
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
      }
    }
  }

  // Setup listener comuni
  function setupCommonListeners() {
    // Usa il container del form per trovare i pulsanti (più sicuro dopo reinizializzazione)
    const saveBtn = formContainer.querySelector("#savePreferenceBtn");
    const loadBtn = formContainer.querySelector("#loadPreferenceBtn");
    const closeBtn = formContainer.querySelector("#closeOverlay");

    if (closeBtn) {
      closeBtn.removeEventListener("click", hideForm);
      closeBtn.addEventListener("click", hideForm);
    }

    if (saveBtn && window.EsamePreferenze?.saveCurrentPreference) {
      saveBtn.removeEventListener("click", window.EsamePreferenze.saveCurrentPreference);
      saveBtn.addEventListener("click", window.EsamePreferenze.saveCurrentPreference);
    }

    if (loadBtn && window.EsamePreferenze?.togglePreferencesMenu) {
      loadBtn.removeEventListener("click", window.EsamePreferenze.togglePreferencesMenu);
      loadBtn.addEventListener("click", window.EsamePreferenze.togglePreferencesMenu);
    }
  }

  // Setup modalità sola lettura
  function setupReadOnlyMode(examData) {
    // Modifica il titolo del form
    const formTitle = formContainer.querySelector(".form-header h2");
    if (formTitle) formTitle.textContent = "Visualizza Esame";

    // Disabilita tutti i controlli del form
    const allInputs = formContainer.querySelectorAll('input, select, textarea, button');
    allInputs.forEach(input => {
      if (input.id !== 'closeOverlay') { // Mantieni attivo solo il pulsante di chiusura
        input.disabled = true;
        input.style.opacity = '0.7';
      }
    });

    // Nascondi i pulsanti di preferenze
    const preferencesButtons = formContainer.querySelectorAll('#savePreferenceBtn, #loadPreferenceBtn');
    preferencesButtons.forEach(btn => {
      if (btn) btn.style.display = 'none';
    });

    // Nascondi i pulsanti di aggiunta/rimozione sezioni
    const sectionButtons = formContainer.querySelectorAll('.add-date-btn, .remove-date-btn');
    sectionButtons.forEach(btn => {
      if (btn) btn.style.display = 'none';
    });

    // Rimuovi tutti i pulsanti di azione
    const formActions = formContainer.querySelector('.form-actions');
    if (formActions) {
      formActions.innerHTML = '';
    }

    // Gestisci il campo insegnamento in modalità sola lettura
    const multiSelectBox = document.getElementById("insegnamentoBox");
    const dropdownElement = document.getElementById("insegnamentoDropdown");
    
    if (multiSelectBox) {
      multiSelectBox.classList.add('disabled');
      multiSelectBox.style.pointerEvents = 'none';
      multiSelectBox.style.opacity = '0.7';
      multiSelectBox.style.color = '#000000';
      multiSelectBox.title = 'Campo non modificabile in modalità visualizzazione';
    }
    
    if (dropdownElement) {
      dropdownElement.style.display = 'none';
    }

    // Applica stile visivo per indicare la modalità sola lettura
    formContainer.classList.add('read-only-mode');
  }

  // Inizializza l'interfaccia utente del form
  function initUI(options = {}) {
    setTimeout(() => {
      window.EsameAppelli.initializeDateSections();
      
      const existingSections = document.querySelectorAll('.date-appello-section');
      
      if (existingSections.length === 0 && !options.date) {
        window.EsameAppelli.addDateSection('', { isNonOfficialPartial: options.isNonOfficialPartial });
      }
      
      initUserData();
      
      // Aggiungi updateDynamicFields qui, dopo che le sezioni sono state create
      setTimeout(() => {
        updateDynamicFields();
      }, 50);
    }, 10);
  }

  // Inizializza dati utente
  function initUserData() {
    window.getUserData()
      .then((data) => {
        const field = document.getElementById("docente");
        field.value = data.user_data.username;
        currentUsername = data.user_data.username;
        
        // Inizializza multi-select insegnamenti
        initInsegnamenti();
      })
      .catch((error) => console.error("Errore nel recupero dei dati utente:", error));
    
    window.updatePageTitle();
    checkPreselectedInsegnamenti();
  }

  // Inizializza gestione insegnamenti
  function initInsegnamenti() {
    // Se siamo in modalità edit e l'insegnamento è già bloccato, non inizializzare InsegnamentiManager
    const multiSelectBox = document.getElementById("insegnamentoBox");
    if (isEditMode && multiSelectBox && multiSelectBox.classList.contains('disabled')) {
      return; // Non inizializzare InsegnamentiManager se il campo è bloccato
    }
    
    const boxElement = document.getElementById("insegnamentoBox");
    const dropdownElement = document.getElementById("insegnamentoDropdown");
    const optionsElement = document.getElementById("insegnamentoOptions");
    
    window.InsegnamentiManager.cleanup();
    window.InsegnamentiManager.initUI("insegnamentoBox", "insegnamentoDropdown", "insegnamentoOptions", currentUsername);
    
    window.InsegnamentiManager.onChange(() => {
      const multiSelectBox = document.getElementById("insegnamentoBox");
      window.InsegnamentiManager.syncUI(multiSelectBox);
    });
  }

  // Carica preferenze utente
  function loadUserPreferences() {
    window.getUserData()
      .then(data => {
        currentUsername = data.user_data.username;
        window.EsamePreferenze.setCurrentUsername(currentUsername);
        window.EsamePreferenze.loadUserPreferences();
      })
      .catch(error => console.error("Errore dati utente:", error));
  }
  
  // Configura event listeners
  function setupEventListeners() {
    // Aggiorna la ricerca degli elementi al momento dell'uso (possono essere stati creati dinamicamente)
    const esameForm = formContainer.querySelector('#formEsame');
    if (esameForm) {
      esameForm.removeEventListener('submit', handleFormSubmit);
      esameForm.addEventListener('submit', handleFormSubmit);
    }

    // Radio buttons tipo appello - usa query dentro il form
    formContainer.querySelectorAll('input[name^="tipo_appello_radio"]').forEach(radio => {
      radio.removeEventListener("change", aggiornaVerbalizzazione);
      radio.addEventListener("change", aggiornaVerbalizzazione);
    });

    // Pulsante bypass per admin (potrebbe essere creato dinamicamente)
    const bypassBtn = formContainer.querySelector('#bypassChecksBtn');
    if (bypassBtn) {
      bypassBtn.removeEventListener("click", handleBypassChecksSubmit);
      bypassBtn.addEventListener("click", handleBypassChecksSubmit);
    }

    // Pulsanti preferenze (assicurati siano collegati)
    setupCommonListeners();
  }

  // Aggiorna verbalizzazione in base al tipo appello
  function aggiornaVerbalizzazione() {
    // Cerca gli elementi in tutte le sezioni disponibili
    const tipoAppelloPP = document.querySelector('input[name*="tipo_appello_radio"][value="PP"]');
    const verbalizzazioneSelect = document.querySelector('select[name*="verbalizzazione"]');
    
    if (!tipoAppelloPP || !verbalizzazioneSelect) {
      return;
    }

    const options = tipoAppelloPP.checked 
      ? [
          { value: "PAR", text: "Prova parziale" },
          { value: "PPP", text: "Prova parziale con pubblicazione" }
        ]
      : [
          { value: "FSS", text: "Firma digitale singola" },
          { value: "FWP", text: "Firma digitale con pubblicazione" }
        ];

    verbalizzazioneSelect.innerHTML = "";
    options.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      verbalizzazioneSelect.appendChild(optionElement);
    });

    verbalizzazioneSelect.value = tipoAppelloPP.checked ? "PAR" : "FSS";
  }

  // Controlla insegnamenti preselezionati dall'URL
  function checkPreselectedInsegnamenti() {
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedParam = urlParams.get("insegnamenti");
    
    if (!preselectedParam || !currentUsername) return;
    
    const preselectedCodes = preselectedParam.split(",");
    
    window.InsegnamentiManager.loadInsegnamenti(
      currentUsername, 
      { filter: preselectedCodes },
      data => {
        data.forEach(ins => {
          window.InsegnamentiManager.selectInsegnamento(ins.codice, {
            semestre: ins.semestre || 1,
            anno_corso: ins.anno_corso || 1,
            cds: ins.cds_codice || ""
          });
        });
        
        const multiSelectBox = document.getElementById("insegnamentoBox");
        window.InsegnamentiManager.syncUI(multiSelectBox, data);
      }
    );
  }

  // Combina valori tempo per tutte le sezioni
  function combineTimeValuesForAllSections() {
    window.FormEsameData?.combineTimeValuesForAllSections();
  }

  // Configura pulsanti del form
  async function setupButtons(isEdit, examId) {
    // Cerca .form-actions all'interno del formContainer (non globalmente)
    let formActions = formContainer.querySelector('.form-actions');

    // Se non esiste, crealo (safeguard)
    if (!formActions) {
      const esameForm = formContainer.querySelector('#formEsame') || formContainer;
      formActions = document.createElement('div');
      formActions.className = 'form-actions';
      esameForm.appendChild(formActions);
    }

    // Svuota prima di ricreare
    formActions.innerHTML = '';
    formActions.style.display = '';

    const isAdmin = await window.FormEsameControlli?.isUserAdmin();

    const buttons = isEdit ? getEditButtons(examId, isAdmin) : getCreationButtons(isAdmin);

    buttons.forEach(button => {
      formActions.appendChild(button);
    });

    // Dopo aver aggiunto i pulsanti, (ri)collego eventuali listener che dipendono dai pulsanti
    setupEventListeners();
  }

  // Helper per pulsanti modifica
  function getEditButtons(examId, isAdmin) {
    const buttons = [];
    
    // Pulsante modifica
    const modifyBtn = createButton("submit", "form-button", "Modifica");
    buttons.push(modifyBtn);

    // Pulsante bypass admin
    if (isAdmin) {
      const bypassBtn = createButton("button", "form-button bypass", "Modifica senza controlli");
      bypassBtn.id = "bypassChecksBtn";
      bypassBtn.addEventListener("click", handleBypassChecksSubmit);
      buttons.push(bypassBtn);
    }

    // Pulsante elimina
    const deleteBtn = createButton("button", "form-button danger", "Elimina Esame");
    deleteBtn.id = "deleteExamBtn";
    deleteBtn.onclick = () => {
      if (confirm("Sei sicuro di voler eliminare questo esame?")) {
        window.deleteEsame(examId);
      }
    };
    buttons.push(deleteBtn);

    return buttons;
  }

  // Helper per pulsanti creazione
  function getCreationButtons(isAdmin) {
    const buttons = [];
    
    // Pulsante inserisci
    const submitBtn = createButton("submit", "form-button", "Inserisci");
    buttons.push(submitBtn);

    // Pulsante bypass admin
    if (isAdmin) {
      const bypassBtn = createButton("button", "form-button bypass", "Inserisci senza controlli");
      bypassBtn.id = "bypassChecksBtn";
      bypassBtn.addEventListener("click", handleBypassChecksSubmit);
      buttons.push(bypassBtn);
    }

    return buttons;
  }

  // Helper per creare pulsanti
  function createButton(type, className, text) {
    const button = document.createElement("button");
    button.type = type;
    button.className = className;
    button.textContent = text;
    return button;
  }

  // Gestisce invio form con bypass
  function handleBypassChecksSubmit() {
    window.FormEsameControlli?.isUserAdmin().then(isAdmin => {
      if (!isAdmin) {
        window.showMessage("Solo gli amministratori possono utilizzare questa funzione", "Accesso negato", "error");
        return;
      }
      
      if (!window.FormEsameControlli?.validateFormWithBypass()) return;
      
      combineTimeValuesForAllSections();
      window.FormEsameData?.submitFormData({ bypassChecks: true, isEdit: isEditMode });
    });
  }

  // Gestisce invio standard del form
  function handleFormSubmit(e) {
    e.preventDefault();
    combineTimeValuesForAllSections();

    if (!window.FormEsameControlli?.validateForm()) return;

    window.FormEsameData?.submitFormData({ isEdit: isEditMode });
  }

  // Aggiorna campi dinamici del form
  function updateDynamicFields() {
    aggiornaVerbalizzazione();
  }

  // Nasconde il form
  function hideForm(cleanupProvisional = false, clearAutosave = false) {
    // Imposta il flag per evitare l'apertura automatica della sidebar
    window.formJustClosed = true;
    setTimeout(() => {
      window.formJustClosed = false;
    }, 1000);
    
    if (clearAutosave) {
      window.FormEsameAutosave?.clearSavedData();
    }
    
    const esameForm = formContainer.querySelector("#formEsame");
    if (esameForm) {
      delete esameForm.dataset.creationInProgress;
    }

    // Rimuovi la classe read-only-mode quando si chiude il form
    formContainer.classList.remove('active', 'form-content-area', 'read-only-mode');
    setTimeout(() => formContainer.style.display = 'none', 300);
    
    document.getElementById('calendar').classList.remove('form-visible');
    
    // Reset della modalità corrente
    currentFormMode = null;
    
    if (cleanupProvisional) {
      // Cleanup completo
      document.getElementById('insegnamentoDropdown').style.display = 'none';
      window.InsegnamentiManager?.cleanup();
      window.clearCalendarProvisionalEvents?.();
      window.EsameAppelli?.resetSections();
      window.forceCalendarRefresh?.();
    }
  }

  // Rimuove gli stili della modalità sola lettura
  function removeReadOnlyMode() {
    // Rimuovi la classe read-only-mode
    formContainer.classList.remove('read-only-mode');

    // Riabilita tutti i controlli del form
    const allInputs = formContainer.querySelectorAll('input, select, textarea, button');
    allInputs.forEach(input => {
      input.disabled = false;
      input.style.opacity = '';
    });

    // Ripristina i pulsanti di preferenze
    const preferencesButtons = formContainer.querySelectorAll('#savePreferenceBtn, #loadPreferenceBtn');
    preferencesButtons.forEach(btn => {
      if (btn) btn.style.display = '';
    });

    // Ripristina i pulsanti di aggiunta/rimozione sezioni
    const sectionButtons = formContainer.querySelectorAll('.add-date-btn, .remove-date-btn');
    sectionButtons.forEach(btn => {
      if (btn) btn.style.display = '';
    });

    // Ripristina il campo insegnamento se era in modalità read-only
    const multiSelectBox = document.getElementById("insegnamentoBox");
    const dropdownElement = document.getElementById("insegnamentoDropdown");

    if (multiSelectBox && multiSelectBox.classList.contains('disabled')) {
      multiSelectBox.classList.remove('disabled');
      multiSelectBox.style.pointerEvents = '';
      multiSelectBox.style.opacity = '';
      multiSelectBox.style.color = '';
      multiSelectBox.title = '';
      multiSelectBox.innerHTML = '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
    }

    if (dropdownElement) {
      dropdownElement.style.display = '';
    }

    // Mostra area azioni
    const formActions = formContainer.querySelector('.form-actions');
    if (formActions) formActions.style.display = '';
  }

  // API pubblica (aggiornata)
  return {
    loadForm,
    showForm,
    hideForm,
    combineTimeValues: combineTimeValuesForAllSections,
    combineTimeValuesForAllSections,
    removeReadOnlyMode,
    reinitializeForm,
    getMode: () => currentFormMode
  };
}());

window.EsameForm = EsameForm;

// Funzioni globali per compatibilità
window.removeDateSection = function(sectionId) {
  EsameAppelli.removeDateSection(sectionId);
};