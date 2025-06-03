// Utilità comuni per la gestione dei form
const FormUtils = (function() {
  
  // Funzione unificata per impostare valori degli elementi
  function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value;
    }
  }

  // Funzione unificata per radio buttons
  function setRadioValue(name, value) {
    const radio = document.getElementById(`${name.replace('_radio', '')}${value}`);
    if (radio) radio.checked = true;
  }

  // Funzione unificata per checkbox
  function setCheckboxValue(id, value) {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = value === true || value === 'true';
    }
  }

  // Funzione helper per gestire la visualizzazione dei messaggi di errore
  function showValidationError(message) {
    if (window.showMessage) {
      window.showMessage(message, "Errore di validazione", "error");
    }
  }

  // Funzione helper per mostrare messaggi di successo/operazione completata
  function showOperationMessage(message, title, type, options = {}) {
    if (window.showMessage) {
      window.showMessage(message, title, type, options);
    }
  }

  // Funzione unificata per la validazione
  function validateFormField(field, value, validationRules) {
    const rule = validationRules[field];
    if (!rule) return { isValid: true };
    
    if (rule.required && (!value || value.trim() === '')) {
      return { isValid: false, message: rule.requiredMessage || `${field} è obbligatorio` };
    }
    
    if (rule.validator && !rule.validator(value)) {
      return { isValid: false, message: rule.invalidMessage || `${field} non è valido` };
    }
    
    return { isValid: true };
  }

  // Validatori comuni
  const validators = {
    oraAppello: function(ora) {
      if (!ora) return false;
      const [hours, minutes] = ora.split(":").map(Number);
      return hours >= 8 && hours <= 23;
    },
    
    durataEsame: function(durataMinuti) {
      if (!durataMinuti) return false;
      const durata = parseInt(durataMinuti, 10);
      return durata >= 30 && durata <= 720; // min 30 minuti, max 12 ore (720 minuti)
    },
    
    giornoSettimana: function(data) {
      const giorno = new Date(data).getDay();
      return giorno !== 0 && giorno !== 6; // 0 = domenica, 6 = sabato
    }
  };

  // Regole di validazione comuni
  function getCommonValidationRules() {
    return {
      ora_appello: {
        required: true,
        validator: validators.oraAppello,
        requiredMessage: "L'ora dell'appello è obbligatoria",
        invalidMessage: "L'ora dell'appello deve essere compresa tra le 08:00 e le 23:00"
      },
      durata_esame: {
        required: true,
        validator: validators.durataEsame,
        requiredMessage: "La durata dell'esame è obbligatoria",
        invalidMessage: "La durata dell'esame deve essere di almeno 30 minuti e non superiore a 720 minuti (12 ore)"
      },
      giorno_settimana: {
        required: true,
        validator: validators.giornoSettimana,
        requiredMessage: "La data dell'appello è obbligatoria",
        invalidMessage: "Non è possibile inserire esami di sabato o domenica"
      }
    };
  }

  // Gestore unificato degli event listener
  function setupEventListeners(eventListeners) {
    eventListeners.forEach(({ id, event, handler }) => {
      const element = document.getElementById(id);
      if (element) {
        element.removeEventListener(event, handler); // Rimuovi listener esistenti
        element.addEventListener(event, handler);
      }
    });
  }

  // Helper per impostare la durata da minuti
  function setDurationFromMinutes(durataMinuti) {
    const durata = parseInt(durataMinuti);
    if (!isNaN(durata)) {
      const ore = Math.floor(durata / 60);
      const minuti = durata % 60;
      
      const durataH = document.getElementById("durata_h");
      const durataM = document.getElementById("durata_m");
      const durataField = document.getElementById("durata");
      
      if (durataH) durataH.value = ore.toString();
      if (durataM) durataM.value = minuti.toString().padStart(2, '0');
      if (durataField) durataField.value = durata.toString();
    }
  }

  // Helper per combinare valori di ora e durata
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

  // Gestione preferenze (generica per tutti i form)
  function saveFormPreference(username, formType, preferenceName, preferences) {
    return fetch('/api/salvaPreferenzaForm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        form_type: formType,
        name: preferenceName,
        preferences: preferences
      })
    })
    .then(response => response.json());
  }

  function loadFormPreferences(username, formType) {
    return fetch(`/api/getPreferenzeForm?username=${encodeURIComponent(username)}&form_type=${formType}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Errore nella risposta del server: ${response.status}`);
        }
        return response.json();
      });
  }

  function deleteFormPreference(username, id) {
    return fetch('/api/eliminaPreferenzaForm', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        id: id
      })
    })
    .then(response => response.json());
  }

  function resetForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
      form.reset();
    }
  }

  // Gestione date e ora comuni
  function parseTimeString(timeString) {
    if (!timeString || !timeString.includes(':')) return null;
    const [hours, minutes] = timeString.split(':').map(val => val.padStart(2, '0'));
    return { hours, minutes };
  }

  function formatTimeFromHourMinute(hours, minutes) {
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }

  // Validazione date comuni
  function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  function isWeekday(dateString) {
    const date = new Date(dateString);
    const day = date.getDay();
    return day !== 0 && day !== 6; // 0 = domenica, 6 = sabato
  }

  // Gestione aule comuni
  function loadAuleForDateTime(data, periodo) {
    return fetch(`/api/getAule?data=${data}&periodo=${periodo}`)
      .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`));
  }

  function populateAulaSelect(selectElement, aule, includeStudioDocente = true) {
    if (!selectElement) return;

    selectElement.innerHTML = '<option value="" disabled selected hidden>Scegli l\'aula</option>';
    
    const studioDocenteNome = "Studio docente DMI";
    let studioDocentePresente = aule.some(aula => aula.nome === studioDocenteNome);
    
    if (includeStudioDocente && !studioDocentePresente) {
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
      
      selectElement.appendChild(option);
    });
  }

  // Gestione permessi utente
  async function checkUserPermissions() {
    try {
      const data = await getUserData();
      return {
        isAuthenticated: data.authenticated,
        isAdmin: data.authenticated && data.user_data && data.user_data.permessi_admin,
        username: data.user_data?.username
      };
    } catch (error) {
      console.error("Errore nel controllo dei permessi:", error);
      return { isAuthenticated: false, isAdmin: false, username: null };
    }
  }


  // API pubblica
  return {
    setElementValue,
    setRadioValue,
    setCheckboxValue,
    showValidationError,
    showOperationMessage,
    validateFormField,
    validators,
    getCommonValidationRules,
    setupEventListeners,
    setDurationFromMinutes,
    combineTimeValues,
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
  };
}());

// Esportazione globale
window.FormUtils = FormUtils;