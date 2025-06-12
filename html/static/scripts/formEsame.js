// Script semplificato per la gestione del form di inserimento esame
const EsameForm = (function() {
  let formContainer = null;
  let currentUsername = null;
  let isEditMode = false;

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
    
    formContainer.style.display = 'block';
    formContainer.classList.add('active');
    
    const calendar = document.getElementById('calendar');
    calendar.classList.add('form-visible');
    
    isEditMode = isEdit;
    
    const examIdField = formContainer.querySelector("#examIdField");
    examIdField.value = isEdit && data.id ? data.id : "";

    if (isEdit) {
      try {
        await window.EditEsame.editExam(data.id);
        // EditEsame.editExam chiama setupEditMode che imposta titolo e pulsanti.
        // I listener per i pulsanti di modifica sono in EditEsame.setupEditButtons.
      } catch (error) {
        console.error("Errore nell'impostazione della modalità modifica:", error);
        hideForm(true, true); // Nasconde il form e pulisce in caso di errore grave
        return false;
      }
    } else {
      // Modalità Creazione
      const formTitle = formContainer.querySelector(".form-header h2");
      formTitle.textContent = "Aggiungi Esame";
      const esameForm = formContainer.querySelector("#formEsame");

      // Reset e inizializzazione solo se il form non era già aperto per una nuova creazione
      // o se stiamo aprendo per la prima volta.
      if (!isAlreadyOpen || (isAlreadyOpen && !esameForm.dataset.creationInProgress) ) {
        esameForm.reset();
        window.EsameAppelli.resetSections();
        initUI(data); // data è per precompilazione da calendario
        loadUserPreferences();
        setTimeout(() => {
          if (window.FormEsameAutosave && !window.FormEsameAutosave.loadSavedData()) {
            // Se non ci sono dati salvati, assicurati che i default siano applicati
            // (es. checkbox 'mostra nel calendario' per la prima sezione)
            const firstSection = document.querySelector('.date-appello-section');
            if (firstSection) {
                const counter = firstSection.id.split('_')[1] || '1';
                const checkbox = firstSection.querySelector(`#mostra_nel_calendario_${counter}`);
                if (checkbox && !checkbox.checked) checkbox.checked = true;
            }
          }
        }, 150);
        esameForm.dataset.creationInProgress = "true";
      } else if (isAlreadyOpen && esameForm.dataset.creationInProgress === "true") {
        // Form già aperto per creazione, l'utente ha cliccato di nuovo "Aggiungi esame"
        // Potrebbe voler resettare o semplicemente continuare. Per ora, resettiamo.
        esameForm.reset();
        window.EsameAppelli.resetSections();
        initUI(data); 
        loadUserPreferences();
        setTimeout(() => window.FormEsameAutosave.loadSavedData(), 150);
      }
      
      await setupButtons(false, null); // Configura pulsanti per la creazione
      setupEventListeners(); // Configura listener per la creazione (submit standard, bypass creazione)
    }
    
    // Listener comuni (chiusura, preferenze)
    // Assicurarsi che siano attaccati una sola volta o riattaccati correttamente.
    const closeBtn = formContainer.querySelector("#closeOverlay");
    if (closeBtn) {
      closeBtn.removeEventListener("click", hideForm);
      closeBtn.addEventListener("click", hideForm);
    }

    const savePrefBtn = document.getElementById("savePreferenceBtn");
    if (savePrefBtn) {
      savePrefBtn.removeEventListener("click", window.EsamePreferenze.toggleSavePreferenceForm);
      savePrefBtn.addEventListener("click", window.EsamePreferenze.toggleSavePreferenceForm);
    }
    const loadPrefBtn = document.getElementById("loadPreferenceBtn");
    if (loadPrefBtn) {
      loadPrefBtn.removeEventListener("click", window.EsamePreferenze.togglePreferencesMenu);
      loadPrefBtn.addEventListener("click", window.EsamePreferenze.togglePreferencesMenu);
    }
    const confirmSavePrefBtn = document.getElementById("confirmSavePreference");
    if (confirmSavePrefBtn) {
      confirmSavePrefBtn.removeEventListener("click", window.EsamePreferenze.handleSavePreference);
      confirmSavePrefBtn.addEventListener("click", window.EsamePreferenze.handleSavePreference);
    }
    const cancelSavePrefBtn = document.getElementById("cancelSavePreference");
    if (cancelSavePrefBtn) {
      cancelSavePrefBtn.removeEventListener("click", window.EsamePreferenze.toggleSavePreferenceForm);
      cancelSavePrefBtn.addEventListener("click", window.EsamePreferenze.toggleSavePreferenceForm);
    }
    
    console.log('>>> FORM: showForm completato');
    return true;
  }
  
  // Inizializza l'interfaccia utente del form
  function initUI(options = {}) {
    setTimeout(() => {
      window.EsameAppelli.initializeDateSections();
      
      const existingSections = document.querySelectorAll('.date-appello-section');
      
      if (existingSections.length === 0 && !options.date) {
        window.EsameAppelli.addDateSection();
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
    getUserData()
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
    getUserData()
      .then(data => {
        currentUsername = data.user_data.username;
        window.EsamePreferenze.setCurrentUsername(currentUsername);
        window.EsamePreferenze.loadUserPreferences();
      })
      .catch(error => console.error("Errore dati utente:", error));
  }
  
  // Configura event listeners
  function setupEventListeners() {
    const eventListeners = [
      { id: "formEsame", event: "submit", handler: handleFormSubmit },
      { id: "savePreferenceBtn", event: "click", handler: window.EsamePreferenze.toggleSavePreferenceForm },
      { id: "loadPreferenceBtn", event: "click", handler: window.EsamePreferenze.togglePreferencesMenu },
      { id: "confirmSavePreference", event: "click", handler: window.EsamePreferenze.handleSavePreference },
      { id: "cancelSavePreference", event: "click", handler: window.EsamePreferenze.toggleSavePreferenceForm },
      { id: "closeOverlay", event: "click", handler: hideForm }
    ];

    eventListeners.forEach(({ id, event, handler }) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener(event, handler);
        element.addEventListener(event, handler);
      }
    });

    // Radio buttons tipo appello
    document.querySelectorAll('input[name="tipo_appello_radio"]').forEach(radio => {
      radio.removeEventListener("change", aggiornaVerbalizzazione);
      radio.addEventListener("change", aggiornaVerbalizzazione);
    });

    // Pulsante bypass per admin
    window.FormEsameControlli.isUserAdmin().then(isAdmin => {
      const bypassChecksBtn = document.getElementById("bypassChecksBtn");
      if (bypassChecksBtn && isAdmin) {
        bypassChecksBtn.style.display = "block";
        bypassChecksBtn.removeEventListener("click", handleBypassChecksSubmit);
        bypassChecksBtn.addEventListener("click", handleBypassChecksSubmit);
      }
    });
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
    document.querySelectorAll('.date-appello-section').forEach((section, index) => {
      const ora_h = section.querySelector(`[id^="ora_h_"]`)?.value;
      const ora_m = section.querySelector(`[id^="ora_m_"]`)?.value;
      
      if (ora_h && ora_m) {
        const oraField = section.querySelector(`[id^="ora_"][type="hidden"]`);
        if (oraField) oraField.value = `${ora_h}:${ora_m}`;
      }
      
      const durata_h = parseInt(section.querySelector(`[id^="durata_h_"]`)?.value) || 0;
      const durata_m = parseInt(section.querySelector(`[id^="durata_m_"]`)?.value) || 0;
      const durata_totale = (durata_h * 60) + durata_m;
      
      const durataField = section.querySelector(`[id^="durata_"][type="hidden"]`);
      if (durataField) durataField.value = durata_totale.toString();
    });
  }

  // Configura pulsanti del form
  async function setupButtons(isEdit, examId) {
    const formActions = document.querySelector('.form-actions');
    formActions.innerHTML = '';
    const isAdmin = await window.FormEsameControlli.isUserAdmin();

    if (isEdit) {
      // Pulsanti modalità modifica
      const modifyBtn = document.createElement("button");
      modifyBtn.type = "submit";
      modifyBtn.className = "form-button";
      modifyBtn.textContent = "Modifica";
      formActions.appendChild(modifyBtn);

      if (isAdmin) {
        const bypassBtn = document.createElement("button");
        bypassBtn.type = "button";
        bypassBtn.id = "bypassChecksBtn";
        bypassBtn.className = "form-button bypass";
        bypassBtn.textContent = "Modifica senza controlli";
        bypassBtn.addEventListener("click", handleBypassChecksSubmit);
        formActions.appendChild(bypassBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.id = "deleteExamBtn";
      deleteBtn.type = "button";
      deleteBtn.className = "form-button danger";
      deleteBtn.textContent = "Elimina Esame";
      deleteBtn.onclick = () => {
        if (confirm("Sei sicuro di voler eliminare questo esame?")) {
          window.deleteEsame(examId);
        }
      };
      formActions.appendChild(deleteBtn);
    } else {
      // Pulsanti modalità creazione
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.className = "form-button";
      submitBtn.textContent = "Inserisci";
      formActions.appendChild(submitBtn);

      if (isAdmin) {
        const bypassBtn = document.createElement("button");
        bypassBtn.type = "button";
        bypassBtn.id = "bypassChecksBtn";
        bypassBtn.className = "invia bypass";
        bypassBtn.textContent = "Inserisci senza controlli";
        bypassBtn.addEventListener("click", handleBypassChecksSubmit);
        formActions.appendChild(bypassBtn);
      }
    }
  }

  // Gestisce invio form con bypass
  function handleBypassChecksSubmit() {
    window.FormEsameControlli.isUserAdmin().then(isAdmin => {
      if (!isAdmin) {
        window.FormEsameControlli.showValidationError("Solo gli amministratori possono utilizzare questa funzione");
        return;
      }
      
      if (!window.FormEsameControlli.validateFormWithBypass()) return;
      
      combineTimeValuesForAllSections();
      window.FormEsameData.submitFormData({ bypassChecks: true, isEdit: isEditMode });
    });
  }

  // Gestisce invio standard del form
  function handleFormSubmit(e) {
    e.preventDefault();
    combineTimeValuesForAllSections();

    if (!window.FormEsameControlli.validateForm()) return;

    window.FormEsameData.submitFormData({ isEdit: isEditMode });
  }

  // Aggiorna campi dinamici del form
  function updateDynamicFields() {
    aggiornaVerbalizzazione();
  }

  // Nasconde il form
  function hideForm(cleanupProvisional = false, clearAutosave = false) {
    if (clearAutosave && window.FormEsameAutosave) {
      window.FormEsameAutosave.clearSavedData();
    }
    
    const esameForm = formContainer.querySelector("#formEsame");
    if(esameForm) delete esameForm.dataset.creationInProgress;

    formContainer.classList.remove('active', 'form-content-area');
    setTimeout(() => formContainer.style.display = 'none', 300);
    
    const calendarEl = document.getElementById('calendar');
    calendarEl.classList.remove('form-visible');
    
    if (cleanupProvisional) {
      const dropdown = document.getElementById('insegnamentoDropdown');
      dropdown.style.display = 'none';
      
      window.InsegnamentiManager.cleanup();

      if (window.clearCalendarProvisionalEvents) {
        window.clearCalendarProvisionalEvents();
      }
      
      window.EsameAppelli.resetSections();
              
      if (window.forceCalendarRefresh) {
        window.forceCalendarRefresh();
      }
    }
  }

  // API pubblica
  return {
    loadForm,
    showForm,
    hideForm,
    combineTimeValues: combineTimeValuesForAllSections,
    combineTimeValuesForAllSections
  };
}());

window.EsameForm = EsameForm;

// Funzioni globali per compatibilità
window.removeDateSection = function(sectionId) {
  EsameAppelli.removeDateSection(sectionId);
};