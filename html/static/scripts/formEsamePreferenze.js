document.addEventListener('DOMContentLoaded', function() {
  // Gestione delle preferenze
  const EsamePreferenze = (function() {
    let currentUsername = null;
    let userPreferences = [];

    // === FUNZIONI API ===
    async function salvaPreferenza(name, preferences) {
      const response = await fetch('/api/preferenze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUsername,
          name: name,
          preferences: preferences
        })
      });
      return response.json();
    }

    async function caricaPreferenze() {
      const response = await fetch(`/api/preferenze?username=${encodeURIComponent(currentUsername)}`);
      return response.json();
    }

    async function eliminaPreferenza(id) {
      const response = await fetch(`/api/preferenze/${id}?username=${encodeURIComponent(currentUsername)}`, {
        method: 'POST'
      });
      return response.json();
    }

    // === FUNZIONI RACCOLTA DATI ===
    function raccogliDatiPrimaSezione() {
      const firstSection = document.querySelector('.date-appello-section');
      if (!firstSection) return null;

      const getValue = (selector) => firstSection.querySelector(selector)?.value || '';
      const getChecked = (selector) => firstSection.querySelector(selector)?.checked || false;
      const getRadio = (name) => firstSection.querySelector(`input[name^="${name}"]:checked`)?.value || '';

      // Ora
      const ora_h = getValue('[id^="ora_h_"]');
      const ora_m = getValue('[id^="ora_m_"]');
      const oraAppello = (ora_h && ora_m) ? `${ora_h}:${ora_m}` : '';

      // Durata
      const durata_h = parseInt(getValue('[id^="durata_h_"]')) || 0;
      const durata_m = parseInt(getValue('[id^="durata_m_"]')) || 0;
      const durata = ((durata_h * 60) + durata_m).toString();

      // Insegnamenti
      const insegnamenti = [];
      if (window.InsegnamentiManager?.getSelectedInsegnamenti) {
        const selected = window.InsegnamentiManager.getSelectedInsegnamenti();
        selected.forEach(codice => {
          const option = document.querySelector(`#insegnamento option[value="${codice}"]`);
          if (option) {
            insegnamenti.push({ codice, titolo: option.textContent });
          }
        });
      }

      return {
        descrizione: getValue('[id^="descrizione_"]'),
        tipoEsame: getValue('[id^="tipoEsame_"]'),
        verbalizzazione: getValue('[id^="verbalizzazione_"]'),
        oraAppello,
        durata,
        tipo_appello: getRadio('tipo_appello_radio'),
        mostra_nel_calendario: getChecked('[id^="mostra_nel_calendario_"]'),
        note: getValue('[id^="note_"]'),
        insegnamenti
      };
    }

    // === FUNZIONI APPLICAZIONE ===
    function applicaATutteLeSezioni(preferences) {
      const sections = document.querySelectorAll('.date-appello-section');
      
      sections.forEach((section, index) => {
        const counter = (index + 1).toString();
        applicaASezione(preferences, section, counter);
      });
      
      // Applica insegnamenti (globale)
      if (preferences.insegnamenti?.length && window.InsegnamentiManager) {
        window.InsegnamentiManager.clearSelection();
        const codes = preferences.insegnamenti.map(ins => ins.codice);
        
        window.InsegnamentiManager.loadInsegnamenti(currentUsername, { filter: codes }, data => {
          data.forEach(ins => {
            window.InsegnamentiManager.selectInsegnamento(ins.codice, {
              semestre: ins.semestre || 1,
              anno_corso: ins.anno_corso || 1,
              cds: ins.cds_codice || ""
            });
          });
          
          const box = document.getElementById("insegnamentoBox");
          if (box) window.InsegnamentiManager.syncUI(box, data);
        });
      }
    }

    function applicaASezione(preferences, section, counter) {
      const setValue = (selector, value) => {
        const el = section.querySelector(selector);
        if (el && value) el.value = value;
      };

      const setChecked = (selector, value) => {
        const el = section.querySelector(selector);
        if (el) el.checked = value;
      };

      // Campi di testo
      setValue('[id^="descrizione_"]', preferences.descrizione);
      setValue('[id^="tipoEsame_"]', preferences.tipoEsame);
      setValue('[id^="verbalizzazione_"]', preferences.verbalizzazione);
      setValue('[id^="note_"]', preferences.note);

      // Checkbox
      setChecked('[id^="mostra_nel_calendario_"]', preferences.mostra_nel_calendario);

      // Ora
      if (preferences.oraAppello && window.FormEsameData?.setTimeFieldsFromString) {
        window.FormEsameData.setTimeFieldsFromString(preferences.oraAppello, counter);
      }

      // Durata
      if (preferences.durata && window.FormEsameData?.setDurationForSection) {
        window.FormEsameData.setDurationForSection(preferences.durata, counter);
      }

      // Radio button
      if (preferences.tipo_appello) {
        const radioId = `tipoAppello${preferences.tipo_appello}_${counter}`;
        const radio = document.getElementById(radioId);
        if (radio) {
          radio.checked = true;
          
          // Aggiorna verbalizzazione
          setTimeout(() => {
            if (window.EsameAppelli?.aggiornaVerbalizzazioneForSection) {
              window.EsameAppelli.aggiornaVerbalizzazioneForSection(counter);
            }
            // Ri-applica verbalizzazione
            if (preferences.verbalizzazione) {
              setValue('[id^="verbalizzazione_"]', preferences.verbalizzazione);
            }
          }, 50);
        }
      }

      // Aggiorna aule
      if (preferences.oraAppello) {
        setTimeout(() => {
          if (window.EsameAppelli?.updateAuleForSection) {
            window.EsameAppelli.updateAuleForSection(counter);
          }
        }, 100);
      }
    }

    // === FUNZIONI UI ===
    async function caricaEMostraPreferenze() {
      if (!currentUsername) return;
      
      try {
        userPreferences = await caricaPreferenze();
        aggiornaMenu();
      } catch (error) {
        console.error('Errore caricamento preferenze:', error);
      }
    }

    function aggiornaMenu() {
      const menu = document.getElementById("preferencesMenu");
      if (!menu) return;
      
      menu.innerHTML = userPreferences.length === 0 
        ? "<div class='preference-item'>Nessuna preferenza salvata</div>"
        : userPreferences.map(pref => `
            <div class="preference-item" data-pref='${JSON.stringify(pref.preferences)}'>
              <span>${pref.name}</span>
              <span class="delete-btn" data-id="${pref.id}">
                <span class="material-symbols-outlined">delete</span>
              </span>
            </div>
          `).join('');
      
      // Event listeners
      menu.querySelectorAll('.preference-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.delete-btn')) return;
          const prefs = JSON.parse(item.dataset.pref);
          applicaATutteLeSezioni(prefs);
          nascondiMenu();
        });
      });
      
      menu.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Eliminare questa preferenza?')) {
            try {
              await eliminaPreferenza(btn.dataset.id);
              caricaEMostraPreferenze();
            } catch (error) {
              alert('Errore eliminazione preferenza');
            }
          }
        });
      });
    }

    function mostraMenu() {
      const menu = document.getElementById("preferencesMenu");
      const form = document.getElementById("savePreferenceForm");
      if (menu) menu.style.display = "block";
      if (form) form.style.display = "none";
    }

    function nascondiMenu() {
      const menu = document.getElementById("preferencesMenu");
      if (menu) menu.style.display = "none";
    }

    function mostraFormSalvataggio() {
      const menu = document.getElementById("preferencesMenu");
      const form = document.getElementById("savePreferenceForm");
      const input = document.getElementById("preferenceNameInput");
      
      if (form) form.style.display = "flex";
      if (menu) menu.style.display = "none";
      if (input) {
        input.value = '';
        input.focus();
      }
    }

    function nascondiFormSalvataggio() {
      const form = document.getElementById("savePreferenceForm");
      if (form) form.style.display = "none";
    }

    async function salvaNuovaPreferenza() {
      const input = document.getElementById("preferenceNameInput");
      const name = input?.value?.trim();
      
      if (!name) {
        alert('Inserisci un nome per la preferenza');
        return;
      }
      
      const preferences = raccogliDatiPrimaSezione();
      if (!preferences) {
        alert('Nessun dato da salvare');
        return;
      }
      
      try {
        await salvaPreferenza(name, preferences);
        nascondiFormSalvataggio();
        caricaEMostraPreferenze();
        if (window.showMessage) {
          window.showMessage(`Preferenza "${name}" salvata`, "Successo", "success");
        }
      } catch (error) {
        alert('Errore salvataggio preferenza');
      }
    }

    // === INTERFACCIA PUBBLICA ===
    return {
      setCurrentUsername: (username) => { currentUsername = username; },
      loadUserPreferences: caricaEMostraPreferenze,
      togglePreferencesMenu: () => {
        const menu = document.getElementById("preferencesMenu");
        const isVisible = menu?.style.display === "block";
        if (isVisible) nascondiMenu(); else { caricaEMostraPreferenze(); mostraMenu(); }
      },
      toggleSavePreferenceForm: () => {
        const form = document.getElementById("savePreferenceForm");
        const isVisible = form?.style.display === "flex";
        if (isVisible) nascondiFormSalvataggio(); else mostraFormSalvataggio();
      },
      handleSavePreference: salvaNuovaPreferenza,
      applyPreferenceToSection: applicaASezione // Per nuove sezioni
    };
  }());

  window.EsamePreferenze = EsamePreferenze;
});