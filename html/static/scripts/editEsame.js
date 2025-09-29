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
              .then(async response => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message);
        }
        return response.json();
      })
      .then(async data => {
        if (data.success) {
          currentExamData = data.esame;
          await fillFormForEdit(data.esame);
          return data.esame;
        } else {
          if (window.showMessage) {
            window.showMessage(data.message, "Errore caricamento esame", "error");
          }
          throw new Error(data.message);
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
            window.showMessage("Impossibile preparare il form per la modifica", "Errore inizializzazione form", "error");
            return;
          }
        } catch (error) {
          console.error("Errore durante l'aggiunta della sezione per la modifica:", error);
          window.showMessage(`Errore nella preparazione del form: ${error.message}`, "Errore inizializzazione form", "error");
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

      // Insegnamento - mostra l'insegnamento ma bloccalo per la modifica
      if (examData.insegnamento_codice && examData.insegnamento_titolo) {
        const multiSelectBox = document.getElementById("insegnamentoBox");
        const dropdownElement = document.getElementById("insegnamentoDropdown");
        
        if (multiSelectBox) {
          // Mostra l'insegnamento dell'esame in modalità sola lettura
          const cdsText = examData.cds_nome && examData.cds_codice 
            ? ` (${examData.cds_nome} - ${examData.cds_codice})` 
            : '';
          
          multiSelectBox.innerHTML = `
            <div class="multi-select-tag">
              ${examData.insegnamento_titolo}${cdsText}
            </div>
          `;
          
          // Disabilita il multi-select per impedire modifiche
          multiSelectBox.classList.add('disabled');
          multiSelectBox.style.pointerEvents = 'none';
          multiSelectBox.style.opacity = '0.7';
          
          // Aggiungi tooltip per spiegare perché è disabilitato
          multiSelectBox.title = "L'insegnamento non può essere modificato durante la modifica di un esame esistente";
        }
        
        // Nascondi il dropdown per impedire la selezione
        if (dropdownElement) {
          dropdownElement.style.display = 'none';
        }
        
        // NON aggiungere l'insegnamento a InsegnamentiManager per evitare interferenze
        // L'insegnamento viene gestito direttamente nei dati del form
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
      } else {
        // Durata vuota - imposta valori di default vuoti
        const durataH = section.querySelector(`[id^="durata_h_${sectionCounter}"]`);
        const durataM = section.querySelector(`[id^="durata_m_${sectionCounter}"]`);

        if (durataH) durataH.value = '';
        if (durataM) durataM.value = '';
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

      // Pulsante Duplica
      const duplicateBtn = document.createElement('button');
      duplicateBtn.type = 'button';
      duplicateBtn.className = 'form-button duplicate';
      duplicateBtn.textContent = 'Duplica';
      duplicateBtn.addEventListener('click', () => handleDuplicateExam(examId));
      formActions.appendChild(duplicateBtn);

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
          window.showMessage("Solo gli amministratori possono utilizzare questa funzione", "Accesso negato", "error");
          return;
        }

        if (!window.FormEsameControlli.validateFormForEditWithBypass()) return; // Usa validazione bypass per modifica

        submitModifiedExam(true);
      });
    }

    // Invia i dati dell'esame modificato
    function submitModifiedExam(bypassChecks = false) {
      if (!currentExamData) {
        window.showMessage("Dati dell'esame non disponibili per la modifica", "Errore dati esame", "error");
        return;
      }

      // Raccoglie i dati dalla prima sezione
      const firstSection = document.querySelector('.date-appello-section');
      if (!firstSection) {
        window.showMessage("Nessuna sezione di appello trovata per la modifica", "Errore form", "error");
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
      .then(async response => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message);
        }
        return response.json();
      })
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
          window.showMessage(data.message, "Errore modifica esame", "error");
        }
      })
      .catch(error => {
        window.showMessage(error.message, "Errore modifica esame", "error");
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
      const durataTotale = (durataH === 0 && durataM === 0) ? null : (durataH * 60) + durataM;

      // Calcola periodo dall'ora
      const oraHField = getFieldValue('ora_h');
      const oraH = parseInt(oraHField) || 0;
      const periodo = oraH >= 14 ? 1 : 0;

      return {
        // Campi globali (presi da currentExamData o dal form se modificabili globalmente)
        docente: document.getElementById('docente')?.value || currentExamData.docente,
        // L'insegnamento è bloccato in modifica, quindi usa sempre quello dell'esame corrente
        insegnamento_codice: currentExamData.insegnamento_codice,

        // Campi specifici della sezione
        descrizione: getFieldValue('descrizione'),
        tipo_appello: getRadioValue('tipo_appello_radio') || 'PF',
        aula: getFieldValue('aula') || null,
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

    // Gestisce la duplicazione dell'esame
    function handleDuplicateExam(examId) {
      if (!currentExamData) {
        window.showMessage("Dati dell'esame non disponibili per la duplicazione", "Errore duplicazione esame", "error");
        return;
      }

      // Entra in modalità duplicazione
      enterDuplicationMode();
    }

    // Attiva la modalità duplicazione
    function enterDuplicationMode() {
      // Nascondi tutti i pulsanti tranne "Esci dalla duplicazione" e "Conferma"
      const formActions = document.querySelector('.form-actions');
      if (formActions) {
        formActions.innerHTML = '';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'form-button success';
        confirmBtn.textContent = 'Conferma';
        confirmBtn.addEventListener('click', handleConfirmDuplication);
        formActions.appendChild(confirmBtn);
        
        const exitDuplicationBtn = document.createElement('button');
        exitDuplicationBtn.type = 'button';
        exitDuplicationBtn.className = 'form-button danger';
        exitDuplicationBtn.textContent = 'Esci dalla duplicazione';
        exitDuplicationBtn.addEventListener('click', exitDuplicationMode);
        formActions.appendChild(exitDuplicationBtn);
      }

      // Modifica il titolo del form
      const formTitle = document.querySelector('.form-header h2');
      if (formTitle) {
        formTitle.textContent = 'Duplica Esame';
      }

      // Cambia lo sfondo della sezione esistente e il titolo
      const firstSection = document.querySelector('.date-appello-section');
      if (firstSection) {
        firstSection.style.backgroundColor = '#e3f2fd'; // Azzurrino/blu chiaro
        firstSection.style.border = '2px solid #2196f3';
        
        const sectionTitle = firstSection.querySelector('.date-appello-title');
        if (sectionTitle) {
          sectionTitle.textContent = 'Appello da duplicare';
          sectionTitle.style.color = '#1976d2';
        }

        // Disabilita tutti i controlli nella sezione da duplicare
        const inputs = firstSection.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => {
          input.disabled = true;
          input.style.opacity = '0.7';
        });
      }

      // Mostra notifica nella sidebar
      showDuplicationNotification();

      // Attiva la modalità duplicazione nel calendario
      if (window.calendar) {
        window.isDuplicationMode = true;
        
        // Aggiunge listener per i click sulle date del calendario
        setupCalendarDuplicationMode();
      }
    }

    // Gestisce la conferma della duplicazione
    function handleConfirmDuplication() {
      // Raccoglie tutte le sezioni duplicate (esclusa la prima che è l'originale)
      const duplicatedSections = document.querySelectorAll('.date-appello-section:not(:first-child)');
      
      if (duplicatedSections.length === 0) {
        window.showMessage('Nessun appello duplicato da inserire. Clicca sul calendario per aggiungere nuove date.', "Nessun appello duplicato", "warning");
        return;
      }

      // Prepara i dati per l'inserimento
      const examDataArray = [];
      
      duplicatedSections.forEach(section => {
        const examData = collectExamDataFromSection(section);
        // Rimuovi l'ID per indicare che è un nuovo esame
        delete examData.id;
        examDataArray.push(examData);
      });

      // Valida i dati prima dell'inserimento
      if (!validateDuplicatedExams(examDataArray)) {
        return;
      }

      // Invia i dati al server
      submitDuplicatedExams(examDataArray);
    }

    // Valida gli esami duplicati
    function validateDuplicatedExams(examDataArray) {
      for (let i = 0; i < examDataArray.length; i++) {
        const examData = examDataArray[i];
        
        // Controlli base
        if (!examData.data_appello) {
          window.showMessage(`Appello ${i + 2}: Data mancante`, "Errore validazione duplicazione", "error");
          return false;
        }
        
        if (!examData.ora_appello || examData.ora_appello === '00:00') {
          window.showMessage(`Appello ${i + 2}: Ora mancante`, "Errore validazione duplicazione", "error");
          return false;
        }
        
        if (!examData.descrizione || examData.descrizione.trim() === '') {
          window.showMessage(`Appello ${i + 2}: Descrizione mancante`, "Errore validazione duplicazione", "error");
          return false;
        }
      }
      
      return true;
    }

    // Invia gli esami duplicati al server
    function submitDuplicatedExams(examDataArray) {
      // Prepara i dati nel formato del form esistente
      const formData = new FormData();
      
      // Campi globali
      formData.append('docente', currentExamData.docente);
      formData.append('anno_accademico', currentExamData.anno_accademico || new Date().getFullYear());
      formData.append('insegnamenti[]', currentExamData.insegnamento_codice);

      // Campi delle sezioni
      examDataArray.forEach(examData => {
        formData.append('descrizione[]', examData.descrizione);
        formData.append('dataora[]', examData.data_appello);
        formData.append('ora_h[]', examData.ora_appello.split(':')[0]);
        formData.append('ora_m[]', examData.ora_appello.split(':')[1]);
        formData.append('durata[]', examData.durata_appello || '');
        formData.append('aula[]', examData.aula || '');
        formData.append('inizioIscrizione[]', examData.data_inizio_iscrizione);
        formData.append('fineIscrizione[]', examData.data_fine_iscrizione);
        formData.append('verbalizzazione[]', examData.verbalizzazione);
        formData.append('tipoEsame[]', examData.tipo_esame || '');
        formData.append('note[]', examData.note_appello || '');
        formData.append('tipo_appello_radio[]', examData.tipo_appello);
        formData.append('mostra_nel_calendario[]', examData.mostra_nel_calendario ? 'true' : 'false');
      });

      // Invia al server
      fetch('/api/inserisci-esame', {
        method: 'POST',
        body: formData
      })
      .then(async response => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message);
        }
        return response.json();
      })
      .then(data => {
        if (data.status === 'success') {
          window.showMessage(
            `${examDataArray.length} esami duplicati inseriti con successo`,
            'Duplicazione completata',
            'success'
          );

          // Ricarica il calendario
          if (window.calendar) {
            window.calendar.refetchEvents();
          }

          // Esci dalla modalità duplicazione
          exitDuplicationMode();

          // Chiudi il form
          if (window.EsameForm && window.EsameForm.hideForm) {
            window.EsameForm.hideForm(true, false);
          }

          // Ricarica la pagina se siamo in mieiEsami.html
          if (window.location.pathname.includes('mieiEsami.html')) {
            setTimeout(() => location.reload(), 1000);
          }
        } else {
          window.showMessage(data.message, "Errore duplicazione esame", "error");
        }
      })
      .catch(error => {
        window.showMessage(error.message, "Errore duplicazione esami", "error");
      });
    }

    // Esce dalla modalità duplicazione
    function exitDuplicationMode() {
      // Reset flag duplicazione
      window._duplicatingDate = null;
      
      // Pulisci eventi provvisori di duplicazione
      if (window.calendar && window.provisionalEvents) {
        const duplicationEvents = window.provisionalEvents.filter(event => 
          event.extendedProps?.isDuplication === true
        );
        
        duplicationEvents.forEach(event => {
          const calendarEvent = window.calendar.getEventById(event.id);
          if (calendarEvent) {
            calendarEvent.remove();
          }
        });
        
        // Rimuovi gli eventi di duplicazione dall'array
        window.provisionalEvents = window.provisionalEvents.filter(event => 
          event.extendedProps?.isDuplication !== true
        );
      }
      
      // Ripristina i pulsanti originali
      setupEditButtons(currentExamData?.id);

      // Ripristina il titolo
      const formTitle = document.querySelector('.form-header h2');
      if (formTitle) {
        formTitle.textContent = 'Modifica Esame';
      }

      // Ripristina lo sfondo della sezione originale
      const firstSection = document.querySelector('.date-appello-section');
      if (firstSection) {
        firstSection.style.backgroundColor = '';
        firstSection.style.border = '';
        
        const sectionTitle = firstSection.querySelector('.date-appello-title');
        if (sectionTitle) {
          sectionTitle.textContent = 'Appello 1';
          sectionTitle.style.color = '';
        }

        // Riabilita tutti i controlli
        const inputs = firstSection.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => {
          input.disabled = false;
          input.style.opacity = '';
        });
      }

      // Rimuovi sezioni aggiuntive create durante la duplicazione
      const additionalSections = document.querySelectorAll('.date-appello-section:not(:first-child)');
      additionalSections.forEach(section => {
        section.remove();
      });

      // Reset counter e date
      if (window.EsameAppelli) {
        window.EsameAppelli.resetSections();
        // Ri-aggiungi la sezione originale
        fillFormForEdit(currentExamData);
      }

      // Nascondi notifica
      hideDuplicationNotification();

      // Disattiva modalità duplicazione nel calendario
      if (window.calendar) {
        window.isDuplicationMode = false;
        removeCalendarDuplicationMode();
      }
    }

    // Mostra la notifica di duplicazione attivata
    function showDuplicationNotification() {
      // Usa la sidebar per la notifica invece del floating popup
      if (window.showMessage) {
        window.showMessage(
          'Clicca sul calendario le date dei nuovi appelli',
          'Duplicazione esame attivata',
          'info',
          { timeout: 0 } // Notifica permanente fino a quando non si esce dalla modalità
        );
      }
    }

    // Nascondi la notifica di duplicazione
    function hideDuplicationNotification() {
      // La notifica nella sidebar si chiuderà automaticamente quando si esce dalla modalità
      // o può essere chiusa manualmente dall'utente
    }

    // Setup modalità duplicazione nel calendario
    function setupCalendarDuplicationMode() {
      if (!window.calendar) return;

      // Aggiungi listener per click sulle date
      window.calendar.on('dateClick', handleCalendarDateClickForDuplication);
    }

    // Rimuovi modalità duplicazione dal calendario
    function removeCalendarDuplicationMode() {
      if (!window.calendar) return;

      // Rimuovi listener
      window.calendar.off('dateClick', handleCalendarDateClickForDuplication);
    }

    // Gestisce i click sulle date durante la duplicazione
    async function handleCalendarDateClickForDuplication(info) {
      if (!window.isDuplicationMode || !currentExamData) {
        return;
      }

      const clickedDate = info.dateStr;
      
      // Previeni chiamate multiple per la stessa data
      if (window._duplicatingDate === clickedDate) {
        return;
      }
      
      // Imposta flag temporaneo per prevenire duplicazioni
      window._duplicatingDate = clickedDate;
      
      // Verifica che la data non sia nel passato
      const today = new Date();
      const selectedDate = new Date(clickedDate);
      if (selectedDate < today) {
        window._duplicatingDate = null; // Reset flag
        window.showMessage('Non è possibile selezionare date nel passato', "Data non valida", "warning");
        return;
      }

      // Verifica che non ci sia già un esame in quella data
      const existingEvent = window.calendar.getEvents().find(event => {
        const eventDate = event.start;
        return eventDate && eventDate.toISOString().split('T')[0] === clickedDate;
      });

      if (existingEvent) {
        window._duplicatingDate = null; // Reset flag
        window.showMessage('Esiste già un evento in questa data', "Data non disponibile", "warning");
        return;
      }

      // Crea una nuova sezione con i dati precompilati
      try {
        const newSectionId = await window.EsameAppelli.addDateSection(clickedDate, { isDuplication: true });
        
        if (newSectionId) {
          // Precompila la sezione con i dati dell'esame originale
          await precompileDuplicatedSection(newSectionId, clickedDate);
        }
      } catch (error) {
        console.error('Errore nella creazione della sezione duplicata:', error);
        window.showMessage(`Errore nella creazione della nuova sezione: ${error.message}`, "Errore duplicazione", "error");
      } finally {
        // Reset flag dopo un piccolo delay
        setTimeout(() => {
          window._duplicatingDate = null;
        }, 100);
      }
    }

    // Precompila una sezione duplicata con i dati dell'esame originale
    async function precompileDuplicatedSection(sectionId, newDate) {
      if (!currentExamData || !sectionId) {
        return;
      }

      const section = document.getElementById(sectionId);
      if (!section) {
        return;
      }

      // Estrai il numero della sezione
      const sectionCounter = sectionId.split('_')[1] || '1';

      // Precompila i campi con i dati dell'esame originale
      const fieldMappings = [
        { field: 'descrizione', value: currentExamData.descrizione, selectorPrefix: 'descrizione' },
        { field: 'note_appello', value: currentExamData.note_appello, selectorPrefix: 'note' },
        { field: 'verbalizzazione', value: currentExamData.verbalizzazione, selectorPrefix: 'verbalizzazione' },
        { field: 'tipo_esame', value: currentExamData.tipo_esame, selectorPrefix: 'tipoEsame' }
      ];

      // Compila i campi di testo e select
      fieldMappings.forEach(({ field, value, selectorPrefix }) => {
        if (value !== undefined && value !== null) {
          const selector = `[id^="${selectorPrefix}_${sectionCounter}"]`;
          const element = section.querySelector(selector);
          if (element) element.value = value;
        }
      });

      // Precompila l'ora (stessa dell'originale)
      if (currentExamData.ora_appello) {
        const [hours, minutes] = currentExamData.ora_appello.split(':');
        const oraH = section.querySelector(`[id^="ora_h_${sectionCounter}"]`);
        const oraM = section.querySelector(`[id^="ora_m_${sectionCounter}"]`);

        if (oraH) oraH.value = hours;
        if (oraM) oraM.value = minutes;

        // Aggiorna aule dopo aver impostato l'ora
        if (window.EsameAppelli && window.EsameAppelli.updateAuleForSection) {
          try {
            await window.EsameAppelli.updateAuleForSection(sectionCounter);
            // Piccolo delay per permettere al DOM di aggiornarsi
            await new Promise(resolve => setTimeout(resolve, 150));

            // Imposta la stessa aula se disponibile
            const aulaSelect = section.querySelector(`[id^="aula_${sectionCounter}"]`);
            if (aulaSelect && currentExamData.aula) {
              if (Array.from(aulaSelect.options).some(opt => opt.value === currentExamData.aula)) {
                aulaSelect.value = currentExamData.aula;
              }
            }
          } catch (error) {
            console.error(`Errore durante l'aggiornamento delle aule per la sezione duplicata ${sectionCounter}:`, error);
          }
        }
      }

      // Precompila la durata (stessa dell'originale)
      if (currentExamData.durata_appello) {
        const durata = parseInt(currentExamData.durata_appello);
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

      // Precompila checkbox e radio button (stessi dell'originale)
      if (currentExamData.hasOwnProperty('mostra_nel_calendario')) {
        const checkbox = section.querySelector(`[id^="mostra_nel_calendario_${sectionCounter}"]`);
        if (checkbox) checkbox.checked = !!currentExamData.mostra_nel_calendario;
      }

      if (currentExamData.tipo_appello) {
        const radioId = `tipoAppello${currentExamData.tipo_appello}_${sectionCounter}`;
        const radio = document.getElementById(radioId);
        
        if (radio) {
          radio.checked = true;
          // Trigger change per aggiornare la verbalizzazione
          const event = new Event('change', { bubbles: true });
          radio.dispatchEvent(event);
          
          // Re-imposta la verbalizzazione dopo il cambio
          setTimeout(() => {
            const verbalizzazioneSelect = section.querySelector(`[id^="verbalizzazione_${sectionCounter}"]`);
            if (verbalizzazioneSelect && currentExamData.verbalizzazione) {
              verbalizzazioneSelect.value = currentExamData.verbalizzazione;
            }
          }, 50);
        }
      }

      // Calcola automaticamente le date di iscrizione per la nuova data
      const newDateObj = new Date(newDate);
      const inizioIscrizione = new Date(newDateObj);
      inizioIscrizione.setDate(newDateObj.getDate() - 30);
      const fineIscrizione = new Date(newDateObj);
      fineIscrizione.setDate(newDateObj.getDate() - 1);

      const formatDate = d => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

      const inizioIscrizioneField = section.querySelector(`[id^="inizioIscrizione_${sectionCounter}"]`);
      const fineIscrizioneField = section.querySelector(`[id^="fineIscrizione_${sectionCounter}"]`);

      if (inizioIscrizioneField) inizioIscrizioneField.value = formatDate(inizioIscrizione);
      if (fineIscrizioneField) fineIscrizioneField.value = formatDate(fineIscrizione);

      // Aggiungi indicatore visivo per le sezioni duplicate
      section.style.border = '2px solid #4caf50';
      section.style.backgroundColor = '#f1f8e9';
      
      const sectionTitle = section.querySelector('.date-appello-title');
      if (sectionTitle) {
        sectionTitle.style.color = '#388e3c';
        
        // Calcola il numero corretto per l'appello duplicato al momento della creazione
        const allSectionsUpdated = document.querySelectorAll('.date-appello-section');
        const currentSectionIndex = Array.from(allSectionsUpdated).indexOf(section);
        const duplicateNumber = currentSectionIndex + 1; // +1 per numerazione 1-based
        
        sectionTitle.textContent = `Appello ${duplicateNumber} (Duplicato)`;
      }
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
      .then(async response => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message);
        }
        return response.json();
      })
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
          window.showMessage(data.message, "Errore eliminazione esame", "error");
        }
      })
      .catch(error => {
        window.showMessage(error.message, "Errore eliminazione esame", "error");
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
