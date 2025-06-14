document.addEventListener('DOMContentLoaded', function() {
  // Gestione salvataggio automatico e precompilazione sezioni del form esame
  const FormEsameAutosave = (function() {
    // Verifica che le dipendenze siano caricate
    if (!window.FormEsameData) {
      console.warn('FormEsameData non è caricato. Alcune funzionalità potrebbero non essere disponibili.');
    }

    // Chiave per il cookie di salvataggio automatico
    const AUTOSAVE_COOKIE_KEY = 'form_esame_autosave';
    const COOKIE_EXPIRY_DAYS = 7; // I dati salvati durano 7 giorni

    // Traccia l'ultima sezione modificata
    let lastModifiedSection = null;
    let lastModifiedSectionId = null;

    // Funzioni per la gestione dei cookie
    function setCookie(name, value, days) {
      const expires = new Date();
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
      document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
    }

    function getCookie(name) {
      const nameEQ = name + "=";
      const ca = document.cookie.split(';');
      for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
          return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
      }
      return null;
    }

    function deleteCookie(name) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }

    // Funzione per tracciare l'ultima sezione modificata
    function trackSectionModification(sectionElement) {
      lastModifiedSection = sectionElement;
      lastModifiedSectionId = sectionElement.id;
    }

    // Salva automaticamente i dati dell'ultima sezione modificata
    function autoSaveLastModifiedSection() {
      try {
        // Se non c'è una sezione modificata, usa la prima sezione
        const sectionToSave = lastModifiedSection || document.querySelector('.date-appello-section');
        if (!sectionToSave) return;

        const formData = {
          sectionId: sectionToSave.id,
          descrizione: sectionToSave.querySelector('[id^="descrizione_"]')?.value || '',
          ora_h: sectionToSave.querySelector('[id^="ora_h_"]')?.value || '',
          ora_m: sectionToSave.querySelector('[id^="ora_m_"]')?.value || '',
          durata_h: sectionToSave.querySelector('[id^="durata_h_"]')?.value || '2',
          durata_m: sectionToSave.querySelector('[id^="durata_m_"]')?.value || '0',
          inizioIscrizione: sectionToSave.querySelector('[id^="inizioIscrizione_"]')?.value || '',
          fineIscrizione: sectionToSave.querySelector('[id^="fineIscrizione_"]')?.value || '',
          verbalizzazione: sectionToSave.querySelector('[id^="verbalizzazione_"]')?.value || 'FSS',
          tipoEsame: sectionToSave.querySelector('[id^="tipoEsame_"]')?.value || '',
          note: sectionToSave.querySelector('[id^="note_"]')?.value || '',
          mostra_nel_calendario: sectionToSave.querySelector('[id^="mostra_nel_calendario_"]')?.checked !== false,
          tipo_appello_radio: sectionToSave.querySelector('input[name^="tipo_appello_radio_"]:checked')?.value || 'PF',
          timestamp: new Date().getTime()
        };

        // Salva nei cookie solo se ci sono dati significativi
        const hasSignificantData = formData.descrizione || formData.ora_h || formData.ora_m || 
                                    formData.inizioIscrizione || formData.fineIscrizione || formData.note;
        
        if (hasSignificantData) {
          setCookie(AUTOSAVE_COOKIE_KEY, JSON.stringify(formData), COOKIE_EXPIRY_DAYS);
        }
      } catch (error) {
        console.error('Errore nel salvataggio automatico:', error);
      }
    }

    // Carica i dati salvati e li applica al form
    function loadSavedData() {
      try {
        const savedDataStr = getCookie(AUTOSAVE_COOKIE_KEY);
        if (!savedDataStr) return false;

        const savedData = JSON.parse(savedDataStr);
        
        // Verifica che i dati non siano troppo vecchi (più di 7 giorni)
        const now = new Date().getTime();
        const dataAge = now - (savedData.timestamp || 0);
        const maxAge = COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        
        if (dataAge > maxAge) {
          deleteCookie(AUTOSAVE_COOKIE_KEY);
          return false;
        }

        // Cerca di applicare i dati alla sezione salvata originariamente
        let targetSection = null;
        if (savedData.sectionId) {
          targetSection = document.getElementById(savedData.sectionId);
        }
        
        // Se la sezione originale non esiste, usa la prima sezione disponibile
        if (!targetSection) {
          targetSection = document.querySelector('.date-appello-section');
        }

        if (targetSection) {
          applyDataToSection(savedData, targetSection);
          lastModifiedSection = targetSection;
          lastModifiedSectionId = targetSection.id;
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('Errore nel caricamento dei dati salvati:', error);
        deleteCookie(AUTOSAVE_COOKIE_KEY);
        return false;
      }
    }

    // Applica i dati salvati a una sezione specifica - aggiornato per modifica
    function applyDataToSection(data, section, isEditMode = false) {
      try {
        // Campi di testo
        const mappings = [
          { key: 'descrizione', selector: '[id^="descrizione_"]' },
          { key: 'inizioIscrizione', selector: '[id^="inizioIscrizione_"]' },
          { key: 'fineIscrizione', selector: '[id^="fineIscrizione_"]' },
          { key: 'note', selector: '[id^="note_"]' }
        ];

        mappings.forEach(({ key, selector }) => {
          if (data[key]) {
            const element = section.querySelector(selector);
            if (element) element.value = data[key];
          }
        });

        // Ora
        if (data.ora_h) {
          const oraH = section.querySelector('[id^="ora_h_"]');
          if (oraH) oraH.value = data.ora_h;
        }
        if (data.ora_m) {
          const oraM = section.querySelector('[id^="ora_m_"]');
          if (oraM) oraM.value = data.ora_m;
        }

        // Durata
        if (data.durata_h !== undefined) {
          const durataH = section.querySelector('[id^="durata_h_"]');
          if (durataH) durataH.value = data.durata_h;
        }
        if (data.durata_m !== undefined) {
          const durataM = section.querySelector('[id^="durata_m_"]');
          if (durataM) durataM.value = data.durata_m;
        }

        // Select
        if (data.verbalizzazione) {
          const verbalizzazione = section.querySelector('[id^="verbalizzazione_"]');
          if (verbalizzazione) verbalizzazione.value = data.verbalizzazione;
        }
        if (data.tipoEsame) {
          const tipoEsame = section.querySelector('[id^="tipoEsame_"]');
          if (tipoEsame) tipoEsame.value = data.tipoEsame;
        }

        // Checkbox
        if (data.mostra_nel_calendario !== undefined) {
          const checkbox = section.querySelector('[id^="mostra_nel_calendario_"]');
          if (checkbox) checkbox.checked = data.mostra_nel_calendario;
        }

        // Radio buttons tipo appello
        if (data.tipo_appello_radio) {
          const sectionCounter = section.querySelector('[id^="ora_h_"]')?.id.split('_')[2];
          if (sectionCounter) {
            const radioId = `tipoAppello${data.tipo_appello_radio}_${sectionCounter}`;
            const radio = document.getElementById(radioId);
            if (radio) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              
              setTimeout(() => {
                if (window.EsameAppelli && window.EsameAppelli.aggiornaVerbalizzazioneForSection) {
                  window.EsameAppelli.aggiornaVerbalizzazioneForSection(sectionCounter);
                }
                
                if (data.verbalizzazione) {
                  const verbalizzazione = section.querySelector('[id^="verbalizzazione_"]');
                  if (verbalizzazione) verbalizzazione.value = data.verbalizzazione;
                }
              }, 50);
            }
          }
        }

        // Aggiorna aule se ora è impostata (solo se non in modalità modifica)
        if (!isEditMode && data.ora_h && data.ora_m) {
          const sectionCounter = section.querySelector('[id^="ora_h_"]')?.id.split('_')[2];
          if (sectionCounter && window.EsameAppelli) {
            setTimeout(() => {
              window.EsameAppelli.updateAuleForSection(sectionCounter);
            }, 100);
          }
        }

      } catch (error) {
        console.error('Errore nell\'applicazione dei dati alla sezione:', error);
      }
    }

    // Setup di listener per tracciare le modifiche alle sezioni
    function setupSectionTracking(section) {
      if (!section) return;

      const inputs = section.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        const handler = () => trackSectionModification(section);
        
        input.removeEventListener('input', handler);
        input.removeEventListener('change', handler);
        
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      });
    }

    // Precompila una nuova sezione con i dati della sezione di riferimento
    function precompileNewSection(newSection, excludeFromReferenceSection = []) {
      try {
        // Usa l'ultima sezione modificata come riferimento, altrimenti la prima sezione
        const referenceSection = lastModifiedSection || document.querySelector('.date-appello-section');
        if (!referenceSection || referenceSection === newSection) return;

        // Raccoglie i dati dalla sezione di riferimento (escludendo campi specificati)
        const dataToClone = {
          descrizione: referenceSection.querySelector('[id^="descrizione_"]')?.value || '',
          ora_h: excludeFromReferenceSection.includes('ora_h') ? '' : referenceSection.querySelector('[id^="ora_h_"]')?.value || '',
          ora_m: excludeFromReferenceSection.includes('ora_m') ? '' : referenceSection.querySelector('[id^="ora_m_"]')?.value || '',
          durata_h: referenceSection.querySelector('[id^="durata_h_"]')?.value || '2',
          durata_m: referenceSection.querySelector('[id^="durata_m_"]')?.value || '0',
          inizioIscrizione: excludeFromReferenceSection.includes('inizioIscrizione') ? '' : referenceSection.querySelector('[id^="inizioIscrizione_"]')?.value || '',
          fineIscrizione: excludeFromReferenceSection.includes('fineIscrizione') ? '' : referenceSection.querySelector('[id^="fineIscrizione_"]')?.value || '',
          verbalizzazione: referenceSection.querySelector('[id^="verbalizzazione_"]')?.value || 'FSS',
          tipoEsame: referenceSection.querySelector('[id^="tipoEsame_"]')?.value || '',
          note: excludeFromReferenceSection.includes('note') ? '' : referenceSection.querySelector('[id^="note_"]')?.value || '',
          mostra_nel_calendario: referenceSection.querySelector('[id^="mostra_nel_calendario_"]')?.checked !== false,
          tipo_appello_radio: referenceSection.querySelector('input[name^="tipo_appello_radio_"]:checked')?.value || 'PF'
        };

        // Applica i dati alla nuova sezione
        setTimeout(() => {
          applyDataToSection(dataToClone, newSection, false);
          setupSectionTracking(newSection);
        }, 50);

      } catch (error) {
        console.error('Errore nella precompilazione della nuova sezione:', error);
      }
    }

    // Pulisce i dati salvati
    function clearSavedData() {
      deleteCookie(AUTOSAVE_COOKIE_KEY);
    }

    // Verifica se ci sono dati salvati
    function hasSavedData() {
      const savedDataStr = getCookie(AUTOSAVE_COOKIE_KEY);
      if (!savedDataStr) return false;

      try {
        const savedData = JSON.parse(savedDataStr);
        const now = new Date().getTime();
        const dataAge = now - (savedData.timestamp || 0);
        const maxAge = COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        
        return dataAge <= maxAge;
      } catch (error) {
        return false;
      }
    }

    // Interfaccia pubblica aggiornata
    return {
      autoSaveFirstSection: autoSaveLastModifiedSection, // Mantiene compatibilità con nome precedente
      autoSaveLastModifiedSection,
      loadSavedData,
      precompileNewSection,
      clearSavedData,
      hasSavedData,
      applyDataToSection,
      setupSectionTracking,
      trackSectionModification
    };
  }());

  // Espone il modulo globalmente
  window.FormEsameAutosave = FormEsameAutosave;
});