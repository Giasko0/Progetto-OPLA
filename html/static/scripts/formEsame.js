// Script semplificato per la gestione del form di inserimento esame
const EsameForm = (function() {
  // Verifica dipendenze aggiornate
  if (!window.FormEsameData) {
    throw new Error('FormEsameData non è caricato. Assicurati che formEsameData.js sia incluso prima di formEsame.js');
  }
  if (!window.FormEsameControlli) {
    throw new Error('FormEsameControlli non è caricato. Assicurati che formEsameControlli.js sia incluso prima di formEsame.js');
  }

  let formContainer = null;
  let currentUsername = null;
  let isEditMode = false;

  // Carica il form HTML dinamicamente
  async function loadForm() {
    formContainer = document.getElementById('form-container');
    if (!formContainer) {
      throw new Error('Elemento form-container non trovato');
    }
    
    // Se il contenuto è già stato caricato, non ricaricarlo
    if (formContainer.querySelector('#formEsame')) {
      return formContainer;
    }
    
    const formContent = document.getElementById('form-esame-content');
    if (!formContent) {
      throw new Error('Elemento form-esame-content non trovato');
    }
    
    formContainer.innerHTML = formContent.innerHTML;
    formContainer.classList.add('side-form', 'form-content-area');
    
    // Inizializza il listener di chiusura
    const closeBtn = formContainer.querySelector("#closeOverlay");
    if (closeBtn) {
      closeBtn.addEventListener("click", hideForm);
    }
    
    return formContainer;
  }
  
  // Mostra il form di inserimento esame
  async function showForm(data = {}, isEdit = false) {
    await loadForm();
    
    const isAlreadyOpen = formContainer.style.display === 'block';
    
    // Mostra il form container
    formContainer.style.display = 'block';
    formContainer.classList.add('active');
    
    const calendar = document.getElementById('calendar');
    if (calendar) calendar.classList.add('form-visible');
    
    isEditMode = isEdit;
    
    // Reset sezioni solo se necessario
    if (!isEdit && !isAlreadyOpen && window.EsameAppelli) {
      window.EsameAppelli.resetSections();
    }
    
    // Configura form
    const formTitle = formContainer.querySelector(".form-header h2");
    const esameForm = formContainer.querySelector("#formEsame");
    
    if (formTitle) formTitle.textContent = isEdit ? "Modifica Esame" : "Aggiungi Esame";
    
    const idField = formContainer.querySelector("#examIdField");
    if (idField) idField.value = isEdit && data.id ? data.id : "";
    
    // Reset form se necessario
    const existingSections = formContainer.querySelectorAll('.date-appello-section');
    const hasExistingData = Array.from(existingSections).some(section => {
      const inputs = section.querySelectorAll('input, select, textarea');
      return Array.from(inputs).some(input => {
        if (input.type === 'checkbox' || input.type === 'radio') return input.checked;
        return input.value && input.value.trim() !== '';
      });
    });
    
    if (isEdit || (!hasExistingData && !isAlreadyOpen)) {
      if (esameForm) esameForm.reset();
    }
    
    // Configura pulsanti
    await setupButtons(isEdit, data.id);
    
    // Inizializza UI se necessario
    if (!isAlreadyOpen || isEdit) {
      initUI(data);
      setupEventListeners();
    }
    
    // Compila form
    if (isEdit) {
      window.FormEsameData.fillFormWithExamData(null, data);
    } else if (!isAlreadyOpen && !hasExistingData && window.FormEsameAutosave) {
      setTimeout(() => window.FormEsameAutosave.loadSavedData(), 100);
    }
    
    // Carica preferenze utente
    if (!hasExistingData && !isAlreadyOpen) {
      loadUserPreferences();
    }
    
    updateDynamicFields();
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
    }, 10);
  }
  
  // Inizializza dati utente
  function initUserData() {
    getUserData()
      .then((data) => {
        if (data?.authenticated && data?.user_data) {
          const field = document.getElementById("docente");
          if (field) {
            field.value = data.user_data.username;
            currentUsername = data.user_data.username;
            
            // Inizializza multi-select insegnamenti
            if (window.InsegnamentiManager) {
              initInsegnamenti();
            }
          }
        }
      })
      .catch((error) => console.error("Errore nel recupero dei dati utente:", error));
    
    window.updatePageTitle?.();
    checkPreselectedInsegnamenti();
  }

  // Inizializza gestione insegnamenti
  function initInsegnamenti() {
    const boxElement = document.getElementById("insegnamentoBox");
    const dropdownElement = document.getElementById("insegnamentoDropdown");
    const optionsElement = document.getElementById("insegnamentoOptions");
    
    if (boxElement && dropdownElement && optionsElement) {
      window.InsegnamentiManager.cleanup();
      window.InsegnamentiManager.initUI("insegnamentoBox", "insegnamentoDropdown", "insegnamentoOptions", currentUsername);
      
      window.InsegnamentiManager.onChange(() => {
        const multiSelectBox = document.getElementById("insegnamentoBox");
        if (multiSelectBox) {
          window.InsegnamentiManager.syncUI(multiSelectBox);
        }
      });
    }
  }

  // Carica preferenze utente
  function loadUserPreferences() {
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
  
  // Configura event listeners
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
    const tipoAppelloPP = document.getElementById("tipoAppelloPP");
    const verbalizzazioneSelect = document.getElementById("verbalizzazione");

    if (!tipoAppelloPP || !verbalizzazioneSelect) return;

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
    
    if (!preselectedParam || !currentUsername || !window.InsegnamentiManager) return;
    
    const preselectedCodes = preselectedParam.split(",");
    
    window.InsegnamentiManager.loadInsegnamenti(
      currentUsername, 
      { filter: preselectedCodes },
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
    if (!formActions) return;

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
          if (window.deleteEsame) window.deleteEsame(examId);
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
    if (!formContainer) return;

    if (clearAutosave && window.FormEsameAutosave) {
      window.FormEsameAutosave.clearSavedData();
    }
    
    formContainer.classList.remove('active', 'form-content-area');
    setTimeout(() => formContainer.style.display = 'none', 300);
    
    const calendarEl = document.getElementById('calendar');
    if (calendarEl) calendarEl.classList.remove('form-visible');
    
    if (cleanupProvisional) {
      const dropdown = document.getElementById('insegnamentoDropdown');
      if (dropdown) dropdown.style.display = 'none';
      
      if (window.InsegnamentiManager?.cleanup) {
        window.InsegnamentiManager.cleanup();
      }

      if (window.clearCalendarProvisionalEvents) {
        window.clearCalendarProvisionalEvents();
      }
      
      if (window.EsameAppelli?.resetSections) {
        window.EsameAppelli.resetSections();
      }
              
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

// Aggiungi un listener per l'evento DOMContentLoaded per assicurarti che 
// gli elementi del form siano pronti quando vengono caricati dinamicamente
document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('formEsame');
  // Se il form è stato già caricato nella pagina, configura i gestori
  if (form) {
    EsameForm.setupTimeCombiningHandlers();
  }
});