document.addEventListener('DOMContentLoaded', function() {
  // Modulo per la gestione della modifica degli esami
  const EditEsame = (function() {
    // Verifica dipendenze
    if (!window.FormEsameData) {
      throw new Error('FormEsameData non è caricato');
    }
    if (!window.FormEsameControlli) {
      throw new Error('FormEsameControlli non è caricato');
    }

    let currentExamData = null;

    // Carica i dettagli di un esame per la modifica
    async function loadExamForEdit(examId) {
      return fetch(`/api/get-esame-by-id?id=${examId}`)
        .then(response => response.json())
        .then(async data => {
          if (data.success) {
            currentExamData = data.esame; // Salva i dati per submitModifiedExam e fillGlobalFields
            await fillFormForEdit(data.esame); // Await per la compilazione asincrona
            return data.esame;
          } else {
            console.error('Errore nel caricamento dell\'esame:', data.message);
            if (window.FormEsameControlli && window.FormEsameControlli.showValidationError) {
              window.FormEsameControlli.showValidationError(data.message || 'Errore nel caricamento dell\'esame');
            }
            throw new Error(data.message || 'Errore nel caricamento dell\'esame');
          }
        });
    }

    // Compila il form con i dati dell'esame per la modifica
    async function fillFormForEdit(examData) {
      if (!examData) return;

      // Reset sezioni esistenti
      if (window.EsameAppelli) {
        window.EsameAppelli.resetSections();
      }

      // Aggiungi una sezione per l'esame
      if (window.EsameAppelli && window.EsameAppelli.addDateSection) {
        try {
          const sectionId = await window.EsameAppelli.addDateSection(); // Attendere la creazione
          if (sectionId) {
            await fillSectionWithExamData(sectionId, examData); // Attendere il popolamento della sezione
          } else {
            console.error("Errore: impossibile creare la sezione per la modifica.");
            if (window.FormEsameControlli) window.FormEsameControlli.showValidationError("Impossibile preparare il form per la modifica.");
            return;
          }
        } catch (error) {
          console.error("Errore durante l'aggiunta della sezione per la modifica:", error);
          if (window.FormEsameControlli) window.FormEsameControlli.showValidationError("Errore nella preparazione del form.");
          return;
        }
      }

      // Compila campi globali
      fillGlobalFields(examData);
    }

    // Compila i campi globali del form
    function fillGlobalFields(examData) {
      // Docente
      const docenteField = document.getElementById('docente');
      if (docenteField && examData.docente) docenteField.value = examData.docente;

      // Insegnamento
      if (window.InsegnamentiManager && examData.insegnamento_codice) {
        setTimeout(() => {
          // Pulisci selezioni precedenti
          window.InsegnamentiManager.clearSelection();
          // Seleziona l'insegnamento corretto
          window.InsegnamentiManager.selectInsegnamento(examData.insegnamento_codice, {
            semestre: examData.semestre || 1,
            anno_corso: examData.anno_corso || 1,
            cds: examData.cds_codice || ""
          });
          const multiSelectBox = document.getElementById("insegnamentoBox");
          if (multiSelectBox) {
            // Sincronizza l'UI del multi-select
            window.InsegnamentiManager.syncUI(multiSelectBox, [{
              codice: examData.insegnamento_codice,
              titolo: examData.insegnamento_titolo // Assicurati che questo campo sia disponibile
            }]);
          }
        }, 200); // Delay per assicurare che InsegnamentiManager sia pronto
      }
    }

    // Compila una sezione specifica con i dati dell'esame
    async function fillSectionWithExamData(sectionId, examData) {
      const section = document.getElementById(sectionId);
      if (!section) return;

      // Estrai il numero della sezione dall'ID
      const sectionCounter = sectionId.split('_')[1] || '1';

      // Campi della sezione
      const fieldMappings = [
        { field: 'descrizione', value: examData.descrizione, selectorPrefix: 'descrizione' },
        { field: 'data_appello', value: examData.data_appello, selectorPrefix: 'dataora' },
        { field: 'data_inizio_iscrizione', value: examData.data_inizio_iscrizione, selectorPrefix: 'inizioIscrizione' },
        { field: 'data_fine_iscrizione', value: examData.data_fine_iscrizione, selectorPrefix: 'fineIscrizione' },
        { field: 'note_appello', value: examData.note_appello, selectorPrefix: 'note' },
        { field: 'verbalizzazione', value: examData.verbalizzazione, selectorPrefix: 'verbalizzazione' },
        { field: 'tipo_esame', value: examData.tipo_esame, selectorPrefix: 'tipoEsame' }
      ];

      // Compila i campi di testo e select
      fieldMappings.forEach(({ value, selectorPrefix }) => {
        if (value !== undefined && value !== null) {
          const element = section.querySelector(`[id^="${selectorPrefix}_${sectionCounter}"]`);
          if (element) element.value = value;
        }
      });

      // Gestione ora
      if (examData.ora_appello) {
        const [hours, minutes] = examData.ora_appello.split(':');
        const oraH = section.querySelector(`[id^="ora_h_${sectionCounter}"]`);
        const oraM = section.querySelector(`[id^="ora_m_${sectionCounter}"]`);
        
        if (oraH) oraH.value = hours;
        if (oraM) oraM.value = minutes;

        // Aggiorna aule e poi imposta l'aula
        if (window.EsameAppelli && window.EsameAppelli.updateAuleForSection) {
          try {
            await window.EsameAppelli.updateAuleForSection(sectionCounter);
            // Piccolo delay per permettere al DOM di aggiornarsi dopo populateAulaSelect
            await new Promise(resolve => setTimeout(resolve, 150)); 
            
            const aulaSelect = section.querySelector(`[id^="aula_${sectionCounter}"]`);
            if (aulaSelect && examData.aula) {
              if (Array.from(aulaSelect.options).some(opt => opt.value === examData.aula)) {
                aulaSelect.value = examData.aula;
              } else {
                console.warn(`Aula "${examData.aula}" non trovata nell'elenco per l'Appello ${sectionCounter}. Aggiunta come opzione.`);
                const newOption = document.createElement('option');
                newOption.value = examData.aula;
                newOption.textContent = examData.aula + " (salvata)";
                aulaSelect.appendChild(newOption);
                aulaSelect.value = examData.aula; 
              }
            }
          } catch (error) {
            console.error(`Errore durante l'aggiornamento delle aule per l'Appello ${sectionCounter}:`, error);
          }
        }
      }

      // Gestione durata
      if (examData.durata_appello) {
        const durata = parseInt(examData.durata_appello);
        const ore = Math.floor(durata / 60);
        const minuti = durata % 60;
        
        const durataH = section.querySelector(`[id^="durata_h_${sectionCounter}"]`);
        const durataM = section.querySelector(`[id^="durata_m_${sectionCounter}"]`);
        
        if (durataH) durataH.value = ore.toString();
        if (durataM) durataM.value = minuti.toString().padStart(2, '0');
        // Aggiorna il campo hidden durata
        if (window.EsameAppelli && window.EsameAppelli.combineDurataForSection) {
            window.EsameAppelli.combineDurataForSection(sectionCounter);
        }
      }

      // Checkbox mostra nel calendario
      if (examData.hasOwnProperty('mostra_nel_calendario')) {
        const checkbox = section.querySelector(`[id^="mostra_nel_calendario_${sectionCounter}"]`);
        if (checkbox) checkbox.checked = !!examData.mostra_nel_calendario;
      }

      // Radio buttons tipo appello
      if (examData.tipo_appello) {
        const radioId = `tipoAppello${examData.tipo_appello}_${sectionCounter}`;
        const radio = document.getElementById(radioId); // ID è unico
        if (radio) {
          radio.checked = true;
          // Trigger change per aggiornare la verbalizzazione
          const event = new Event('change', { bubbles: true });
          radio.dispatchEvent(event);
          // La verbalizzazione potrebbe essere sovrascritta dal fieldMappings, quindi la impostiamo di nuovo se necessario
          // dopo che l'evento change ha aggiornato le opzioni.
          setTimeout(() => {
            const verbalizzazioneSelect = section.querySelector(`[id^="verbalizzazione_${sectionCounter}"]`);
            if (verbalizzazioneSelect && examData.verbalizzazione) {
                verbalizzazioneSelect.value = examData.verbalizzazione;
            }
          }, 50);
        }
      }
    }

    // Configura la modalità di modifica
    function setupEditMode(examId) {
      // Imposta l'ID dell'esame nel campo nascosto
      const examIdField = document.getElementById('examIdField');
      if (examIdField) examIdField.value = examId;

      // Aggiorna il titolo del form
      const formTitle = document.querySelector('.form-header h2');
      if (formTitle) formTitle.textContent = 'Modifica Esame';

      // Configura i pulsanti
      setupEditButtons(examId);
    }

    // Configura i pulsanti per la modalità di modifica
    function setupEditButtons(examId) {
      const formActions = document.querySelector('.form-actions');
      if (!formActions) return;

      formActions.innerHTML = '';

      // Pulsante Modifica
      const modifyBtn = document.createElement('button');
      modifyBtn.type = 'submit';
      modifyBtn.className = 'form-button';
      modifyBtn.textContent = 'Modifica';
      modifyBtn.addEventListener('click', handleModifySubmit);
      formActions.appendChild(modifyBtn);

      // Pulsante Elimina
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'form-button danger';
      deleteBtn.textContent = 'Elimina Esame';
      deleteBtn.addEventListener('click', () => handleDeleteExam(examId));
      formActions.appendChild(deleteBtn);

      // Pulsante bypass per admin
      window.FormEsameControlli.isUserAdmin().then(isAdmin => {
        if (isAdmin) {
          const bypassBtn = document.createElement('button');
          bypassBtn.type = 'button';
          bypassBtn.className = 'form-button bypass'; // Classe per styling
          bypassBtn.textContent = 'Modifica senza controlli';
          bypassBtn.addEventListener('click', handleModifyWithBypass);
          formActions.appendChild(bypassBtn);
        }
      });
    }

    // Gestisce la modifica standard
    function handleModifySubmit(e) {
      e.preventDefault();
      
      if (!window.FormEsameControlli.validateFormForEdit()) return; // Usa validazione per modifica
      
      submitModifiedExam(false);
    }

    // Gestisce la modifica con bypass
    function handleModifyWithBypass(e) {
      e.preventDefault();
      
      window.FormEsameControlli.isUserAdmin().then(isAdmin => {
        if (!isAdmin) {
          window.FormEsameControlli.showValidationError("Solo gli amministratori possono usare questa funzione.");
          return;
        }
        
        if (!window.FormEsameControlli.validateFormForEditWithBypass()) return; // Usa validazione bypass per modifica
        
        submitModifiedExam(true);
      });
    }

    // Invia i dati dell'esame modificato
    function submitModifiedExam(bypassChecks = false) {
      if (!currentExamData) {
        window.FormEsameControlli.showValidationError("Dati dell'esame non disponibili per la modifica.");
        return;
      }

      // Raccoglie i dati dalla prima sezione
      const firstSection = document.querySelector('.date-appello-section');
      if (!firstSection) {
        window.FormEsameControlli.showValidationError("Nessuna sezione di appello trovata per la modifica.");
        return; // Aggiunto return
      }

      const examDataFromForm = collectExamDataFromSection(firstSection);
      examDataFromForm.id = currentExamData.id;
      examDataFromForm.bypass_checks = bypassChecks;

      fetch('/api/update-esame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(examDataFromForm)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.showMessage(data.message, "Successo", "success");
          
          // Ricarica il calendario se disponibile
          if (window.calendar) {
            window.calendar.refetchEvents();
          }
          
          // Chiudi il form
          if (window.EsameForm && window.EsameForm.hideForm) {
            window.EsameForm.hideForm(true, false);
          }
          
          // Ricarica la pagina se siamo in mieiEsami.html
          if (window.location.pathname.includes('mieiEsami.html')) {
            setTimeout(() => location.reload(), 1000);
          }
        } else {
          window.FormEsameControlli.showValidationError(data.message);
        }
      })
      .catch(error => {
        console.error('Errore nella modifica:', error);
        window.FormEsameControlli.showValidationError('Errore nella comunicazione con il server');
      });
    }

    // Raccoglie i dati dell'esame da una sezione
    function collectExamDataFromSection(section) {
      const sectionId = section.id;
      const sectionCounter = sectionId.split('_')[1] || '1';

      const getFieldValue = (prefix) => {
        const field = section.querySelector(`[id^="${prefix}_${sectionCounter}"]`);
        return field ? field.value : null;
      };

      const getCheckedValue = (prefix) => {
        const field = section.querySelector(`[id^="${prefix}_${sectionCounter}"]`);
        return field ? field.checked : false;
      };

      const getRadioValue = (namePrefix) => {
        const radio = section.querySelector(`input[name^="${namePrefix}_${sectionCounter}"]:checked`);
        return radio ? radio.value : null;
      };

      // Calcola durata in minuti
      const durataH = parseInt(getFieldValue('durata_h')) || 0;
      const durataM = parseInt(getFieldValue('durata_m')) || 0;
      const durataTotale = (durataH * 60) + durataM;

      // Calcola periodo dall'ora
      const oraHField = getFieldValue('ora_h');
      const oraH = parseInt(oraHField) || 0;
      const periodo = oraH >= 14 ? 1 : 0;

      return {
        // Campi globali (presi da currentExamData o dal form se modificabili globalmente)
        docente: document.getElementById('docente')?.value || currentExamData.docente,
        // L'insegnamento è più complesso da raccogliere qui, di solito non cambia in modifica esame singolo
        // Se dovesse cambiare, andrebbe gestito tramite InsegnamentiManager.getSelectedInsegnamenti()
        // Per ora, assumiamo che l'insegnamento non cambi o sia gestito a livello superiore.
        // Se l'insegnamento è un array di codici:
        // insegnamento_codice: window.InsegnamentiManager ? window.InsegnamentiManager.getSelectedInsegnamenti()[0] : currentExamData.insegnamento_codice,
        // Se è un singolo codice:
        insegnamento_codice: window.InsegnamentiManager && window.InsegnamentiManager.getSelectedInsegnamenti().length > 0 
                            ? window.InsegnamentiManager.getSelectedInsegnamenti()[0].codice // Assumendo che getSelectedInsegnamenti restituisca oggetti {codice, titolo}
                            : currentExamData.insegnamento_codice,


        // Campi specifici della sezione
        descrizione: getFieldValue('descrizione'),
        tipo_appello: getRadioValue('tipo_appello_radio') || 'PF',
        aula: getFieldValue('aula'),
        data_appello: getFieldValue('dataora'),
        data_inizio_iscrizione: getFieldValue('inizioIscrizione'),
        data_fine_iscrizione: getFieldValue('fineIscrizione'),
        ora_appello: `${getFieldValue('ora_h') || '00'}:${getFieldValue('ora_m') || '00'}`,
        durata_appello: durataTotale,
        periodo: periodo,
        verbalizzazione: getFieldValue('verbalizzazione'),
        tipo_esame: getFieldValue('tipoEsame'),
        note_appello: getFieldValue('note'), // Corretto da 'note' a 'note_appello' se il server si aspetta questo
        mostra_nel_calendario: getCheckedValue('mostra_nel_calendario')
      };
    }

    // Gestisce l'eliminazione dell'esame
    function handleDeleteExam(examId) {
      if (!confirm('Sei sicuro di voler eliminare questo esame?')) return;

      fetch('/api/delete-esame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: examId })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.showMessage(data.message, "Successo", "success");
          
          // Chiudi il form
          if (window.EsameForm && window.EsameForm.hideForm) {
            window.EsameForm.hideForm(true, false);
          }
          
          // Ricarica la pagina se siamo in mieiEsami.html
          if (window.location.pathname.includes('mieiEsami.html')) {
            setTimeout(() => location.reload(), 1000);
          } else if (window.calendar) {
            window.calendar.refetchEvents();
          }
        } else {
          window.FormEsameControlli.showValidationError(data.message);
        }
      })
      .catch(error => {
        console.error('Errore nell\'eliminazione:', error);
        window.FormEsameControlli.showValidationError('Errore nella comunicazione con il server');
      });
    }

    // Funzione principale per aprire un esame in modifica
    async function editExam(examId) {
      try {
        const examData = await loadExamForEdit(examId);
        setupEditMode(examId); // Configura titolo, pulsanti, ID esame
        return examData; // Restituisce i dati per coerenza o utilizzo futuro
      } catch (error) {
        console.error('Errore dettagliato durante la modifica dell\'esame:', error);
        // Non mostrare l'errore qui se loadExamForEdit lo fa già
        // if (window.FormEsameControlli && window.FormEsameControlli.showValidationError) {
        //   window.FormEsameControlli.showValidationError(`Errore fatale nell'apertura del modulo di modifica: ${error.message}`);
        // }
        throw error; // Rilancia per essere gestito da chi chiama editExam
      }
    }

    // Interfaccia pubblica
    return {
      editExam,
      loadExamForEdit,
      fillFormForEdit,
      fillSectionWithExamData,
      setupEditMode,
      handleDeleteExam,
      collectExamDataFromSection
    };
  }());

  // Espone il modulo globalmente
  window.EditEsame = EditEsame;
});
