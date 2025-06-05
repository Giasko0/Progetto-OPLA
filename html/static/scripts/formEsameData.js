// Gestione dei dati del form esame
const FormEsameData = (function() {
  // Verifica che FormUtils sia caricato
  if (!window.FormUtils) {
    throw new Error('FormUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameData.js');
  }

  // Importa le utilità necessarie da FormUtils
  const {
    setElementValue,
    setRadioValue,
    setCheckboxValue,
    setDurationFromMinutes,
    parseTimeString
  } = window.FormUtils;

  // Compila il form con i dati dell'esame (modalità modifica)
  function fillFormWithExamData(elements, examData) {
    // Imposta i campi diretti usando la funzione helper
    setFormFields(examData);

    // Gestione tipo appello (radio buttons)
    setRadioValue('tipo_appello_radio', examData.tipo_appello === 'PP' ? 'PP' : 'PF');
    aggiornaVerbalizzazione(); // Aggiorna le opzioni di verbalizzazione
    
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
        
        if (firstOraH) firstOraH.value = oraParts.hours;
        if (firstOraM) firstOraM.value = oraParts.minutes;
        
        // Trigger update aule per la prima sezione
        const firstSectionCounter = firstOraH?.id.split('_')[2];
        if (firstSectionCounter && window.EsameAppelli) {
          window.EsameAppelli.updateAuleForSection(firstSectionCounter);
        }
      }
    }
    
    // Aula - imposta nella prima sezione disponibile  
    if (data.aula) {
      setTimeout(() => {
        const firstAulaSelect = document.querySelector('[id^="aula_"]');
        if (firstAulaSelect) {
          firstAulaSelect.value = data.aula;
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
        aggiornaVerbalizzazione();
      }
    }
  }

  // Compilazione form con dati parziali (es. data dal calendario)
  function fillFormWithPartialData(elements, partialData) {
    if (partialData.date) {
      // Verifica se esiste già una sezione con questa data
      const existingSections = document.querySelectorAll('.date-appello-section');
      const dateAlreadyExists = Array.from(existingSections).some(section => 
        section.dataset.date === partialData.date
      );
      
      if (!dateAlreadyExists) {
        // Controlla se esiste una sezione vuota (senza data)
        const emptySections = Array.from(existingSections).filter(section => 
          !section.dataset.date || section.dataset.date === ''
        );

        if (emptySections.length > 0) {
          // Usa la prima sezione vuota
          const emptySection = emptySections[0];
          const dateInput = emptySection.querySelector('input[type="date"]');
          if (dateInput) {
            dateInput.value = partialData.date;
            emptySection.dataset.date = partialData.date;
          }
        } else {
          // Aggiungi una nuova sezione
          if (window.EsameAppelli) {
            window.EsameAppelli.addDateSection(partialData.date);
          }
        }
      } else {
        // Se la data esiste già, evidenzia la sezione esistente
        const existingSection = Array.from(existingSections).find(section => 
          section.dataset.date === partialData.date
        );
        if (existingSection) {
          existingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          existingSection.style.backgroundColor = '#fffacd';
          setTimeout(() => {
            existingSection.style.backgroundColor = '';
          }, 2000);
        }
      }
    }
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

  function handleInsegnamentoSelection(data) {
    if (window.InsegnamentiManager && data.insegnamento_codice) {
      window.InsegnamentiManager.clearSelection();
      window.InsegnamentiManager.selectInsegnamento(data.insegnamento_codice, {
        semestre: data.semestre || 1,
        anno_corso: data.anno_corso || 1,
        cds: data.cds_codice || ""
      });
      
      const multiSelectBox = document.getElementById("insegnamentoBox");
      if (multiSelectBox) {
        window.InsegnamentiManager.syncUI(multiSelectBox);
      }
    }
  }

  // Gestisce la selezione di una data dal calendario
  function handleDateSelection(date) {
    // Verifica se esiste già una sezione con questa data
    const existingSections = document.querySelectorAll('.date-appello-section');
    const dateAlreadyExists = Array.from(existingSections).some(section => 
      section.dataset.date === date
    );
    
    if (!dateAlreadyExists) {
      // Controlla se esiste una sezione vuota (senza data)
      const emptySections = Array.from(existingSections).filter(section => 
        !section.dataset.date || section.dataset.date === ''
      );

      if (emptySections.length > 0) {
        // Usa la prima sezione vuota
        const emptySection = emptySections[0];
        const dateInput = emptySection.querySelector('input[type="date"]');
        if (dateInput) {
          dateInput.value = date;
          emptySection.dataset.date = date;
        }
      } else {
        // Aggiungi una nuova sezione solo se non esiste già una sezione per questa data
        if (window.EsameAppelli) {
          window.EsameAppelli.addDateSection(date);
        }
      }
    } else {
      // Se la data esiste già, evidenzia la sezione esistente
      const existingSection = Array.from(existingSections).find(section => 
        section.dataset.date === date
      );
      if (existingSection) {
        existingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        existingSection.style.backgroundColor = '#fffacd';
        setTimeout(() => {
          existingSection.style.backgroundColor = '';
        }, 2000);
      }
    }
    
    // Trova la sezione che contiene questa data e imposta le date di iscrizione
    setTimeout(() => {
      const dateSections = document.querySelectorAll('.date-appello-section');
      let targetSection = null;
      
      for (const section of dateSections) {
        const dataInput = section.querySelector('[id^="dataora_"]');
        if (dataInput && dataInput.value === date) {
          targetSection = section;
          break;
        }
      }
      
      // Se abbiamo trovato la sezione, calcoliamo le date di inizio e fine iscrizione
      if (targetSection) {
        const inizioIscrizioneInput = targetSection.querySelector('[id^="inizioIscrizione_"]');
        const fineIscrizioneInput = targetSection.querySelector('[id^="fineIscrizione_"]');
        
        if (inizioIscrizioneInput && fineIscrizioneInput) {
          const appelloDate = new Date(date);
          
          // Inizio iscrizione: 30 giorni prima
          const inizio = new Date(appelloDate);
          inizio.setDate(appelloDate.getDate() - 30);
          
          // Fine iscrizione: 1 giorno prima
          const fine = new Date(appelloDate);
          fine.setDate(appelloDate.getDate() - 1);
          
          // Formatta le date in YYYY-MM-DD
          const pad = n => n.toString().padStart(2, '0');
          const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          
          inizioIscrizioneInput.value = format(inizio);
          fineIscrizioneInput.value = format(fine);
        }
      }
    }, 100);
  }

  // Funzione unificata per inviare i dati del form
  function submitFormData(options = {}) {
    const form = document.getElementById("formEsame");
    if (!form) return;

    // Se siamo in modalità modifica, inviamo JSON
    const isEditMode = options.isEdit || (document.getElementById("examIdField")?.value && document.getElementById("examIdField").value !== "");
    if (isEditMode) {
      // Logica per modalità modifica - JSON submission
      const jsonData = {
        id: document.getElementById("examIdField")?.value,
        // ... altri campi per modifica ...
      };
      
      // Non implementato in questo momento per il refactor
      console.warn("Modalità modifica non ancora implementata nel nuovo modulo");
      return;
    }

    // Per l'inserimento, prepara il FormData con le sezioni multiple
    const formData = new FormData();
    
    // Aggiungi solo i campi globali (docente e insegnamenti)
    const docenteField = document.getElementById('docente');
    if (docenteField && docenteField.value) {
      formData.append('docente', docenteField.value);
    }
    
    // Ottieni l'anno accademico selezionato dal cookie
    let annoAccademico;
    try {
      // Usa il metodo getSelectedAcademicYear da calendarUtils se disponibile
      if (window.getSelectedAcademicYear) {
        annoAccademico = window.getSelectedAcademicYear();
      } else {
        // Fallback: recupera direttamente il cookie
        const cookieName = "selectedAcademicYear";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
          let c = ca[i];
          while (c.charAt(0) === ' ') c = c.substring(1);
          if (c.indexOf(cookieName + '=') === 0) {
            annoAccademico = c.substring(cookieName.length + 1);
            break;
          }
        }
      }
      
      // Se non trovato, usa l'anno corrente come fallback
      if (!annoAccademico) {
        annoAccademico = new Date().getFullYear().toString();
      }
    } catch (error) {
      // In caso di errore, usa l'anno corrente come fallback
      annoAccademico = new Date().getFullYear().toString();
      console.warn("Errore nel recupero dell'anno accademico, usato anno corrente:", error);
    }
    
    formData.append('anno_accademico', annoAccademico);
    
    // Gestisci gli insegnamenti usando InsegnamentiManager
    let insegnamentiSelected = [];
    if (window.InsegnamentiManager && typeof window.InsegnamentiManager.getSelectedInsegnamenti === 'function') {
      insegnamentiSelected = window.InsegnamentiManager.getSelectedInsegnamenti();
    } else {
      // Fallback: usa il select nascosto
      const insegnamentoSelect = document.getElementById('insegnamento');
      if (insegnamentoSelect && insegnamentoSelect.selectedOptions.length > 0) {
        insegnamentiSelected = Array.from(insegnamentoSelect.selectedOptions).map(option => option.value);
      }
    }
    
    // Aggiungi gli insegnamenti al FormData
    if (insegnamentiSelected && insegnamentiSelected.length > 0) {
      insegnamentiSelected.forEach(codice => {
        formData.append('insegnamenti[]', codice);
      });
    } else {
      if (window.showMessage) {
        window.showMessage("Seleziona almeno un insegnamento", "Errore", "error");
      }
      return;
    }
    
    // Raccogli tutti i dati dalle sezioni di appelli
    const dateSections = document.querySelectorAll('.date-appello-section');
    let hasValidSections = false;
    
    dateSections.forEach((section, index) => {
      const sectionIndex = index + 1;
      
      // Raccogli tutti i campi della sezione
      const fields = {
        descrizione: section.querySelector(`[id^="descrizione_"]`)?.value,
        dataora: section.querySelector(`[id^="dataora_"]`)?.value,
        ora_h: section.querySelector(`[id^="ora_h_"]`)?.value,
        ora_m: section.querySelector(`[id^="ora_m_"]`)?.value,
        durata_h: section.querySelector(`[id^="durata_h_"]`)?.value,
        durata_m: section.querySelector(`[id^="durata_m_"]`)?.value,
        aula: section.querySelector(`[id^="aula_"]`)?.value,
        inizioIscrizione: section.querySelector(`[id^="inizioIscrizione_"]`)?.value,
        fineIscrizione: section.querySelector(`[id^="fineIscrizione_"]`)?.value,
        verbalizzazione: section.querySelector(`[id^="verbalizzazione_"]`)?.value,
        tipoEsame: section.querySelector(`[id^="tipoEsame_"]`)?.value,
        note: section.querySelector(`[id^="note_"]`)?.value,
        mostra_nel_calendario: section.querySelector(`[id^="mostra_nel_calendario_"]`)?.checked,
        tipo_appello_radio: section.querySelector(`input[name^="tipo_appello_radio_"]:checked`)?.value
      };
      
      // Verifica che i campi obbligatori siano presenti
      if (fields.descrizione && fields.dataora && fields.ora_h && fields.ora_m && fields.aula) {
        // Aggiungi tutti i campi al FormData con indice sezione
        Object.entries(fields).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(`${key}[]`, value);
          }
        });
        
        // Calcola e aggiungi durata in minuti
        const durataH = parseInt(fields.durata_h) || 0;
        const durataM = parseInt(fields.durata_m) || 0;
        const durataTotale = (durataH * 60) + durataM;
        formData.append('durata[]', durataTotale.toString());
        
        // Combina ora
        const oraCompleta = `${fields.ora_h}:${fields.ora_m}`;
        formData.append('ora[]', oraCompleta);
        
        hasValidSections = true;
      }
    });
    
    if (!hasValidSections) {
      if (window.showMessage) {
        window.showMessage("Compila almeno una sezione di appello valida", "Errore", "error");
      }
      return;
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
      if (data.status === 'success') {
        // Pulisci i dati di salvataggio automatico quando l'esame viene salvato con successo
        if (window.FormEsameAutosave) {
          window.FormEsameAutosave.clearSavedData();
        }
        
        if (window.showMessage) {
          window.showMessage(data.message, "Successo", "notification");
        }
        
        // Ricarica il calendario
        if (window.calendar) {
          window.calendar.refetchEvents();
        }
        
        // Chiudi il form
        if (window.EsameForm && window.EsameForm.hideForm) {
          window.EsameForm.hideForm(true, true); // cleanup provisional events e autosave
        }
      } else {
        if (window.showMessage) {
          window.showMessage(data.message, "Errore", "error");
        }
      }
    })
    .catch(error => {
      console.error('Errore di rete:', error);
      if (window.showMessage) {
        window.showMessage('Errore di rete durante l\'invio del form', "Errore", "error");
      }
    });
  }

  // Interfaccia pubblica
  return {
    fillFormWithExamData,
    handleSpecialFields,
    fillFormWithPartialData,
    setFormFields,
    handleInsegnamentoSelection,
    submitFormData,
    handleDateSelection
  };
}());

// Espone il modulo globalmente
window.FormEsameData = FormEsameData;