// Script per la gestione delle preferenze del form esame
const EsamePreferenze = (function() {
  // Verifica che FormEsameUtils sia caricato
  if (!window.FormEsameUtils) {
    throw new Error('FormEsameUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsamePreferenze.js');
  }

  // Importa utilità da FormEsameUtils
  const {
    setElementValue,
    setCheckboxValue,
    showValidationError,
    showOperationMessage,
    setDurationFromMinutes,
    saveFormPreference,
    loadFormPreferences,
    deleteFormPreference
  } = window.FormEsameUtils;

  let currentUsername = null;
  let userPreferences = [];

  // Funzioni per invio messaggi alla sidebar
  const showError = (message) => window.showMessage(message, 'Errore', 'error');
  const showSuccess = (message) => window.showMessage(message, 'Successo', 'success');
  const showWarning = (message) => window.showMessage(message, 'Attenzione', 'warning');

  // Carica le preferenze dell'utente
  function loadUserPreferences() {
    if (!currentUsername || !window.FormEsameUtils) return Promise.resolve([]);
    
    return window.FormEsameUtils.loadFormPreferences(currentUsername, 'esame')
      .then(preferences => {
        userPreferences = preferences || [];
        updatePreferencesMenu();
        return userPreferences;
      })
      .catch(error => {
        console.error('Errore nel caricamento delle preferenze:', error);
        userPreferences = [];
        return [];
      });
  }

  // Salva le preferenze correnti
  function saveCurrentPreference(preferenceName) {
    if (!currentUsername || !preferenceName || !window.FormEsameUtils) {
      showError('Nome preferenza non valido');
      return;
    }

    const formData = collectCurrentFormData();
    if (!formData) {
      showError('Errore nella raccolta dei dati del form');
      return;
    }

    window.FormEsameUtils.saveFormPreference(currentUsername, 'esame', preferenceName, formData)
      .then(response => {
        if (response.success) {
          showSuccess('Preferenza salvata con successo');
          loadUserPreferences(); // Ricarica la lista
          toggleSavePreferenceForm(); // Nascondi il form
        } else {
          showError(response.message || 'Errore nel salvataggio della preferenza');
        }
      })
      .catch(() => showError('Errore nel salvataggio della preferenza'));
  }

  // Applica una preferenza
  function applyPreference(preference) {
    if (!preference || !preference.preferences) {
      showError('Preferenza non valida');
      return;
    }

    const formData = preference.preferences;
    
    // Applica i valori ai campi del form
    Object.entries(formData).forEach(([fieldName, value]) => {
      if (fieldName.includes('durata') && typeof value === 'number') {
        setDurationFromMinutes(value);
      } else if (fieldName.includes('_radio')) {
        // Gestione radio buttons
        const radioValue = value === true ? fieldName.split('_radio')[0] : null;
        if (radioValue) {
          const radio = document.getElementById(radioValue);
          if (radio) radio.checked = true;
        }
      } else if (typeof value === 'boolean') {
        setCheckboxValue(fieldName, value);
      } else {
        setElementValue(fieldName, value);
      }
    });

    // Gestione speciale per sezioni multiple se presenti
    if (formData.sections && Array.isArray(formData.sections)) {
      // Reset sezioni esistenti
      if (window.FormEsameAppelli && window.FormEsameAppelli.reset) {
        window.FormEsameAppelli.reset();
      }
      
      // Ricrea le sezioni
      formData.sections.forEach((sectionData, index) => {
        if (window.FormEsameAppelli && window.FormEsameAppelli.addDateSection) {
          window.FormEsameAppelli.addDateSection(sectionData.dataora || '');
        }
      });
    }

  // Combina i valori per aggiornare il campo nascosto
  window.FormEsameControlli.combineTimeValues();

    // Aggiorna verbalizzazione
    window.FormEsameControlli.aggiornaVerbalizzazione();

    // Aggiorna aule per ogni sezione se presente data e ora
    const dateSections = document.querySelectorAll('.date-appello-section');
    dateSections.forEach(section => {
      const sectionCounter = section.id.split('_')[1];
      const dataInput = document.getElementById(`dataora_${sectionCounter}`);
      const oraHInput = document.getElementById(`ora_h_${sectionCounter}`);
      const oraMInput = document.getElementById(`ora_m_${sectionCounter}`);
      
      if (dataInput && dataInput.value && oraHInput && oraHInput.value && oraMInput && oraMInput.value) {
        window.FormEsameAppelli.updateAuleForSection(sectionCounter);
      }
    });

    showSuccess('Preferenza applicata con successo');
    togglePreferencesMenu();
  }

  // Raccoglie i dati correnti del form
  function collectCurrentFormData() {
    const form = document.getElementById('formEsame');
    if (!form) return null;

    const formData = {};
    
    // Raccoglie tutti i campi input, select, textarea
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.type === 'radio') {
        if (input.checked) {
          formData[input.name] = input.value;
        }
      } else if (input.type === 'checkbox') {
        formData[input.id] = input.checked;
      } else if (input.value) {
        formData[input.id] = input.value;
      }
    });

    // Raccoglie dati delle sezioni multiple se presenti
    formData.sections = window.FormEsameAppelli.collectSectionsData();

    return formData;
  }

  // Aggiorna il menu delle preferenze
  function updatePreferencesMenu() {
    const preferencesMenu = document.getElementById('preferencesMenu');
    if (!preferencesMenu) return;

    const menuContent = preferencesMenu.querySelector('.preferences-menu-content');
    if (!menuContent) return;

    menuContent.innerHTML = '';

    if (!userPreferences || userPreferences.length === 0) {
      menuContent.innerHTML = '<div class="no-preferences">Nessuna preferenza salvata</div>';
      return;
    }

    userPreferences.forEach(preference => {
      const item = document.createElement('div');
      item.className = 'preference-item';
      item.innerHTML = `
        <span class="preference-name">${preference.name}</span>
        <div class="preference-actions">
          <button type="button" class="btn-small apply-btn" onclick="window.EsamePreferenze.applyPreference(${JSON.stringify(preference).replace(/"/g, '&quot;')})">
            Applica
          </button>
          <button type="button" class="btn-small delete-btn" onclick="window.EsamePreferenze.deletePreference(${preference.id})">
            Elimina
          </button>
        </div>
      `;
      menuContent.appendChild(item);
    });
  }

  // Elimina una preferenza
  function deletePreference(id) {
    if (!currentUsername || !window.FormEsameUtils) return;

    if (!confirm('Sei sicuro di voler eliminare questa preferenza?')) return;

    window.FormEsameUtils.deleteFormPreference(currentUsername, id)
      .then(response => {
        if (response.success) {
          showSuccess('Preferenza eliminata con successo');
          loadUserPreferences(); // Ricarica la lista
        } else {
          showError(response.message || 'Errore nell\'eliminazione della preferenza');
        }
      })
      .catch(() => showError('Errore nell\'eliminazione della preferenza'));
  }

  // Mostra/nasconde il form per salvare le preferenze
  function toggleSavePreferenceForm() {
    const form = document.getElementById('savePreferenceForm');
    if (!form) return;

    const isVisible = form.style.display !== 'none';
    form.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      const nameInput = document.getElementById('preferenceNameInput');
      if (nameInput) {
        nameInput.focus();
      }
    }
  }

  // Mostra/nasconde il menu delle preferenze
  function togglePreferencesMenu() {
    const menu = document.getElementById('preferencesMenu');
    if (!menu) return;

    const isVisible = menu.style.display !== 'none';
    menu.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      loadUserPreferences();
    }
  }

  // Inizializza il sistema delle preferenze
  function initPreferences(username) {
    currentUsername = username;
    if (currentUsername) {
      loadUserPreferences();
    }

    // Setup event listeners
    const saveBtn = document.getElementById('savePreferenceBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('preferenceNameInput');
        const preferenceName = nameInput?.value?.trim();
        if (preferenceName) {
          saveCurrentPreference(preferenceName);
          nameInput.value = '';
        } else {
          showError('Inserisci un nome per la preferenza');
        }
      });
    }

    const showPreferencesBtn = document.getElementById('showPreferencesBtn');
    if (showPreferencesBtn) {
      showPreferencesBtn.addEventListener('click', togglePreferencesMenu);
    }

    const showSaveFormBtn = document.getElementById('showSavePreferenceFormBtn');
    if (showSaveFormBtn) {
      showSaveFormBtn.addEventListener('click', toggleSavePreferenceForm);
    }
  }

  // Interfaccia pubblica
  return {
    initPreferences,
    loadUserPreferences,
    saveCurrentPreference,
    applyPreference,
    deletePreference,
    collectCurrentFormData,
    updatePreferencesMenu,
    toggleSavePreferenceForm,
    togglePreferencesMenu,
    // Getters
    getCurrentUsername: () => currentUsername,
    getUserPreferences: () => userPreferences
  };
}());

// Espone il modulo globalmente
window.EsamePreferenze = EsamePreferenze;