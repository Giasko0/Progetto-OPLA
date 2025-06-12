// Gestione dei dati del form esame
const FormEsameData = (function() {

  // Funzioni per impostare valori degli elementi
  function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }

  function setRadioValue(name, value) {
    const radio = document.getElementById(`${name.replace('_radio', '')}${value}`);
    if (radio) radio.checked = true;
  }

  function setCheckboxValue(id, value) {
    const checkbox = document.getElementById(id);
    if (checkbox) checkbox.checked = value === true || value === 'true';
  }

  // Helper per durata e ora
  function setDurationFromMinutes(durataMinuti) {
    const durata = parseInt(durataMinuti);
    if (isNaN(durata)) return;
    
    const ore = Math.floor(durata / 60);
    const minuti = durata % 60;
    
    setElementValue("durata_h", ore.toString());
    setElementValue("durata_m", minuti.toString().padStart(2, '0'));
    setElementValue("durata", durata.toString());
  }

  function combineTimeValues() {
    const ora_h = document.getElementById('ora_h')?.value;
    const ora_m = document.getElementById('ora_m')?.value;
    if (ora_h && ora_m) {
      setElementValue('ora', `${ora_h}:${ora_m}`);
    }
    
    const durata_h = parseInt(document.getElementById('durata_h')?.value) || 0;
    const durata_m = parseInt(document.getElementById('durata_m')?.value) || 0;
    const durata_totale = (durata_h * 60) + durata_m;
    
    setElementValue('durata', durata_totale.toString());
  }

  // Parsing del tempo
  function parseTimeString(timeString) {
    if (!timeString || !timeString.includes(':')) return null;
    const [hours, minutes] = timeString.split(':').map(val => val.padStart(2, '0'));
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
      const oraParts = parseTimeString(data.ora_appello);
      if (oraParts && oraParts.hours) {
        const oraH = document.querySelector(`[id^="ora_h_${sectionCounter}"]`);
        const oraM = document.querySelector(`[id^="ora_m_${sectionCounter}"]`);
        
        if (oraH) oraH.value = oraParts.hours;
        if (oraM) oraM.value = oraParts.minutes;
        
        // Trigger update aule per la sezione
        window.EsameAppelli.updateAuleForSection(sectionCounter);
      }
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
    if (isNaN(durata)) return;
    
    const ore = Math.floor(durata / 60);
    const minuti = durata % 60;
    
    const durataH = document.querySelector(`[id^="durata_h_${sectionCounter}"]`);
    const durataM = document.querySelector(`[id^="durata_m_${sectionCounter}"]`);
    
    if (durataH) durataH.value = ore.toString();
    if (durataM) durataM.value = minuti.toString().padStart(2, '0');
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
    window.InsegnamentiManager.clearSelection();
    window.InsegnamentiManager.selectInsegnamento(data.insegnamento_codice, {
      semestre: data.semestre || 1,
      anno_corso: data.anno_corso || 1,
      cds: data.cds_codice || ""
    });
    
    const multiSelectBox = document.getElementById("insegnamentoBox");
    window.InsegnamentiManager.syncUI(multiSelectBox);
  }

  // Gestisce la selezione di una data dal calendario
  function handleDateSelection(date) {
    // Aspetta che il DOM sia pronto
    setTimeout(() => {
      // Verifica se esiste già una sezione con questa data
      const existingSections = document.querySelectorAll('.date-appello-section');
      
      if (existingSections.length === 0) {
        if (window.EsameAppelli && window.EsameAppelli.addDateSection) {
          window.EsameAppelli.addDateSection(date);
          // Calcola le date di iscrizione per la nuova sezione
          setTimeout(() => calculateAndSetInscriptionDates(date), 200);
        } else {
          console.error('>>> DATA: EsameAppelli.addDateSection non disponibile');
        }
        return;
      }
      
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
            // Calcola le date di iscrizione per questa sezione
            calculateAndSetInscriptionDatesForSection(emptySection, date);
          } else {
            console.error('>>> DATA: input date non trovato nella sezione vuota');
          }
        } else {
          // Aggiungi una nuova sezione solo se non esiste già una sezione per questa data
          if (window.EsameAppelli && window.EsameAppelli.addDateSection) {
            window.EsameAppelli.addDateSection(date);
            // Calcola le date di iscrizione per la nuova sezione
            setTimeout(() => calculateAndSetInscriptionDates(date), 200);
          } else {
            console.error('>>> DATA: EsameAppelli.addDateSection non disponibile');
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
    }, 100);
  }

  // Calcola e imposta le date di iscrizione per una data specifica
  function calculateAndSetInscriptionDates(date) {
    const dateSections = document.querySelectorAll('.date-appello-section');
    
    let targetSection = null;
    
    for (const section of dateSections) {
      const dataInput = section.querySelector('[id^="dataora_"]');
      if (dataInput && dataInput.value === date) {
        targetSection = section;
        break;
      }
    }
    
    if (targetSection) {
      calculateAndSetInscriptionDatesForSection(targetSection, date);
    } else {
      console.error('>>> DATA: sezione target non trovata per calcolo date iscrizione');
    }
  }

  // Calcola e imposta le date di iscrizione per una sezione specifica
  function calculateAndSetInscriptionDatesForSection(section, date) {
    const inizioIscrizioneInput = section.querySelector('[id^="inizioIscrizione_"]');
    const fineIscrizioneInput = section.querySelector('[id^="fineIscrizione_"]');
    
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
      
      const inizioFormatted = format(inizio);
      const fineFormatted = format(fine);
      
      inizioIscrizioneInput.value = inizioFormatted;
      fineIscrizioneInput.value = fineFormatted;
      
      // Trigger eventi change per assicurarsi che i valori siano registrati
      inizioIscrizioneInput.dispatchEvent(new Event('change', { bubbles: true }));
      fineIscrizioneInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Funzione unificata per inviare i dati del form
  function submitFormData(options = {}) {
    const form = document.getElementById("formEsame");

    // La modalità modifica è ora gestita da EditEsame
    if (options.isEdit) {
      console.error("Modalità modifica spostata in EditEsame modulo");
      return;
    }

    // Per l'inserimento, prepara il FormData con le sezioni multiple
    const formData = new FormData();
    
    // Aggiungi solo i campi globali (docente e insegnamenti)
    const docenteField = document.getElementById('docente');
    formData.append('docente', docenteField.value);
    
    // Ottieni l'anno accademico selezionato usando AnnoAccademicoManager
    const annoAccademico = window.AnnoAccademicoManager.getSelectedAcademicYear() || new Date().getFullYear().toString();
    formData.append('anno_accademico', annoAccademico);
    
    // Gestisci gli insegnamenti usando InsegnamentiManager
    const insegnamentiSelected = window.InsegnamentiManager.getSelectedInsegnamenti();
    
    // Aggiungi gli insegnamenti al FormData
    if (insegnamentiSelected && insegnamentiSelected.length > 0) {
      insegnamentiSelected.forEach(codice => {
        formData.append('insegnamenti[]', codice);
      });
    } else {
      window.showMessage("Seleziona almeno un insegnamento", "Attenzione", "warning");
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
        // Se le date di iscrizione sono vuote, calcolale automaticamente
        if (!fields.inizioIscrizione || !fields.fineIscrizione) {
          const appelloDate = new Date(fields.dataora);
          
          // Inizio iscrizione: 30 giorni prima
          const inizio = new Date(appelloDate);
          inizio.setDate(appelloDate.getDate() - 30);
          
          // Fine iscrizione: 1 giorno prima
          const fine = new Date(appelloDate);
          fine.setDate(appelloDate.getDate() - 1);
          
          // Formatta le date in YYYY-MM-DD
          const pad = n => n.toString().padStart(2, '0');
          const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          
          fields.inizioIscrizione = fields.inizioIscrizione || format(inizio);
          fields.fineIscrizione = fields.fineIscrizione || format(fine);
        }
        
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
      window.showMessage("Compila almeno una sezione di appello valida", "Errore", "error");
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
        window.FormEsameAutosave.clearSavedData();
        
        window.showMessage(data.message, "Successo", "notification");
        
        // Ricarica il calendario
        window.calendar.refetchEvents();
        
        // Chiudi il form
        window.EsameForm.hideForm(true, true); // cleanup provisional events e autosave
      } else {
        window.showMessage(data.message, "Errore", "error");
      }
    })
    .catch(error => {
      console.error('Errore di rete:', error);
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
    combineTimeValues,
    parseTimeString,
    calculateAndSetInscriptionDates,
    calculateAndSetInscriptionDatesForSection
  };
}());

// Espone il modulo globalmente
window.FormEsameData = FormEsameData;