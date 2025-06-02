// Script per la gestione dei dati del form esame
const FormEsameData = (function() {
  // Verifica che FormEsameUtils sia caricato
  if (!window.FormEsameUtils) {
    throw new Error('FormEsameUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameData.js');
  }

  // Importa utilità da FormEsameUtils
  const {
    setElementValue,
    setRadioValue,
    setCheckboxValue,
    setDurationFromMinutes,
    parseTimeString
  } = window.FormEsameUtils;

  // Funzioni per invio messaggi alla sidebar
  const showError = (message) => window.showMessage(message, 'Errore', 'error');
  const showSuccess = (message) => window.showMessage(message, 'Successo', 'success');
  const showWarning = (message) => window.showMessage(message, 'Attenzione', 'warning');

  // Compila il form con i dati dell'esame (modalità modifica)
  function fillFormWithExamData(elements, examData) {
    // Imposta i campi diretti usando la funzione helper
    setFormFields(examData);

    // Gestione tipo appello (radio buttons)
    setRadioValue('tipo_appello_radio', examData.tipo_appello === 'PP' ? 'PP' : 'PF');
    
    // Aggiorna verbalizzazione
    window.FormEsameControlli.aggiornaVerbalizzazione();
    
    // Gestione checkbox mostra_nel_calendario
    setCheckboxValue('mostra_nel_calendario', examData.mostra_nel_calendario);

    // Usa handleSpecialFields per gestire ora e durata
    handleSpecialFields(examData);

    // Gestione insegnamento
    handleInsegnamentoSelection(examData);
  }
  
  // Gestione campi speciali (es. data, ora) - aggiornato per sezioni modulari
  function handleSpecialFields(data) {
    // Data appello - imposta nella prima sezione disponibile
    if (data.data_appello) {
      const firstDateField = document.querySelector('[id^="dataora_"]');
      if (firstDateField) firstDateField.value = data.data_appello;
    }
    
    // Ora appello - imposta nella prima sezione disponibile
    if (data.ora_appello) {
      const oraParts = parseTimeString(data.ora_appello);
      if (oraParts && oraParts.hours) {
        const firstOraH = document.querySelector('[id^="ora_h_"]');
        const firstOraM = document.querySelector('[id^="ora_m_"]');
        
        if (firstOraH) firstOraH.value = oraParts.hours.padStart(2, '0');
        if (firstOraM) firstOraM.value = oraParts.minutes.padStart(2, '0');
        
        // Trigger update aule per la prima sezione
        const firstSectionCounter = firstOraH.id.split('_')[2];
        setTimeout(() => window.FormEsameAppelli.updateAuleForSection(firstSectionCounter), 100);
      }
    }
    
    // Aula - imposta nella prima sezione disponibile  
    if (data.aula) {
      setTimeout(() => {
        const firstAulaSelect = document.querySelector('[id^="aula_"]');
        if (firstAulaSelect) {
          const aulaOption = Array.from(firstAulaSelect.options).find(option => option.value === data.aula);
          if (aulaOption) {
            firstAulaSelect.value = data.aula;
          }
        }
      }, 200);
    }
    
    // Durata
    if (data.durata_appello) {
      setDurationFromMinutes(data.durata_appello);
    }
    
    // Tipo appello (prova parziale)
    if (data.tipo_appello === 'PP') {
      const provaParzialeCheckbox = document.getElementById("provaParziale");
      if (provaParzialeCheckbox) {
        provaParzialeCheckbox.checked = true;
        // Aggiorna verbalizzazione
        window.FormEsameControlli.aggiornaVerbalizzazione();
      }
    }
  }
  
  // Compilazione form con dati parziali (es. data dal calendario)
  function fillFormWithPartialData(elements, partialData) {
    if (partialData.date) {
      const dateField = document.getElementById("dataora");
      if (dateField) dateField.value = partialData.date;
    }
    // Altri dati preselezionati possono essere gestiti qui
  }
  
  // Funzione unificata per impostare i valori dei campi del form
  function setFormFields(data) {
    const fieldMappings = {
      // Campi di testo semplici
      'descrizione': data.descrizione,
      'dataora': data.data_appello,
      'inizioIscrizione': data.data_inizio_iscrizione,
      'fineIscrizione': data.data_fine_iscrizione,
      'note': data.note_appello,
      'verbalizzazione': data.verbalizzazione,
      'tipoEsame': data.tipo_esame,
    };

    // Imposta campi di testo
    Object.entries(fieldMappings).forEach(([id, value]) => {
      if (value !== undefined && value !== null) {
        setElementValue(id, value);
      }
    });

    // Imposta radio buttons
    if (data.tipo_appello) {
      setRadioValue('tipo_appello_radio', data.tipo_appello === 'PP' ? 'PP' : 'PF');
    }

    // Imposta checkbox
    if (data.hasOwnProperty('mostra_nel_calendario')) {
      setCheckboxValue('mostra_nel_calendario', data.mostra_nel_calendario);
    }
  }

  // Funzione unificata per inviare i dati del form
  function submitFormData(options = {}) {
    const form = document.getElementById("formEsame");
    if (!form) {
      showError('Form non trovato');
      return;
    }

    // Se siamo in modalità modifica, inviamo JSON
    const isEditMode = window.FormEsameUI.getIsEditMode();
    if (isEditMode) {
      const formDataObj = collectFormData();
      
      fetch('/api/modificaEsame', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formDataObj)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showSuccess('Esame modificato con successo');
          window.FormEsameUI.hideForm();
          window.forceCalendarRefresh();
        } else {
          showError(data.message || 'Errore durante la modifica');
        }
      })
      .catch(() => showError('Errore di connessione al server'));
      return;
    }

    // Per l'inserimento, prepara il FormData con gli insegnamenti e sezioni multiple
    const formData = new FormData();
    
    // Aggiungi i campi base del form
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.type === 'checkbox') {
        if (input.checked) {
          formData.append(input.name, 'on');
        }
      } else if (input.type === 'radio') {
        if (input.checked) {
          formData.append(input.name, input.value);
        }
      } else if (input.name && input.value) {
        // Salta campi che gestiremo separatamente
        if (!input.name.includes('dataora_') && 
            !input.name.includes('ora_h_') && 
            !input.name.includes('ora_m_') && 
            !input.name.includes('aula_') &&
            !input.name.includes('durata_') &&
            input.name !== 'insegnamento') {
          formData.append(input.name, input.value);
        }
      }
    });
    
    // Gestisci gli insegnamenti multipli
    const insegnamentoSelect = document.getElementById('insegnamento');
    if (insegnamentoSelect && insegnamentoSelect.selectedOptions.length > 0) {
      Array.from(insegnamentoSelect.selectedOptions).forEach(option => {
        formData.append('insegnamento', option.value);
      });
    }
    
    // Gestisci le sezioni di date multiple
    const dateSections = document.querySelectorAll('.date-appello-section');
    let sectionIndex = 1;
    
    dateSections.forEach(section => {
      const dataInput = section.querySelector(`[id^="dataora_"]`);
      const oraHInput = section.querySelector(`[id^="ora_h_"]`);
      const oraMInput = section.querySelector(`[id^="ora_m_"]`);
      const aulaSelect = section.querySelector(`[id^="aula_"]`);
      
      if (dataInput?.value && oraHInput?.value && oraMInput?.value && aulaSelect?.value) {
        formData.append(`dataora_${sectionIndex}`, dataInput.value);
        formData.append(`ora_h_${sectionIndex}`, oraHInput.value);
        formData.append(`ora_m_${sectionIndex}`, oraMInput.value);
        formData.append(`aula_${sectionIndex}`, aulaSelect.value);
        
        // Gestisci la durata dalla sezione globale
        const durataField = document.getElementById('durata');
        if (durataField?.value) {
          formData.append(`durata_${sectionIndex}`, durataField.value);
        }
        
        sectionIndex++;
      }
    });
    
    // Se non ci sono sezioni di date, fallback ai campi legacy
    if (sectionIndex === 1) {
      const legacyData = document.getElementById('dataora');
      const legacyOra = document.getElementById('ora');
      const legacyAula = document.getElementById('aula');
      
      if (legacyData && legacyData.value) {
        formData.append('dataora', legacyData.value);
      }
      if (legacyOra && legacyOra.value) {
        formData.append('ora', legacyOra.value);
      }
      if (legacyAula && legacyAula.value) {
        formData.append('aula', legacyAula.value);
      }
    }

    // Aggiungi flag per bypass se richiesto
    if (options.bypassChecks) {
      formData.append('bypass_checks', 'true');
    }

    // Invia il form
    fetch('/api/inserisciEsame', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success' || data.status === 'direct_insert') {
        showSuccess(data.message || 'Esami inseriti con successo');
        document.getElementById('formEsame').reset();
        window.FormEsameUI.cleanupAndHideForm();
        window.forceCalendarRefresh();
        window.FormEsameUI.hideForm(true);
      } else if (data.status === 'validation') {
        mostraPopupConferma(data);
      } else if (data.status === 'partial') {
        showWarning(`${data.message}. Inseriti: ${data.inserted.join(', ')}`);
      } else {
        showError(data.message || 'Errore durante l\'inserimento');
      }
    })
    .catch(() => showError('Errore di connessione al server'));
  }

  // Raccoglie tutti i dati dal form
  function collectFormData() {
    const form = document.getElementById("formEsame");
    if (!form) return null;

    const formData = {};
    
    // Raccoglie i campi base
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.name && input.value) {
        if (input.type === 'checkbox') {
          formData[input.name] = input.checked;
        } else if (input.type === 'radio') {
          if (input.checked) {
            formData[input.name] = input.value;
          }
        } else {
          formData[input.name] = input.value;
        }
      }
    });

    return formData;
  }

  // Mostra il dialogo di conferma per la validazione degli esami
  function mostraPopupConferma(data) {
    const confirmationContent = `
      <div class="confirmation-details">
        <h3>Conferma creazione esame</h3>
        <p><strong>Descrizione:</strong> ${data.descrizione || 'Non specificata'}</p>
        <p><strong>Data:</strong> ${data.dataora || 'Non specificata'}</p>
        <p><strong>Ora:</strong> ${data.ora || 'Non specificata'}</p>
        <p><strong>Durata:</strong> ${data.durata ? `${Math.floor(data.durata/60)}h ${data.durata%60}m` : 'Non specificata'}</p>
        <p><strong>Aula:</strong> ${data.aula || 'Non specificata'}</p>
      </div>
      <p>Sei sicuro di voler creare questo esame?</p>
    `;

    if (confirm(confirmationContent.replace(/<[^>]*>/g, ''))) {
      submitFormData({ ...data, confirmed: true });
    }
  }

  // Gestione selezione insegnamento
  function handleInsegnamentoSelection(data) {
    if (!data.insegnamento_codice) return;
    
    const insegnamentoSelect = document.getElementById('insegnamento');
    if (insegnamentoSelect) {
      // Cerca l'opzione corrispondente al codice insegnamento
      const option = Array.from(insegnamentoSelect.options).find(opt => 
        opt.value === data.insegnamento_codice
      );
      if (option) {
        option.selected = true;
      }
    }
  }

  // Controlla insegnamenti preselezionati dall'URL
  function checkPreselectedInsegnamenti() {
    const urlParams = new URLSearchParams(window.location.search);
    const insegnamentoParam = urlParams.get('insegnamento');
    
    if (insegnamentoParam) {
      const insegnamentoSelect = document.getElementById('insegnamento');
      if (insegnamentoSelect) {
        const option = Array.from(insegnamentoSelect.options).find(opt => 
          opt.value === insegnamentoParam
        );
        if (option) {
          option.selected = true;
        }
      }
    }
  }

  // Interfaccia pubblica
  return {
    fillFormWithExamData,
    handleSpecialFields,
    fillFormWithPartialData,
    setFormFields,
    submitFormData,
    collectFormData,
    mostraPopupConferma,
    handleInsegnamentoSelection,
    checkPreselectedInsegnamenti
  };
}());

// Esportazione globale
window.FormEsameData = FormEsameData;