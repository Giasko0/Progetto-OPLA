// Script per la gestione delle preferenze del form esame
const EsamePreferenze = (function() {
  // Verifica che FormUtils sia caricato
  if (!window.FormUtils) {
    throw new Error('FormUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsamePreferenze.js');
  }

  // Importa utilità da FormUtils
  const {
    setElementValue,
    setCheckboxValue,
    showValidationError,
    showOperationMessage,
    setDurationFromMinutes,
    combineTimeValuesUtil,
    saveFormPreference,
    loadFormPreferences,
    deleteFormPreference
  } = window.FormUtils;

  let currentUsername = null;
  let userPreferences = [];

  // Carica le preferenze dell'utente
  function loadUserPreferences() {
    if (!currentUsername) {
      currentUsername = document.getElementById("docente")?.value;
      if (!currentUsername) {
        console.error("Username non trovato, impossibile caricare le preferenze");
        return;
      }
    }
    
    loadFormPreferences(currentUsername, 'esame')
      .then(data => {
        if (data.status === 'success' && data.preferences) {
          userPreferences = data.preferences;
          // Aggiorna il menu delle preferenze
          updatePreferencesMenu();
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
        showValidationError("Errore: nessun utente identificato");
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
          const cdsMatch = tag.textContent.match(/\s+\(([A-Z0-9]+)\)/);
          if (cdsMatch && cdsMatch[1]) {
            const codice = cdsMatch[1];
            const titolo = tag.textContent.replace(/\s+\([A-Z0-9]+\)\s*×?$/, '').trim();
            selectedInsegnamenti.push({ codice, titolo });
          }
        });
      }
    } catch (error) {
      console.error("Errore nel recupero degli insegnamenti selezionati:", error);
    }
        
    // Raccogli i valori comuni del form escludendo i campi specifici dell'esame
    const preferences = {
      mostra_nel_calendario: document.getElementById("mostra_nel_calendario")?.checked || false,
      descrizione: document.getElementById("descrizione")?.value,
      insegnamenti: selectedInsegnamenti,
      tipoEsame: document.getElementById("tipoEsame")?.value,
      verbalizzazione: document.getElementById("verbalizzazione")?.value,
      oraAppello: document.getElementById("ora")?.value,
      durata: document.getElementById("durata")?.value,
      tipo_appello: document.querySelector('input[name="tipo_appello_radio"]:checked')?.value,
      note: document.getElementById("note")?.value
    };
    
    saveFormPreference(currentUsername, 'esame', preferenceName, preferences)
      .then(data => {
        if (data.status === 'success') {
          showOperationMessage(data.message, "Preferenze salvate", "notification");
          loadUserPreferences();
        } else {
          showValidationError(data.message);
        }
      })
      .catch(error => {
        console.error('Errore nel salvataggio delle preferenze:', error);
        showValidationError("Errore nel salvataggio delle preferenze");
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
        combineTimeValuesUtil();
        oraImpostata = true;
      }
    }
    
    // Imposta durata
    if (preference.durata) {
      setDurationFromMinutes(preference.durata);
    }
    
    // Gestione tipo appello (radio button)
    if (preference.hasOwnProperty('tipo_appello')) {
      if (preference.tipo_appello === 'PP') {
        document.getElementById('tipoAppelloPP').checked = true;
      } else {
        document.getElementById('tipoAppelloPF').checked = true;
      }
      // Aggiorna verbalizzazione chiamando la funzione nel form esame
      if (window.EsameForm && window.EsameForm.aggiornaVerbalizzazione) {
        window.EsameForm.aggiornaVerbalizzazione();
      }
    }

    // Imposta mostra_nel_calendario
    if (preference.hasOwnProperty('mostra_nel_calendario')) {
      setCheckboxValue('mostra_nel_calendario', preference.mostra_nel_calendario);
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
          // Chiama la funzione del modulo EsameAppelli se disponibile
          if (window.EsameAppelli && window.EsameAppelli.updateAuleForSection) {
            window.EsameAppelli.updateAuleForSection(sectionCounter);
          }
        }
      }, 50);
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
    
    deleteFormPreference(currentUsername, id)
      .then(data => {
        if (data.status === 'success') {
          showOperationMessage(data.message, "Preferenze", "notification");
          loadUserPreferences();
        } else {
          showValidationError(data.message);
        }
      })
      .catch(error => {
        console.error('Errore nell\'eliminazione della preferenza:', error);
        showValidationError("Errore nell'eliminazione della preferenza");
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

  // Imposta l'username corrente
  function setCurrentUsername(username) {
    currentUsername = username;
  }

  // Interfaccia pubblica
  return {
    loadUserPreferences,
    saveCurrentPreference,
    applyPreference,
    updatePreferencesMenu,
    deletePreference,
    toggleSavePreferenceForm,
    togglePreferencesMenu,
    handleSavePreference,
    setCurrentUsername
  };
}());

// Espone il modulo globalmente
window.EsamePreferenze = EsamePreferenze;