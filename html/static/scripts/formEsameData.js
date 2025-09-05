// Gestione dei dati del form esame
const FormEsameData = (function() {

  // Funzioni per impostare valori degli elementi
  function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }

  function setRadioValue(name, value) {
    const radio = document.getElementById(`${name.replace('_radio', '')}${value}`);
    radio.checked = true;
  }

  function setCheckboxValue(id, value) {
    const checkbox = document.getElementById(id);
    checkbox.checked = value === true || value === 'true';
  }

  // Helper per durata e ora
  function setDurationFromMinutes(durataMinuti) {
    const durata = parseInt(durataMinuti);
    const ore = Math.floor(durata / 60);
    const minuti = durata % 60;
    
    setElementValue("durata_h", ore.toString());
    setElementValue("durata_m", minuti.toString().padStart(2, '0'));
    setElementValue("durata", durata.toString());
  }

  // Imposta ora_h e ora_m a partire da una stringa "HH:MM" (solo questa modalità, senza fallback)
  function setTimeFieldsFromString(timeString, sectionCounter = '1') {
    if (!timeString) return;
    const [hours, minutes] = timeString.split(':');
    const oraH = document.querySelector(`[id^="ora_h_${sectionCounter}"]`);
    const oraM = document.querySelector(`[id^="ora_m_${sectionCounter}"]`);
    if (oraH) oraH.value = hours;
    if (oraM) oraM.value = minutes;
    const oraField = document.querySelector(`[id^="ora_${sectionCounter}"][type="hidden"]`);
    if (oraField) oraField.value = `${hours}:${minutes}`;
  }

  // Combina i valori ora_h e ora_m in un unico campo ora (stringa "HH:MM") per tutte le sezioni (solo questa modalità)
  function combineTimeValuesForAllSections() {
    document.querySelectorAll('.date-appello-section').forEach((section) => {
      const sectionIdMatch = section.id.match(/_(\d+)$/);
      const counter = sectionIdMatch ? sectionIdMatch[1] : '1';
      const ora_h = section.querySelector(`[id^="ora_h_"]`)?.value;
      const ora_m = section.querySelector(`[id^="ora_m_"]`)?.value;
      if (ora_h && ora_m) {
        let oraField = section.querySelector(`[id^="ora_"][type="hidden"]`);
        if (oraField) oraField.value = `${ora_h}:${ora_m}`;
      }
      // ...gestione durata come prima...
      const durata_h = parseInt(section.querySelector(`[id^="durata_h_"]`)?.value) || 0;
      const durata_m = parseInt(section.querySelector(`[id^="durata_m_"]`)?.value) || 0;
      const durata_totale = (durata_h === 0 && durata_m === 0) ? null : (durata_h * 60) + durata_m;
      let durataField = section.querySelector(`[id^="durata_"][type="hidden"]`);
      if (durataField) durataField.value = durata_totale !== null ? durata_totale.toString() : '';
    });
  }

  // Parsing del tempo solo da stringa "HH:MM"
  function parseTimeString(timeString) {
    const [hours, minutes] = timeString.split(':');
    return { hours, minutes };
  }

  // Gestione campi speciali per sezioni modulari
  function handleSpecialFields(data, sectionCounter = '1') {
    // Data appello
    if (data.data_appello) {
      const dateField = document.querySelector(`[id^="dataora_${sectionCounter}"]`);
      if (dateField) dateField.value = data.data_appello;
    }
    
    // Ora appello  
    if (data.ora_appello) {
      setTimeFieldsFromString(data.ora_appello, sectionCounter);
      // Aggiorna aule per la sezione
      window.EsameAppelli.updateAuleForSection(sectionCounter);
    }
    
    // Aula
    if (data.aula) {
      setTimeout(() => {
        const aulaSelect = document.querySelector(`[id^="aula_${sectionCounter}"]`);
        if (aulaSelect) {
          aulaSelect.value = data.aula;
        }
      }, 200);
    }
    
    // Durata per sezione specifica
    if (data.durata_appello) {
      setDurationForSection(data.durata_appello, sectionCounter);
    }
  }

  // Imposta durata per una sezione specifica
  function setDurationForSection(durataMinuti, sectionCounter) {
    const durata = parseInt(durataMinuti);
    const ore = Math.floor(durata / 60);
    const minuti = durata % 60;
    
    const durataH = document.querySelector(`[id^="durata_h_${sectionCounter}"]`);
    const durataM = document.querySelector(`[id^="durata_m_${sectionCounter}"]`);
    
    durataH.value = ore.toString();
    durataM.value = minuti.toString().padStart(2, '0');
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
          window.EsameAppelli.addDateSection(partialData.date);
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

    // Radio buttons e checkbox
    if (data.tipo_appello) {
      setRadioValue('tipo_appello_radio', data.tipo_appello === 'PP' ? 'PP' : 'PF');
    }

    if (data.hasOwnProperty('mostra_nel_calendario')) {
      setCheckboxValue('mostra_nel_calendario', data.mostra_nel_calendario);
    }

    // Ora appello
    if (data.ora_appello) {
      setTimeFieldsFromString(data.ora_appello, '1');
    }
  }

  function handleInsegnamentoSelection(data) {
    window.InsegnamentiManager.clearSelection();
    window.InsegnamentiManager.selectInsegnamento(data.insegnamento_codice, {
      semestre: data.semestre || 1,
      anno_corso: data.anno_corso || 1,
      cds: data.cds_codice || ""
    });
    
    const multiSelectBox = document.getElementById("insegnamentoBox");
    window.InsegnamentiManager.syncUI(multiSelectBox);
  }

  // Gestione selezione data ottimizzata
  function handleDateSelection(date, options = {}) {
    const existingSections = document.querySelectorAll('.date-appello-section');
    
    // Cerca prima una sezione vuota
    const emptySection = Array.from(existingSections).find(section => 
      !section.dataset.date || section.dataset.date === ''
    );

    if (emptySection) {
      const dateInput = emptySection.querySelector('input[type="date"]');
      if (dateInput) {
        dateInput.value = date;
        emptySection.dataset.date = date;
        calculateAndSetInscriptionDatesForSection(emptySection, date);
        
        // Applica configurazione per prova parziale non ufficiale
        if (options.isNonOfficialPartial) {
          configureNonOfficialPartialSection(emptySection);
        }
        
        // Crea evento provvisorio
        if (window.EsameAppelli?.createProvisionalEventForDate) {
          const sectionIdMatch = emptySection.id.match(/dateSection_(\d+)/);
          const sectionNumber = sectionIdMatch ? parseInt(sectionIdMatch[1]) : 1;
          window.EsameAppelli.createProvisionalEventForDate(date, sectionNumber);
        }
        
        return;
      }
    }
    
    // Verifica se la data esiste già
    const existingSection = Array.from(existingSections).find(section => 
      section.dataset.date === date
    );
    
    if (existingSection) {
      // Evidenzia sezione esistente
      existingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      existingSection.style.backgroundColor = '#fffacd';
      setTimeout(() => existingSection.style.backgroundColor = '', 2000);
      return;
    }

    // Crea nuova sezione
    if (window.EsameAppelli?.addDateSection) {
      const sectionId = window.EsameAppelli.addDateSection(date, options);
      setTimeout(() => {
        calculateAndSetInscriptionDates(date);
        
        // Applica configurazione per prova parziale non ufficiale se necessario
        // (viene già gestita in addDateSection, ma manteniamo per sicurezza)
        if (options.isNonOfficialPartial && sectionId) {
          const section = document.getElementById(sectionId);
          if (section) {
            configureNonOfficialPartialSection(section);
          }
        }
      }, 50);
    }
  }

  // Configura sezione per prova parziale non ufficiale
  function configureNonOfficialPartialSection(section) {
    const sectionIdMatch = section.id.match(/dateSection_(\d+)/);
    const counter = sectionIdMatch ? sectionIdMatch[1] : '1';
    
    // Disabilita e deseleziona "Appello ufficiale"
    const showInCalendarCheckbox = section.querySelector(`#mostra_nel_calendario_${counter}`);
    if (showInCalendarCheckbox) {
      showInCalendarCheckbox.checked = false;
      showInCalendarCheckbox.disabled = true;
      showInCalendarCheckbox.style.opacity = '0.5';
      // Aggiungi stile per mostrare che è disabilitato
      const checkboxContainer = showInCalendarCheckbox.closest('.form-element');
      if (checkboxContainer) {
        checkboxContainer.style.opacity = '0.5';
        checkboxContainer.style.pointerEvents = 'none';
      }
    }
    
    // Seleziona e disabilita "Prova Parziale"
    const tipoAppelloPP = section.querySelector(`#tipoAppelloPP_${counter}`);
    const tipoAppelloPF = section.querySelector(`#tipoAppelloPF_${counter}`);
    
    if (tipoAppelloPP && tipoAppelloPF) {
      tipoAppelloPP.checked = true;
      tipoAppelloPF.checked = false;
      
      // Disabilita entrambi i radio button
      tipoAppelloPP.disabled = true;
      tipoAppelloPF.disabled = true;
      
      // Stile visivo per indicare che sono disabilitati
      const radioGroup = section.querySelector('.radio-group');
      if (radioGroup) {
        radioGroup.style.opacity = '0.5';
        radioGroup.style.pointerEvents = 'none';
      }
    }
    
    // Aggiorna il dropdown verbalizzazione per prova parziale
    setTimeout(() => {
      if (window.EsameAppelli?.aggiornaVerbalizzazioneForSection) {
        window.EsameAppelli.aggiornaVerbalizzazioneForSection(counter);
        
        // Imposta la verbalizzazione di default a "Prova parziale"
        const verbalizzazioneSelect = section.querySelector(`#verbalizzazione_${counter}`);
        if (verbalizzazioneSelect) {
          verbalizzazioneSelect.value = "PAR";
        }
      }
    }, 100);
    
    // Aggiungi marker per identificare la sezione come prova parziale non ufficiale
    section.dataset.isNonOfficialPartial = 'true';
    
    // Aggiungi stile visivo per distinguere la sezione
    section.style.border = '2px dashed #ff9800';
    section.style.backgroundColor = '#fff3e0';
    
    // Aggiungi tooltip esplicativo
    const header = section.querySelector('.date-appello-header h4');
    if (header) {
      header.style.color = '#ff9800';
      header.title = 'Prova parziale non ufficiale - non apparirà nel calendario ufficiale';
    }
  }

  // Calcolo date iscrizione semplificato
  function calculateAndSetInscriptionDates(date) {
    const targetSection = Array.from(document.querySelectorAll('.date-appello-section'))
      .find(section => {
        const dataInput = section.querySelector('[id^="dataora_"]');
        return dataInput?.value === date;
      });
    
    if (targetSection) {
      calculateAndSetInscriptionDatesForSection(targetSection, date);
    }
  }

  function calculateAndSetInscriptionDatesForSection(section, date) {
    const inizioIscrizioneInput = section.querySelector('[id^="inizioIscrizione_"]');
    const fineIscrizioneInput = section.querySelector('[id^="fineIscrizione_"]');
    
    if (!inizioIscrizioneInput || !fineIscrizioneInput) return;
    
    const appelloDate = new Date(date);
    const inizio = new Date(appelloDate);
    inizio.setDate(appelloDate.getDate() - 30);
    const fine = new Date(appelloDate);
    fine.setDate(appelloDate.getDate() - 1);
    
    const format = d => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    
    inizioIscrizioneInput.value = format(inizio);
    fineIscrizioneInput.value = format(fine);
    
    // Trigger eventi
    [inizioIscrizioneInput, fineIscrizioneInput].forEach(input => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // Funzione submitFormData ottimizzata
  function submitFormData(options = {}) {
    if (options.isEdit) {
      console.error("Modalità modifica spostata in EditEsame modulo");
      return;
    }

    const form = document.getElementById("formEsame");
    const formData = new FormData();
    
    // Campi globali
    const docenteField = document.getElementById('docente');
    formData.append('docente', docenteField.value);
    
    const annoAccademico = window.AnnoAccademicoManager?.getSelectedAcademicYear();
    formData.append('anno_accademico', annoAccademico);
    
    // Insegnamenti
    const insegnamentiSelected = window.InsegnamentiManager?.getSelectedInsegnamenti() || [];
    
    if (!insegnamentiSelected.length) {
      window.showMessage("Seleziona almeno un insegnamento", "Attenzione", "warning");
      return;
    }
    
    insegnamentiSelected.forEach(codice => {
      formData.append('insegnamenti[]', codice);
    });
    
    // Raccogli dati sezioni
    const dateSections = document.querySelectorAll('.date-appello-section');
    let hasValidSections = false;
    
    dateSections.forEach((section, index) => {
      const sectionData = collectSectionData(section);
      
      if (sectionData.isValid) {
        // Aggiungi al FormData
        Object.entries(sectionData.fields).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(`${key}[]`, value);
          }
        });
        
        hasValidSections = true;
      }
    });
    
    if (!hasValidSections) {
      window.showMessage("Compila almeno una sezione di appello valida", "Errore", "error");
      return;
    }

    if (options.bypassChecks) {
      formData.append('bypass_checks', 'true');
    }

    // Invia form
    submitToServer(formData);
  }

  // Funzione helper per raccogliere dati sezione
  function collectSectionData(section) {
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
    const isValid = fields.descrizione && fields.dataora && fields.ora_h && fields.ora_m;
    if (isValid) {
      // Calcola date se mancanti
      if (!fields.inizioIscrizione || !fields.fineIscrizione) {
        const dates = calculateInscriptionDatesFromAppello(fields.dataora);
        fields.inizioIscrizione = fields.inizioIscrizione || dates.inizio;
        fields.fineIscrizione = fields.fineIscrizione || dates.fine;
      }
      // Calcola durata e ora
      const durataH = parseInt(fields.durata_h) || 0;
      const durataM = parseInt(fields.durata_m) || 0;
      const durataTotale = (durataH === 0 && durataM === 0) ? null : (durataH * 60) + durataM;
      fields.durata = durataTotale !== null ? durataTotale.toString() : '';
      fields.ora = `${fields.ora_h.padStart(2, '0')}:${fields.ora_m.padStart(2, '0')}`;
    }
    return { fields, isValid };
  }

  // Helper per calcolo date
  function calculateInscriptionDatesFromAppello(dataAppello) {
    const appelloDate = new Date(dataAppello);
    const inizio = new Date(appelloDate);
    inizio.setDate(appelloDate.getDate() - 30);
    const fine = new Date(appelloDate);
    fine.setDate(appelloDate.getDate() - 1);
    
    const format = d => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    
    return {
      inizio: format(inizio),
      fine: format(fine)
    };
  }

  // Funzione per invio al server
  function submitToServer(formData) {
    fetch('/api/inserisci-esame', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        window.FormEsameAutosave?.clearSavedData();
        window.showMessage(data.message, "Successo", "notification");
        window.calendar?.refetchEvents();
        window.EsameForm?.hideForm(true, true);
      } else {
        window.showMessage(data.message, "Errore", "error");
      }
    })
    .catch(error => {
      window.showMessage('Errore di rete durante l\'invio del form', "Errore", "error");
    });
  }

  // Interfaccia pubblica
  return {
    handleSpecialFields,
    fillFormWithPartialData,
    setFormFields,
    handleInsegnamentoSelection,
    submitFormData,
    handleDateSelection,
    setElementValue,
    setRadioValue,
    setCheckboxValue,
    setDurationFromMinutes,
    setDurationForSection,
    combineTimeValues: combineTimeValuesForAllSections,
    combineTimeValuesForAllSections,
    setTimeFieldsFromString,
    parseTimeString,
    calculateAndSetInscriptionDates,
    calculateAndSetInscriptionDatesForSection
  };
}());

// Espone il modulo globalmente
window.FormEsameData = FormEsameData;