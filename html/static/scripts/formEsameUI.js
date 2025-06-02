// Script per la gestione dell'interfaccia utente del form esame
const FormEsameUI = (function() {
  // Verifica che FormEsameUtils sia caricato
  if (!window.FormEsameUtils) {
    throw new Error('FormEsameUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameUI.js');
  }

  // Importa utilità da FormEsameUtils
  const {
    loadHTMLTemplate,
    processHTMLTemplate,
    showValidationError,
    showOperationMessage,
    createConfirmationDialog,
    resetForm,
    getUserData,
    checkUserPermissions
  } = window.FormEsameUtils;

  // Stato locale del modulo
  let formContainer = null;
  let currentUsername = null;
  let isEditMode = false;
  let formLoaded = false;

  // Carica il form HTML dal template
  async function loadForm() {
    if (formLoaded) {
      console.log('Form già caricato');
      return;
    }

    try {
      const formHTML = await loadHTMLTemplate('/static/formEsameAppello.html');
      
      formContainer = document.getElementById('form-esame-container');
      if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'form-esame-container';
        formContainer.className = 'form-overlay';
        formContainer.style.display = 'none';
        document.body.appendChild(formContainer);
      }
      
      formContainer.innerHTML = formHTML;
      formLoaded = true;
      
      // Inizializza UI dopo il caricamento
      await initUI();
      
    } catch (error) {
      console.error('Errore nel caricamento del form:', error);
      showValidationError('Errore nel caricamento del form');
    }
  }

  // Mostra il form con i dati specificati
  async function showForm(data = {}, isEdit = false) {
    if (!formLoaded) {
      await loadForm();
    }

    if (!formContainer) {
      console.error('Form container non trovato');
      return;
    }

    isEditMode = isEdit;
    
    // Aggiorna il titolo del form
    updateFormTitle(isEdit);
    
    // Mostra il form
    formContainer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Inizializza le sezioni degli appelli
    window.FormEsameAppelli.initializeDateSections();
    
    // Compila il form con i dati se forniti
    if (Object.keys(data).length > 0) {
      if (isEdit) {
        window.FormEsameData.fillFormWithExamData(document.getElementById('formEsame'), data);
      } else {
        window.FormEsameData.fillFormWithPartialData(document.getElementById('formEsame'), data);
      }
    }

    // Controlla insegnamenti preselezionati
    checkPreselectedInsegnamenti();

    // Setup handlers per combinazione tempo
    window.FormEsameControlli.setupTimeCombiningHandlers();
  }

  // Nasconde il form
  function hideForm(cleanupProvisional = false) {
    if (formContainer) {
      formContainer.style.display = 'none';
      document.body.style.overflow = '';
    }

    if (cleanupProvisional) {
      const calendar = window.calendar;
      window.FormEsameUtils.clearAllProvisionalEvents(calendar, window.provisionalEvents);
    }

    // Reset del form
    const form = document.getElementById('formEsame');
    if (form) {
      resetForm('formEsame');
    }

    isEditMode = false;
  }

  // Pulisce e nasconde il form con conferma
  function cleanupAndHideForm() {
    createConfirmationDialog({
      title: 'Conferma chiusura',
      content: 'Sei sicuro di voler chiudere il form? Tutti i dati non salvati andranno persi.',
      confirmText: 'Chiudi',
      cancelText: 'Annulla',
      onConfirm: () => hideForm(true)
    });
  }

  // Inizializza l'interfaccia utente
  async function initUI() {
    try {
      const userData = await getUserData();
      if (userData.authenticated && userData.user_data) {
        currentUsername = userData.user_data.username;
      }

      // Setup event listeners
      setupEventListeners();
      
      // Setup pulsanti
      setupButtons();
      
      // Setup bypass button per admin
      setupBypassButton();

      // Inizializza altri elementi UI
      initUIRest();
      
    } catch (error) {
      console.error('Errore nell\'inizializzazione UI:', error);
    }
  }

  // Inizializza il resto dell'UI
  function initUIRest() {
    // Gestione chiusura form
    const closeBtn = document.querySelector('.form-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', cleanupAndHideForm);
    }

    // Gestione click su overlay
    if (formContainer) {
      formContainer.addEventListener('click', (e) => {
        if (e.target === formContainer) {
          cleanupAndHideForm();
        }
      });
    }

    // Gestione tipo appello (radio buttons)
    const tipoAppelloRadios = document.querySelectorAll('input[name="tipo_appello_radio"]');
    tipoAppelloRadios.forEach(radio => {
      radio.addEventListener('change', updateVerbalizzazione);
    });

    // Setup per sezioni multiple
    const addDateBtn = document.getElementById('addDateBtn');
    addDateBtn.addEventListener('click', () => {
      window.FormEsameAppelli.addDateSection();
    });
  }

  // Setup event listeners principali
  function setupEventListeners() {
    const form = document.getElementById('formEsame');
    form.addEventListener('submit', window.FormEsameControlli.handleFormSubmit);

    // Gestione ESC per chiudere il form
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && formContainer && formContainer.style.display === 'flex') {
        cleanupAndHideForm();
      }
    });
  }

  // Setup pulsanti principali
  function setupButtons() {
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const form = document.getElementById('formEsame');
        window.FormEsameControlli.handleFormSubmit(e);
      });
    }

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', cleanupAndHideForm);
    }
  }

  // Setup pulsante bypass per amministratori
  async function setupBypassButton() {
    const bypassBtn = document.getElementById('bypassChecksBtn');
    if (!bypassBtn) return;

    try {
      const permissions = await checkUserPermissions();
      if (permissions.isAdmin) {
        bypassBtn.style.display = 'block';
        bypassBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.FormEsameControlli.handleBypassChecksSubmit();
        });
      } else {
        bypassBtn.style.display = 'none';
      }
    } catch (error) {
      console.error('Errore nel setup del pulsante bypass:', error);
      bypassBtn.style.display = 'none';
    }
  }

  // Setup pulsante eliminazione per eventi provvisori
  function setupProvisionalDeleteButton() {
    const deleteBtn = document.getElementById('deleteProvisionalBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', handleDeleteProvisional);
    }
  }

  // Gestisce l'eliminazione di eventi provvisori
  function handleDeleteProvisional() {
    window.FormEsameUtils.clearAllProvisionalEvents(window.calendar, window.provisionalEvents);
    hideForm(false);
  }

  // Aggiorna campi dinamici in base ai dati
  function updateDynamicFields(data) {
    // Aggiorna campi che dipendono da altri valori
    if (data.docente && window.InsegnamentiManager) {
      const docenteField = document.getElementById('docente');
      if (docenteField) {
        docenteField.value = data.docente;
        
        // Carica insegnamenti per il docente
        const multiSelectBox = document.getElementById("insegnamentoBox");
        if (multiSelectBox) {
          window.InsegnamentiManager.loadInsegnamenti(data.docente, {}, (insegnamenti) => {
            if (data.insegnamento_codice) {
              window.FormEsameData.handleInsegnamentoSelection(data);
            }
          });
        }
      }
    }
  }

  // Utilità per mostrare/nascondere elementi UI
  function toggleUIElement(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
      element.style.display = show ? 'block' : 'none';
    }
  }

  // Aggiorna il titolo del form
  function updateFormTitle(isEdit) {
    const titleElement = document.querySelector('.form-panel h2');
    if (titleElement) {
      titleElement.textContent = isEdit ? 'Modifica Esame' : 'Nuovo Esame';
    }
  }

  // Evidenzia un elemento (per feedback visivo)
  function highlightElement(elementId, className = 'highlight') {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.add(className);
      setTimeout(() => {
        element.classList.remove(className);
      }, 2000);
    }
  }

  // Aggiorna il campo verbalizzazione
  function updateVerbalizzazione() {
    window.FormEsameControlli.aggiornaVerbalizzazione();
  }

  // Controlla insegnamenti preselezionati dall'URL  
  function checkPreselectedInsegnamenti() {
    window.FormEsameData.checkPreselectedInsegnamenti();
  }

  // Getters per lo stato del modulo
  function getFormContainer() {
    return formContainer;
  }

  function getCurrentUsername() {
    return currentUsername;
  }

  function getIsEditMode() {
    return isEditMode;
  }

  // Interfaccia pubblica
  return {
    loadForm,
    showForm,
    hideForm,
    cleanupAndHideForm,
    initUI,
    initUIRest,
    setupEventListeners,
    setupBypassButton,
    setupButtons,
    setupProvisionalDeleteButton,
    handleDeleteProvisional,
    updateDynamicFields,
    toggleUIElement,
    updateFormTitle,
    highlightElement,
    updateVerbalizzazione,
    checkPreselectedInsegnamenti,
    // Getters
    getFormContainer,
    getCurrentUsername,
    getIsEditMode
  };
}());

// Esportazione globale
window.FormEsameUI = FormEsameUI;