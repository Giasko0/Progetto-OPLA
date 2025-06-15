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
    
    return true;
  }

  // Gestione modalità modifica
  async function handleEditMode(examId) {
    try {
      await window.EditEsame.editExam(examId);
    } catch (error) {
      hideForm(true, true);
      throw error;
    }
  }

  // Gestione modalità creazione
  async function handleCreationMode(data, isAlreadyOpen) {
    const formTitle = formContainer.querySelector(".form-header h2");
    formTitle.textContent = "Aggiungi Esame";
    const esameForm = formContainer.querySelector("#formEsame");

    // Reset se necessario
    if (!isAlreadyOpen || !esameForm.dataset.creationInProgress) {
      esameForm.reset();
      window.EsameAppelli.resetSections();
      initUI(data);
      loadUserPreferences();
      
      setTimeout(() => {
        if (!window.FormEsameAutosave?.loadSavedData()) {
          setDefaultCheckboxes();
        }
      }, 150);
      
      esameForm.dataset.creationInProgress = "true";
    } else {
      // Reset per nuovo esame
      esameForm.reset();
      window.EsameAppelli.resetSections();
      initUI(data);
      loadUserPreferences();
      setTimeout(() => window.FormEsameAutosave?.loadSavedData(), 150);
    }
    
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
    const listeners = [
      { id: "closeOverlay", handler: hideForm },
      { id: "savePreferenceBtn", handler: window.EsamePreferenze?.toggleSavePreferenceForm },
      { id: "loadPreferenceBtn", handler: window.EsamePreferenze?.togglePreferencesMenu },
      { id: "confirmSavePreference", handler: window.EsamePreferenze?.handleSavePreference },
      { id: "cancelSavePreference", handler: window.EsamePreferenze?.toggleSavePreferenceForm }
    ];

    listeners.forEach(({ id, handler }) => {
      const element = document.getElementById(id);
      if (element && handler) {
        element.removeEventListener("click", handler);
        element.addEventListener("click", handler);
      }
    });
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
      { id: "formEsame", event: "submit", handler: handleFormSubmit }
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
    setupBypassButton();
  }

  // Setup pulsante bypass
  function setupBypassButton() {
    window.FormEsameControlli?.isUserAdmin().then(isAdmin => {
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
    const isAdmin = await window.FormEsameControlli?.isUserAdmin();

    const buttons = isEdit ? getEditButtons(examId, isAdmin) : getCreationButtons(isAdmin);
    
    buttons.forEach(button => {
      formActions.appendChild(button);
    });
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
        window.FormEsameControlli?.showValidationError("Solo gli amministratori possono utilizzare questa funzione");
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
    if (clearAutosave) {
      window.FormEsameAutosave?.clearSavedData();
    }
    
    const esameForm = formContainer.querySelector("#formEsame");
    if (esameForm) {
      delete esameForm.dataset.creationInProgress;
    }

    formContainer.classList.remove('active', 'form-content-area');
    setTimeout(() => formContainer.style.display = 'none', 300);
    
    document.getElementById('calendar').classList.remove('form-visible');
    
    if (cleanupProvisional) {
      // Cleanup completo
      document.getElementById('insegnamentoDropdown').style.display = 'none';
      window.InsegnamentiManager?.cleanup();
      window.clearCalendarProvisionalEvents?.();
      window.EsameAppelli?.resetSections();
      window.forceCalendarRefresh?.();
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