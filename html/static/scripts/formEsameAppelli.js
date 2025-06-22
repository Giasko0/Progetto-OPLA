document.addEventListener('DOMContentLoaded', function() {
  // Gestione delle sezioni modulari per date e appelli
  const EsameAppelli = (function() {

    // Variabili per il tracking delle sezioni
    let dateAppelliCounter = 0;
    let selectedDates = [];
    let appellobTemplate = null;

    // Carica il template HTML inline per evitare fetch
    function getAppelloTemplate() {
      if (appellobTemplate) {
        return appellobTemplate;
      }
      
      // Template inline per evitare fetch HTTP
      appellobTemplate = `
        <div class="date-appello-header">
          <h4 class="date-appello-title">Appello COUNTER_PLACEHOLDER</h4>
          <button type="button" class="remove-date-btn" onclick="removeDateSection('SECTION_ID_PLACEHOLDER')">
            <span class="material-symbols-outlined">delete</span>
            Rimuovi
          </button>
        </div>
        <div class="date-appello-fields">
          <div class="two-column-layout">
            <div class="column">
              <div class="form-element">
                <label for="mostra_nel_calendario_COUNTER_PLACEHOLDER">Apertura appelli:</label>
                <input type="checkbox" id="mostra_nel_calendario_COUNTER_PLACEHOLDER" name="mostra_nel_calendario[]" class="form-checkbox" checked>
                <span class="tooltip">
                  <span class="material-symbols-outlined">help</span>
                  <span class="tooltiptext">Spunta quest'opzione se questo appello finirà sul calendario. Se l'opzione è spuntata l'esame conterà per il numero minimo di esami annuali.</span>
                </span>
              </div>
            </div>
            <div class="column">
              <div class="form-element">
                <div class="radio-group">
                  <input type="radio" id="tipoAppelloPF_COUNTER_PLACEHOLDER" name="tipo_appello_radio_COUNTER_PLACEHOLDER" value="PF" checked>
                  <label for="tipoAppelloPF_COUNTER_PLACEHOLDER">Prova Finale</label>
                  <input type="radio" id="tipoAppelloPP_COUNTER_PLACEHOLDER" name="tipo_appello_radio_COUNTER_PLACEHOLDER" value="PP">
                  <label for="tipoAppelloPP_COUNTER_PLACEHOLDER">Prova Parziale</label>
                </div>
              </div>
            </div>
          </div>
          
          <div class="form-element">
            <label for="descrizione_COUNTER_PLACEHOLDER">Descrizione*</label>
            <input type="text" id="descrizione_COUNTER_PLACEHOLDER" name="descrizione[]" class="form-input" placeholder="Inserisci una descrizione" required>
          </div>
          
          <div class="form-element">
            <label for="dataora_COUNTER_PLACEHOLDER">Data Appello*</label>
            <input type="date" id="dataora_COUNTER_PLACEHOLDER" name="dataora[]" class="form-input" value="DATE_PLACEHOLDER" required 
                   onchange="if(window.FormEsameData && window.FormEsameData.calculateAndSetInscriptionDates) { window.FormEsameData.calculateAndSetInscriptionDates(this.value); }">
          </div>
          
          <div class="two-column-layout">
            <div class="column">
              <div class="form-element">
                <label for="ora_COUNTER_PLACEHOLDER">Ora Appello*</label>
                <div class="time-select-container">
                  <select id="ora_h_COUNTER_PLACEHOLDER" name="ora_h[]" class="form-input" required>
                    <option value="" disabled selected hidden>Ora</option>
                    <option value="08">08</option>
                    <option value="09">09</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12">12</option>
                    <option value="13">13</option>
                    <option value="14">14</option>
                    <option value="15">15</option>
                    <option value="16">16</option>
                    <option value="17">17</option>
                    <option value="18">18</option>
                  </select>
                  <span class="time-separator">:</span>
                  <select id="ora_m_COUNTER_PLACEHOLDER" name="ora_m[]" class="form-input" required>
                    <option value="" disabled selected hidden>Min</option>
                    <option value="00">00</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="column">
              <div class="form-element">
                <label for="durata_h_COUNTER_PLACEHOLDER">Durata*</label>
                <div class="time-select-container">
                  <select id="durata_h_COUNTER_PLACEHOLDER" name="durata_h[]" class="form-input" required>
                    <option value="0">0 ore</option>
                    <option value="1">1 ora</option>
                    <option value="2" selected>2 ore</option>
                    <option value="3">3 ore</option>
                    <option value="4">4 ore</option>
                    <option value="5">5 ore</option>
                    <option value="6">6 ore</option>
                    <option value="7">7 ore</option>
                    <option value="8">8 ore</option>
                    <option value="9">9 ore</option>
                    <option value="10">10 ore</option>
                    <option value="11">11 ore</option>
                    <option value="12">12 ore</option>
                  </select>
                  <select id="durata_m_COUNTER_PLACEHOLDER" name="durata_m[]" class="form-input" required>
                    <option value="00" selected>0 minuti</option>
                    <option value="15">15 minuti</option>
                    <option value="30">30 minuti</option>
                    <option value="45">45 minuti</option>
                  </select>
                  <input type="hidden" id="durata_COUNTER_PLACEHOLDER" name="durata[]" class="form-input">
                </div>
              </div>
            </div>
          </div>
          
          <div class="form-element">
            <label for="aula_COUNTER_PLACEHOLDER">Aula*</label>
            <select id="aula_COUNTER_PLACEHOLDER" name="aula[]" class="form-input" required>
              <option value="" disabled selected hidden>Seleziona prima data e ora</option>
            </select>
          </div>
          
          <div class="two-column-layout">
            <div class="column">
              <div class="form-element">
                <label for="inizioIscrizione_COUNTER_PLACEHOLDER">Data inizio iscrizione</label>
                <input type="date" id="inizioIscrizione_COUNTER_PLACEHOLDER" name="inizioIscrizione[]" class="form-input">
              </div>
            </div>
            <div class="column">
              <div class="form-element">
                <label for="fineIscrizione_COUNTER_PLACEHOLDER">Data fine iscrizione</label>
                <input type="date" id="fineIscrizione_COUNTER_PLACEHOLDER" name="fineIscrizione[]" class="form-input">
              </div>
            </div>
          </div>
          
          <div class="two-column-layout">
            <div class="column">
              <div class="form-element">
                <label for="verbalizzazione_COUNTER_PLACEHOLDER">Verbalizzazione*</label>
                <select id="verbalizzazione_COUNTER_PLACEHOLDER" name="verbalizzazione[]" class="form-input">
                  <option value="FSS" selected>Firma digitale singola</option>
                  <option value="FWP">Firma digitale con pubblicazione</option>
                </select>
              </div>
            </div>
            <div class="column">
              <div class="form-element">
                <label for="tipoEsame_COUNTER_PLACEHOLDER">Tipo esame</label>
                <select id="tipoEsame_COUNTER_PLACEHOLDER" name="tipoEsame[]" class="form-input">
                  <option value="" disabled selected hidden>Non definito</option>
                  <option value="S">Scritto</option>
                  <option value="O">Orale</option>
                  <option value="SO">Scritto e orale</option>
                </select>
              </div>
            </div>
          </div>
          
          <div class="form-element">
            <label for="note_COUNTER_PLACEHOLDER">Note</label>
            <textarea id="note_COUNTER_PLACEHOLDER" name="note[]" class="form-textarea" rows="2"></textarea>
          </div>
        </div>
      `;
      
      return appellobTemplate;
    }

    async function addDateSection(date = '') {
      const container = document.getElementById('dateAppelliContainer');
      if (!container) {
        return null;
      }

      // Calcola il prossimo numero di sezione
      const existingSections = document.querySelectorAll('.date-appello-section');
      dateAppelliCounter = existingSections.length + 1;
      const sectionId = `dateSection_${dateAppelliCounter}`;

      const section = document.createElement('div');
      section.className = 'date-appello-section';
      section.id = sectionId;
      section.dataset.date = date || '';

      // Usa template processato
      section.innerHTML = getAppelloTemplate()
        .replace(/COUNTER_PLACEHOLDER/g, dateAppelliCounter)
        .replace(/SECTION_ID_PLACEHOLDER/g, sectionId)
        .replace(/DATE_PLACEHOLDER/g, date);

      // Inserisci la sezione
      const addButton = container.querySelector('.add-date-btn');
      container.insertBefore(section, addButton || null);
      
      // Setup listeners e inizializzazione
      setupDateSectionListeners(sectionId, dateAppelliCounter);
      
      // Precompila solo se necessario
      if (dateAppelliCounter > 1 && window.FormEsameAutosave) {
        const examIdField = document.getElementById('examIdField');
        const isEditMode = examIdField?.value;
        
        if (!isEditMode) {
          window.FormEsameAutosave.precompileNewSection(section);
        }
      }
      
      // Imposta checkbox default
      const showInCalendarCheckbox = section.querySelector(`#mostra_nel_calendario_${dateAppelliCounter}`);
      if (showInCalendarCheckbox) {
        showInCalendarCheckbox.checked = true;
      }
      
      // Gestisci evento provvisorio se c'è una data
      if (date) {
        createProvisionalEventForDate(date, dateAppelliCounter);
        if (!selectedDates.includes(date)) {
          selectedDates.push(date);
        }
      }
      
      return sectionId;
    }
    
    function removeDateSection(sectionId) {
      const section = document.getElementById(sectionId);
      if (!section) return;
      
      const date = section.dataset.date;
      
      // Rimuovi l'evento provvisorio associato dal calendario se esiste
      if (date) {
        const matchingEvent = window.provisionalEvents?.find(event =>
          event.extendedProps?.formSectionDate === date
        );
        if (matchingEvent && matchingEvent.id) {
          // Usa la funzione interna del modulo EsameAppelli per rimuovere l'evento
          removeProvisionalEventsByIds([matchingEvent.id]);
        }
      }
      
      // Rimuovi dal tracking delle date
      if (date && selectedDates.includes(date)) {
        const index = selectedDates.indexOf(date);
        if (index > -1) {
          selectedDates.splice(index, 1);
        }
      }
      
      section.remove();
      
      // Aggiorna il counter basandosi sul numero di sezioni rimanenti
      const remainingSections = document.querySelectorAll('.date-appello-section');
      dateAppelliCounter = remainingSections.length;
      
      // Rinumera le sezioni rimanenti
      renumberDateSections();
    }
    
    function renumberDateSections() {
      const sections = document.querySelectorAll('.date-appello-section');
      sections.forEach((section, index) => {
        const newNumber = index + 1;
        const title = section.querySelector('.date-appello-title');
        if (title) {
          title.textContent = `Appello ${newNumber}`;
        }
      });
    }
    
    function setupDateSectionListeners(sectionId, counter) {
      const section = document.getElementById(sectionId);
      if (!section) return;

      // Elementi principali
      const dateInput = section.querySelector(`#dataora_${counter}`);
      const oraH = section.querySelector(`#ora_h_${counter}`);
      const oraM = section.querySelector(`#ora_m_${counter}`);
      const durataH = section.querySelector(`#durata_h_${counter}`);
      const durataM = section.querySelector(`#durata_m_${counter}`);
      const showInCalendarCheckbox = section.querySelector(`#mostra_nel_calendario_${counter}`);

      // Configurazione listener ottimizzata
      const listeners = [
        {
          element: dateInput,
          events: [
            { type: 'input', handler: () => dateInput.classList.remove('form-input-error') },
            { type: 'blur', handler: () => handleDateInputChange(sectionId, counter) }
          ]
        },
        {
          element: oraH,
          events: [{ 
            type: 'change', 
            handler: () => {
              // Imposta automaticamente i minuti a "00" quando viene selezionata un'ora
              if (oraM && oraH.value && oraM.value === '') {
                oraM.value = '00';
              }
              updateAuleForSection(counter);
            }
          }]
        },
        {
          element: oraM,
          events: [{ type: 'change', handler: () => updateAuleForSection(counter) }]
        },
        {
          element: durataH,
          events: [{ type: 'change', handler: () => combineDurataForSection(counter) }]
        },
        {
          element: durataM,
          events: [{ type: 'change', handler: () => combineDurataForSection(counter) }]
        },
        {
          element: showInCalendarCheckbox,
          events: [{
            type: 'change',
            handler: function() {
              this.setAttribute('data-user-modified', 'true');
              validateAllDates();
            }
          }]
        }
      ];

      // Applica listener
      listeners.forEach(({ element, events }) => {
        if (element) {
          events.forEach(({ type, handler }) => {
            element.addEventListener(type, handler);
          });
        }
      });

      // Radio buttons per tipo appello
      const tipoAppelloRadios = section.querySelectorAll(`input[name="tipo_appello_radio_${counter}"]`);
      tipoAppelloRadios.forEach(radio => {
        radio.addEventListener('change', () => aggiornaVerbalizzazioneForSection(counter));
      });

      // Salvataggio automatico per tutte le sezioni
      if (window.FormEsameAutosave) {
        setupAutoSaveForSection(section);
        window.FormEsameAutosave.setupSectionTracking(section);
      }

      // Inizializza durata
      setTimeout(() => combineDurataForSection(counter), 100);

      // Assicura checkbox selezionato
      if (showInCalendarCheckbox && !showInCalendarCheckbox.hasAttribute('data-user-modified')) {
        showInCalendarCheckbox.checked = true;
      }
    }

    // Funzione helper per autosave
    function setupAutoSaveForSection(section) {
      const examIdField = document.getElementById('examIdField');
      const isEditMode = examIdField?.value;
      
      if (isEditMode) return;

      // Campi con debounce
      const textInputs = section.querySelectorAll('input[type="text"], textarea, input[type="date"]');
      textInputs.forEach(input => {
        input.addEventListener('input', () => {
          clearTimeout(input._autoSaveTimeout);
          input._autoSaveTimeout = setTimeout(() => {
            window.FormEsameAutosave.autoSaveLastModifiedSection();
          }, 500);
        });
      });

      // Campi con cambio immediato
      const immediateInputs = section.querySelectorAll('select, input[type="checkbox"], input[type="radio"]');
      immediateInputs.forEach(element => {
        element.addEventListener('change', () => {
          window.FormEsameAutosave.autoSaveLastModifiedSection();
        });
      });
    }

    // Nuova funzione per rivalidare tutte le date
    function validateAllDates() {
      const allSections = document.querySelectorAll('.date-appello-section');
      allSections.forEach(section => {
          const sectionId = section.id;
          const sectionCounterMatch = sectionId.match(/_(\d+)$/);
          if (!sectionCounterMatch) return;
          const i = parseInt(sectionCounterMatch[1], 10);

          const dateInput = document.getElementById(`dataora_${i}`);
          const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${i}`);
          
          // Valida solo le sezioni che hanno il checkbox "Apertura appelli" attivo e una data valida
          if (dateInput && dateInput.value && isValidDateFormat(dateInput.value) && showInCalendarCheckbox && showInCalendarCheckbox.checked) {
              dateInput.classList.remove('form-input-error'); // Rimuovi errore prima di ri-validare
              validateDateConstraints(dateInput.value, i);
          } else if (dateInput && !showInCalendarCheckbox?.checked) {
              // Se il checkbox è disattivato, rimuovi eventuali stili di errore dalla data
              dateInput.classList.remove('form-input-error');
          }
      });
    }

    // Funzione per combinare durata per sezione specifica
    function combineDurataForSection(counter) {
      const durata_h = parseInt(document.getElementById(`durata_h_${counter}`)?.value) || 0;
      const durata_m = parseInt(document.getElementById(`durata_m_${counter}`)?.value) || 0;
      const durata_totale = (durata_h * 60) + durata_m;
      
      const durataField = document.getElementById(`durata_${counter}`);
      if (durataField) {
        durataField.value = durata_totale.toString();
      }
    }

    // Funzione per aggiornare verbalizzazione per sezione specifica
    function aggiornaVerbalizzazioneForSection(counter) {
      const tipoAppelloPP = document.getElementById(`tipoAppelloPP_${counter}`);
      const verbalizzazioneSelect = document.getElementById(`verbalizzazione_${counter}`);

      if (!tipoAppelloPP || !verbalizzazioneSelect) return;

      verbalizzazioneSelect.innerHTML = "";

      const options = tipoAppelloPP.checked
        ? [
            { value: "PAR", text: "Prova parziale" },
            { value: "PPP", text: "Prova parziale con pubblicazione" },
          ]
        : [
            { value: "FSS", text: "Firma digitale singola" },
            { value: "FWP", text: "Firma digitale con pubblicazione" },
          ];

      options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        verbalizzazioneSelect.appendChild(optionElement);
      });

      verbalizzazioneSelect.value = tipoAppelloPP.checked ? "PAR" : "FSS";
    }

    // Funzione helper per validare il formato della data
    function isValidDateFormat(dateString) {
      if (dateString.length !== 10) return false;
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!regex.test(dateString)) return false;
      
      // Verifica che sia una data valida
      const date = new Date(dateString);
      return date instanceof Date && !isNaN(date) && dateString === formatDateForInput(date);
    }

    // Funzione per validare i vincoli di data riutilizzando la logica esistente
    function validateDateConstraints(newDate, counter) {
      if (!newDate || !isValidDateFormat(newDate)) return true;
      
      try {
          // Raccoglie solo le date delle sezioni con "Apertura appelli" attivo
          const visibleSectionDates = [];
          const allSections = document.querySelectorAll('.date-appello-section');

          allSections.forEach(section => {
              const sectionId = section.id;
              const sectionCounterMatch = sectionId.match(/_(\d+)$/);
              if (!sectionCounterMatch) return;

              const currentSectionCounter = parseInt(sectionCounterMatch[1], 10);

              if (currentSectionCounter === counter) return;

              const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${currentSectionCounter}`);
              const dateInput = document.getElementById(`dataora_${currentSectionCounter}`);

              if (showInCalendarCheckbox && showInCalendarCheckbox.checked && 
                  dateInput && dateInput.value && isValidDateFormat(dateInput.value)) {
                  visibleSectionDates.push(dateInput.value);
              }
          });
          
          const dateToValidate = typeof newDate === 'string' ? new Date(newDate) : newDate;
          const validationResult = validateDateConstraintsForSections(dateToValidate, visibleSectionDates);
              
          const dateInputElement = document.getElementById(`dataora_${counter}`);
          
          if (!validationResult.isValid) {
              if (dateInputElement) {
                  dateInputElement.classList.add('form-input-error');
              }
              
              showError(`Appello ${counter}: ${validationResult.message}`);
              return false;
          } else {
              if (dateInputElement) {
                  dateInputElement.classList.remove('form-input-error');
              }
          }
          
          return true;
      } catch (error) {
          return true;
      }
    }

    // Funzione di validazione specifica per le sezioni (senza controllo sessioni)
    function validateDateConstraintsForSections(selectedDate, provisionalDates = []) {
      const selDate = new Date(selectedDate);
      selDate.setHours(0, 0, 0, 0);

      // Controlla se c'è già un evento provvisorio nello stesso giorno
      if (provisionalDates && provisionalDates.length > 0) {
        const sameDayEvent = provisionalDates.some(provDateStr => {
          const provDate = new Date(provDateStr);
          provDate.setHours(0, 0, 0, 0);
          return selDate.getTime() === provDate.getTime();
        });

        if (sameDayEvent) {
          return {
            isValid: false,
            message: "Non è possibile inserire due esami nello stesso giorno.",
            isSameDayConflict: true
          };
        }

        // Controlla vincolo dei 14 giorni con altri eventi provvisori
        const days = 13;
        for (const provDateStr of provisionalDates) {
          const provDate = new Date(provDateStr);
          provDate.setHours(0, 0, 0, 0);
          const diffDays = Math.abs(selDate - provDate) / (1000 * 60 * 60 * 24);
          if (diffDays <= days && selDate.getTime() !== provDate.getTime()) {
            return {
              isValid: false,
              message: "Non è possibile inserire esami a meno di 14 giorni di distanza.",
              isProvisionalConflict: true
            };
          }
        }
      }

      return { isValid: true };
    }

    function handleDateInputChange(sectionId, counter) {
      const dateInput = document.getElementById(`dataora_${counter}`);
      const section = document.getElementById(sectionId);
      
      if (!dateInput || !section) return;
      
      const newDate = dateInput.value;
      const oldDate = section.dataset.date;
      
      // Verifica validità data
      if (!newDate || newDate.length < 10 || !isValidDateFormat(newDate)) {
        return;
      }
      
      // Se la data è cambiata
      if (newDate !== oldDate) {
        // Cleanup evento precedente
        if (oldDate) {
          const matchingEvent = window.provisionalEvents?.find(event =>
            event.extendedProps?.formSectionDate === oldDate
          );
          if (matchingEvent?.id) {
            removeProvisionalEventsByIds([matchingEvent.id]);
          }
          
          // Aggiorna tracking
          const index = selectedDates.indexOf(oldDate);
          if (index > -1) selectedDates.splice(index, 1);
        }
        
        // Valida nuova data se necessario
        const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${counter}`);
        if (showInCalendarCheckbox?.checked) {
          if (!validateDateConstraints(newDate, counter)) {
            return;
          }
        }
        
        // Aggiorna sezione
        section.dataset.date = newDate;
        createProvisionalEventForDate(newDate, counter);
        
        if (!selectedDates.includes(newDate)) {
          selectedDates.push(newDate);
        }
        
        // Reset aule
        const aulaSelect = document.getElementById(`aula_${counter}`);
        if (aulaSelect) {
          aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
        }

        // Calcola date iscrizione automaticamente
        calculateInscriptionDates(section, newDate);
      }
    }

    // Funzione helper per calcolare date iscrizione
    function calculateInscriptionDates(section, date) {
      const inizioIscrizioneInput = section.querySelector('[id^="inizioIscrizione_"]');
      const fineIscrizioneInput = section.querySelector('[id^="fineIscrizione_"]');
      
      if (inizioIscrizioneInput && fineIscrizioneInput) {
        const appelloDate = new Date(date);
        const inizio = new Date(appelloDate);
        inizio.setDate(appelloDate.getDate() - 30);
        const fine = new Date(appelloDate);
        fine.setDate(appelloDate.getDate() - 1);
        
        const format = d => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        
        inizioIscrizioneInput.value = format(inizio);
        fineIscrizioneInput.value = format(fine);
      }
    }

    // Funzione per verificare se esiste già un evento provvisorio per una data specifica
    function isProvisionalEventExistsForDate(date) {
      if (window.provisionalEvents) {
        return window.provisionalEvents.some(event => event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date));
      }
      return false;
    }
    
    // Gestione aule
    function loadAuleForDateTime(data, periodo) {
      return fetch(`/api/get-aule?data=${data}&periodo=${periodo}`)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        });
    }

    function populateAulaSelect(selectElement, aule, includeStudioDocente = true) {
      if (!selectElement) return;

      selectElement.innerHTML = '<option value="" disabled selected hidden>Scegli l\'aula</option>';
      
      if (includeStudioDocente) {
        const studioDocenteNome = "Studio docente DMI";
        const hasStudioDocente = aule.some(aula => aula.nome === studioDocenteNome);
        
        if (!hasStudioDocente) {
          aule.push({ nome: studioDocenteNome });
          aule.sort((a, b) => a.nome.localeCompare(b.nome));
        }
      }
      
      aule.forEach(aula => {
        const option = document.createElement("option");
        option.value = aula.nome;
        option.textContent = aula.nome === "Studio docente DMI" 
          ? aula.nome 
          : `${aula.nome} (${aula.posti} posti)`;
        
        if (aula.nome === "Studio docente DMI" && aule.length === 1) {
          option.selected = true;
        }
        
        selectElement.appendChild(option);
      });
    }

    async function updateAuleForSection(sectionCounter) {
      const aulaSelect = document.getElementById(`aula_${sectionCounter}`);
      const dataField = document.getElementById(`dataora_${sectionCounter}`);
      const oraH = document.getElementById(`ora_h_${sectionCounter}`);
      const oraM = document.getElementById(`ora_m_${sectionCounter}`);

      if (!aulaSelect) {
        return;
      }

      if (!dataField?.value || !oraH?.value) {
        aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
        return;
      }

      const data = dataField.value;
      const periodo = parseInt(oraH.value) >= 14 ? 1 : 0;

      aulaSelect.innerHTML = '<option value="" disabled selected hidden>Caricamento aule in corso</option>';
      
      try {
        const aule = await loadAuleForDateTime(data, periodo);
        populateAulaSelect(aulaSelect, aule);
        setupAulaChangeListener(aulaSelect, data);
      } catch (error) {
        console.error(`Errore nel caricamento aule per l'Appello ${sectionCounter}:`, error);
        aulaSelect.innerHTML = '<option value="" disabled selected hidden>Errore nel caricamento aule</option>';
      }
    }

    // Funzione helper per setup listener aula
    function setupAulaChangeListener(aulaSelect, data) {
      const newAulaSelect = aulaSelect.cloneNode(true);
      aulaSelect.parentNode.replaceChild(newAulaSelect, aulaSelect);
      newAulaSelect.addEventListener('change', function() {
        updateEventAula(data, this.value);
      });
    }

    // Funzione per aggiornare l'aula di un evento provvisorio
    function updateEventAula(date, aula) {
      if (!window.calendar || !window.provisionalEvents) return false;

      const provisionalEvent = window.provisionalEvents.find(event => 
        event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
      );

      if (!provisionalEvent) return false;

      const calendarEvent = window.calendar.getEventById(provisionalEvent.id);
      if (!calendarEvent) return false;

      calendarEvent.setExtendedProp('aula', aula || '');
      provisionalEvent.extendedProps.aula = aula || '';

      return true;
    }

    // Reset function
    function resetSections() {
      dateAppelliCounter = 0;
      selectedDates = [];
      const container = document.getElementById('dateAppelliContainer');
      if (container) {
        container.innerHTML = '';
      }
    }

    function initializeDateSections() {
      const container = document.getElementById('dateAppelliContainer');
      if (!container) {
        return;
      }
          
      // Rimuovi il pulsante se già esiste
      const existingButton = container.querySelector('.add-date-btn');
      if (existingButton) {
        existingButton.remove();
      }
      
      // Aggiungi event listener per i checkbox "Apertura appelli" esistenti
      for (let i = 1; i <= 4; i++) {
          const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${i}`);
          
          if (showInCalendarCheckbox) {
              if (!showInCalendarCheckbox.hasAttribute('data-user-modified')) {
                  showInCalendarCheckbox.checked = true;
              }
              
              showInCalendarCheckbox.addEventListener('change', function() {
                  this.setAttribute('data-user-modified', 'true');
                  validateAllDates();
              });
          }
      }
      
      // Aggiungi il pulsante per aggiungere nuove date
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'add-date-btn';
      addButton.innerHTML = '<span class="material-symbols-outlined">add</span> Aggiungi data appello';
      addButton.addEventListener('click', () => addDateSection());
      
      container.appendChild(addButton);
    }

    // Utilizza la funzione unificata da calendarUtils
    function createProvisionalEventForDate(date, sectionNumber = null) {
      if (!window.calendar || !date) {
        return;
      }

      // Controlla se esiste già un evento provvisorio per questa data
      const existingEvent = window.provisionalEvents?.find(event => 
        event.start === date || (event.extendedProps && event.extendedProps.formSectionDate === date)
      );
      
      if (existingEvent) {
        return existingEvent;
      }

      // Inizializza l'array se non esiste
      if (!window.provisionalEvents) {
        window.provisionalEvents = [];
      }

      // Genera un ID unico per l'evento
      const provisionalEventId = `provisional_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Crea l'oggetto evento con valori di default
      const provisionalEvent = {
        id: provisionalEventId,
        start: date,
        allDay: true,
        backgroundColor: '#77DD77',
        borderColor: '#77DD77',
        textColor: '#000',
        title: 'Nuovo esame',
        extendedProps: {
          isProvisional: true,
          formSectionDate: date,
          sectionNumber: sectionNumber,
          aula: ''
        }
      };

      // Aggiungi l'evento al calendario
      const calendarEvent = window.calendar.addEvent(provisionalEvent);
      
      if (calendarEvent) {
        // Aggiungi alla lista degli eventi provvisori
        window.provisionalEvents.push(provisionalEvent);
        
        if (window.updateDateValideWithExclusions) {
          window.updateDateValideWithExclusions();
        }
        
        return provisionalEvent;
      }
      
      return null;
    }

    // Centralizza la gestione degli eventi provvisori
    function clearProvisionalEvents() {
      if (window.calendar && window.provisionalEvents) {
        window.provisionalEvents.forEach(event => {
          const calendarEvent = window.calendar.getEventById(event.id);
          if (calendarEvent) {
            calendarEvent.remove();
          }
        });
        window.provisionalEvents.length = 0;
      }
    }

    function removeProvisionalEventsByIds(eventIds) {
      if (!window.calendar || !window.provisionalEvents) return;
      
      const ids = Array.isArray(eventIds) ? eventIds : [eventIds];
      ids.forEach(eventId => {
        const calendarEvent = window.calendar.getEventById(eventId);
        if (calendarEvent) {
          calendarEvent.remove();
        }
        
        const index = window.provisionalEvents.findIndex(ev => ev.id === eventId);
        if (index > -1) {
          window.provisionalEvents.splice(index, 1);
        }
      });
    }

    // Funzione per ottenere solo le date con "Apertura appelli" attivo
    function getVisibleSectionDates() {
      const visibleDates = [];
      const allSections = document.querySelectorAll('.date-appello-section');

      allSections.forEach(section => {
        const sectionId = section.id;
        const sectionCounterMatch = sectionId.match(/_(\d+)$/);
        if (!sectionCounterMatch) return;

        const currentSectionCounter = parseInt(sectionCounterMatch[1], 10);
        const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${currentSectionCounter}`);
        const dateInput = document.getElementById(`dataora_${currentSectionCounter}`);

        // Include la data solo se il checkbox è selezionato e la data è valida
        if (showInCalendarCheckbox && showInCalendarCheckbox.checked && 
            dateInput && dateInput.value && isValidDateFormat(dateInput.value)) {
            visibleDates.push(dateInput.value);
        }
      });

      return visibleDates;
    }

    // Funzione per ottenere i dati di una sezione specifica
    function getSectionData(sectionCounter) {
      const section = document.getElementById(`dateSection_${sectionCounter}`);
      if (!section) return null;

      const getFieldValue = (prefix) => {
        const field = section.querySelector(`[id^="${prefix}_${sectionCounter}"]`);
        return field ? field.value : null;
      };

      const getCheckedValue = (prefix) => {
        const field = section.querySelector(`[id^="${prefix}_${sectionCounter}"]`);
        return field ? field.checked : false;
      };

      const getRadioValue = (name) => {
        const radio = section.querySelector(`input[name^="${name}_${sectionCounter}"]:checked`);
        return radio ? radio.value : null;
      };

      return {
        descrizione: getFieldValue('descrizione'),
        dataora: getFieldValue('dataora'),
        ora_h: getFieldValue('ora_h'),
        ora_m: getFieldValue('ora_m'),
        durata_h: getFieldValue('durata_h'),
        durata_m: getFieldValue('durata_m'),
        aula: getFieldValue('aula'),
        inizioIscrizione: getFieldValue('inizioIscrizione'),
        fineIscrizione: getFieldValue('fineIscrizione'),
        verbalizzazione: getFieldValue('verbalizzazione'),
        tipoEsame: getFieldValue('tipoEsame'),
        note: getFieldValue('note'),
        mostra_nel_calendario: getCheckedValue('mostra_nel_calendario'),
        tipo_appello_radio: getRadioValue('tipo_appello_radio')
      };
    }

    // Interfaccia pubblica aggiornata
    return {
      addDateSection,
      removeDateSection,
      renumberDateSections,
      setupDateSectionListeners,
      initializeDateSections,
      createProvisionalEventForDate,
      isProvisionalEventExistsForDate,
      validateDateConstraints,
      handleDateInputChange,
      updateAuleForSection,
      updateEventAula,
      resetSections,
      getSelectedDates: () => [...selectedDates],
      getVisibleSectionDates,
      getDateAppelliCounter: () => dateAppelliCounter,
      combineDurataForSection,
      aggiornaVerbalizzazioneForSection,
      validateAllDates,
      clearProvisionalEvents,
      removeProvisionalEventsByIds,
      loadAuleForDateTime,
      populateAulaSelect,
      getSectionData // Nuovo per EditEsame
    };
  }());

  // Esponi il modulo globalmente
  window.EsameAppelli = EsameAppelli;

  // Funzione globale per la rimozione delle sezioni (per compatibilità)
  window.removeDateSection = function(sectionId) {
    if (window.EsameAppelli && window.EsameAppelli.removeDateSection) {
      window.EsameAppelli.removeDateSection(sectionId);
    }
  };
});