document.addEventListener('DOMContentLoaded', function() {
  // Gestione delle sezioni modulari per date e appelli
  const EsameAppelli = (function() {
    // Verifica che FormEsameAutosave sia caricato
    if (!window.FormEsameAutosave) {
      console.warn('FormEsameAutosave non è caricato. Funzionalità di salvataggio automatico non disponibile.');
    }

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
                  <span class="tooltiptext">Spunta quest'opzione se questo appello finirà sul calendario. Se l'opzione è spuntata l'esame conterà per il numero minimo (8) di esami annuali.</span>
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
                    <option value="0" selected>0 minuti</option>
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
      console.log('>>> APPELLI: addDateSection chiamata con data:', date);
      
      const container = document.getElementById('dateAppelliContainer');
      if (!container) {
        console.error("Container dateAppelliContainer non trovato");
        return null;
      }

      // **FIX PRINCIPALE**: Non verificare se esiste già una sezione con questa data
      // Ogni click deve creare una nuova sezione
      
      // Calcola il prossimo numero di sezione basandosi sulle sezioni esistenti
      const existingSections = document.querySelectorAll('.date-appello-section');
      dateAppelliCounter = existingSections.length + 1;
      const sectionId = `dateSection_${dateAppelliCounter}`;

      const section = document.createElement('div');
      section.className = 'date-appello-section';
      section.id = sectionId;
      section.dataset.date = date || ''; // Imposta stringa vuota se non c'è data

      // Usa il template inline - molto più veloce
      const template = getAppelloTemplate();
      
      // Sostituisci i placeholder nel template
      const processedTemplate = template
        .replace(/COUNTER_PLACEHOLDER/g, dateAppelliCounter)
        .replace(/SECTION_ID_PLACEHOLDER/g, sectionId)
        .replace(/DATE_PLACEHOLDER/g, date);

      section.innerHTML = processedTemplate;

      // Inserisci la sezione prima del pulsante "Aggiungi data"
      const addButton = container.querySelector('.add-date-btn');
      if (addButton) {
        container.insertBefore(section, addButton);
      } else {
        container.appendChild(section);
      }
      
      console.log('>>> APPELLI: sezione aggiunta al DOM');
      
      // Aggiungi event listeners per questa sezione - ottimizzato
      setupDateSectionListeners(sectionId, dateAppelliCounter);
      
      // Precompila la nuova sezione solo se non è la prima e non siamo in modifica
      if (dateAppelliCounter > 1 && window.FormEsameAutosave) {
        const examIdField = document.getElementById('examIdField');
        const isEditMode = examIdField && examIdField.value;
        
        if (!isEditMode) {
          window.FormEsameAutosave.precompileNewSection(section);
        }
      }
      
      // Assicurati che il checkbox "Apertura appelli" sia sempre selezionato per default
      const showInCalendarCheckbox = section.querySelector(`#mostra_nel_calendario_${dateAppelliCounter}`);
      if (showInCalendarCheckbox) {
        showInCalendarCheckbox.checked = true;
      }
      
      // Se è stata fornita una data, crea subito l'evento provvisorio
      if (date) {
        createProvisionalEventForDate(date, dateAppelliCounter);
        // Aggiungi la data al tracking
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
      const dateInput = document.getElementById(`dataora_${counter}`);
      const oraH = document.getElementById(`ora_h_${counter}`);
      const oraM = document.getElementById(`ora_m_${counter}`);
      const durataH = document.getElementById(`durata_h_${counter}`);
      const durataM = document.getElementById(`durata_m_${counter}`);
      const tipoAppelloRadios = document.querySelectorAll(`input[name="tipo_appello_radio_${counter}"]`);
      
      if (dateInput) {
        // Rimuovi stili di errore durante la digitazione
        dateInput.addEventListener('input', () => {
          dateInput.classList.remove('form-input-error');
        });
        
        // Esegui la validazione solo quando il campo perde focus
        dateInput.addEventListener('blur', () => {
          if (dateInput.value && isValidDateFormat(dateInput.value)) {
            handleDateInputChange(sectionId, counter);
            updateAuleForSection(counter);
          }
        });
      }
      if (oraH) {
        oraH.addEventListener('change', () => {
          updateAuleForSection(counter);
          // Salva automaticamente se è la prima sezione
          if (counter === 1 && window.FormEsameAutosave) {
            window.FormEsameAutosave.autoSaveFirstSection();
          }
        });
      }
      if (oraM) {
        oraM.addEventListener('change', () => {
          updateAuleForSection(counter);
          // Salva automaticamente se è la prima sezione
          if (counter === 1 && window.FormEsameAutosave) {
            window.FormEsameAutosave.autoSaveFirstSection();
          }
        });
      }
      
      // Gestione durata per sezione
      if (durataH && durataM) {
        // Rimuovi listener esistenti per evitare duplicati
        durataH.removeEventListener('change', () => combineDurataForSection(counter));
        durataM.removeEventListener('change', () => combineDurataForSection(counter));
        
        // Aggiungi nuovi listener
        durataH.addEventListener('change', () => {
          combineDurataForSection(counter);
          // Salva automaticamente se è la prima sezione
          if (counter === 1 && window.FormEsameAutosave) {
            window.FormEsameAutosave.autoSaveFirstSection();
          }
        });
        durataM.addEventListener('change', () => {
          combineDurataForSection(counter);
          // Salva automaticamente se è la prima sezione
          if (counter === 1 && window.FormEsameAutosave) {
            window.FormEsameAutosave.autoSaveFirstSection();
          }
        });
        
        // Inizializza il valore di durata al caricamento
        setTimeout(() => combineDurataForSection(counter), 100);
      }
      
      // Gestione tipo appello per sezione
      tipoAppelloRadios.forEach(radio => {
        radio.addEventListener('change', () => {
          aggiornaVerbalizzazioneForSection(counter);
          // Salva automaticamente se è la prima sezione
          if (counter === 1 && window.FormEsameAutosave) {
            window.FormEsameAutosave.autoSaveFirstSection();
          }
        });
      });

      // Aggiungi listener per il salvataggio automatico sui campi di testo se è la prima sezione e non in modifica
      if (counter === 1 && window.FormEsameAutosave) {
        const examIdField = document.getElementById('examIdField');
        const isEditMode = examIdField && examIdField.value;
        
        if (!isEditMode) {
          const section = document.getElementById(sectionId);
          if (section) {
            // Campi di testo e textarea
            const textInputs = section.querySelectorAll('input[type="text"], textarea, input[type="date"]');
            textInputs.forEach(input => {
              input.addEventListener('input', () => {
                clearTimeout(input._autoSaveTimeout);
                input._autoSaveTimeout = setTimeout(() => {
                  window.FormEsameAutosave.autoSaveFirstSection();
                }, 500);
              });
            });

            // Select e checkbox
            const selectsAndCheckboxes = section.querySelectorAll('select, input[type="checkbox"]');
            selectsAndCheckboxes.forEach(element => {
              element.addEventListener('change', () => {
                window.FormEsameAutosave.autoSaveFirstSection();
              });
            });
            
            // Radio buttons per tipo appello
            const radioButtons = section.querySelectorAll('input[type="radio"]');
            radioButtons.forEach(radio => {
              radio.addEventListener('change', () => {
                window.FormEsameAutosave.autoSaveFirstSection();
              });
            });
          }
        }
      }

      // Gestione del checkbox "Apertura appelli" 
      const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${counter}`);
      if (showInCalendarCheckbox) {
          // Assicurati che sia selezionato per default
          if (!showInCalendarCheckbox.hasAttribute('data-user-modified')) {
              showInCalendarCheckbox.checked = true;
          }
          
          showInCalendarCheckbox.addEventListener('change', function() {
              this.setAttribute('data-user-modified', 'true');
              validateAllDates();
          });
      }
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
      if (!newDate || !isValidDateFormat(newDate)) return true; // Non validare se la data non è valida o vuota
      
      try {
          // Raccoglie solo le date delle sezioni con "Apertura appelli" attivo
          const visibleSectionDates = [];
          const allSections = document.querySelectorAll('.date-appello-section');

          allSections.forEach(section => {
              const sectionId = section.id;
              const sectionCounterMatch = sectionId.match(/_(\d+)$/);
              if (!sectionCounterMatch) return;

              const currentSectionCounter = parseInt(sectionCounterMatch[1], 10);

              if (currentSectionCounter === counter) return; // Salta la sezione corrente

              const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${currentSectionCounter}`);
              const dateInput = document.getElementById(`dataora_${currentSectionCounter}`);

              // Include la data solo se il checkbox è selezionato e la data è valida
              if (showInCalendarCheckbox && showInCalendarCheckbox.checked && 
                  dateInput && dateInput.value && isValidDateFormat(dateInput.value)) {
                  visibleSectionDates.push(dateInput.value);
              }
          });
          
          // Converte la nuova data in oggetto Date se è una stringa
          const dateToValidate = typeof newDate === 'string' ? new Date(newDate) : newDate;
          
          // Validazione custom solo per i vincoli tra appelli (non controlla le sessioni)
          const validationResult = validateDateConstraintsForSections(dateToValidate, visibleSectionDates);
              
          const dateInputElement = document.getElementById(`dataora_${counter}`);
          
          if (!validationResult.isValid) {
              // Applica lo stile di errore al campo
              if (dateInputElement) {
                  dateInputElement.classList.add('form-input-error');
              }
              
              showError(`Appello ${counter}: ${validationResult.message}`);
              return false;
          } else {
              // Rimuovi lo stile di errore se la validazione passa
              if (dateInputElement) {
                  dateInputElement.classList.remove('form-input-error');
              }
          }
          
          return true;
      } catch (error) {
          console.error('Errore nella validazione delle date:', error);
          return true; // In caso di errore imprevisto, non bloccare l'utente
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
      
      // Se la data non è completa o non è valida, non fare nulla
      if (!newDate || newDate.length < 10 || !isValidDateFormat(newDate)) {
        return;
      }
      
      // Se la data è cambiata
      if (newDate !== oldDate) {
        // Rimuovi l'evento provvisorio precedente se esisteva
        if (oldDate) {
          const matchingEvent = window.provisionalEvents?.find(event =>
            event.extendedProps?.formSectionDate === oldDate
          );
          if (matchingEvent && matchingEvent.id) {
            removeProvisionalEventsByIds([matchingEvent.id]);
          }
        }
        
        // Aggiorna il tracking delle date selezionate
        if (oldDate && selectedDates.includes(oldDate)) {
          const index = selectedDates.indexOf(oldDate);
          selectedDates.splice(index, 1);
        }
        
        // Verifica il vincolo dei 14 giorni solo se il checkbox "Apertura appelli" è attivo
        const showInCalendarCheckbox = document.getElementById(`mostra_nel_calendario_${counter}`);
        if (showInCalendarCheckbox && showInCalendarCheckbox.checked) {
          if (!validateDateConstraints(newDate, counter)) {
            // Data non valida - non creare evento provvisorio
            return;
          }
        }
        
        // Data valida o checkbox disattivato - continua con la logica normale
        section.dataset.date = newDate;
        createProvisionalEventForDate(newDate, counter);
        
        if (!selectedDates.includes(newDate)) {
          selectedDates.push(newDate);
        }
        
        // Reset delle aule quando cambia la data
        const aulaSelect = document.getElementById(`aula_${counter}`);
        if (aulaSelect) {
          aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
        }

        // Calcola e imposta automaticamente le date di inizio e fine iscrizione
        const inizioIscrizioneInput = document.getElementById(`inizioIscrizione_${counter}`);
        const fineIscrizioneInput = document.getElementById(`fineIscrizione_${counter}`);
        if (inizioIscrizioneInput && fineIscrizioneInput) {
          const appelloDate = new Date(newDate);
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
      return fetch(`/api/getAule?data=${data}&periodo=${periodo}`)
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

    function updateAuleForSection(counter) {
      return new Promise((resolve, reject) => {
        const dateInput = document.getElementById(`dataora_${counter}`);
        const oraH = document.getElementById(`ora_h_${counter}`);
        const oraM = document.getElementById(`ora_m_${counter}`);
        const aulaSelect = document.getElementById(`aula_${counter}`);
        
        if (!dateInput || !oraH || !oraM || !aulaSelect) {
          console.warn(`Elementi mancanti per aggiornare le aule della sezione ${counter}`);
          resolve(); // Risolve per non bloccare, ma con un avviso
          return;
        }
        
        const data = dateInput.value;
        const ora_hValue = oraH.value;
        const ora_mValue = oraM.value;
        
        if (!data) {
          aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima una data</option>';
          resolve();
          return;
        }
        
        if (!ora_hValue || !ora_mValue) {
          aulaSelect.innerHTML = '<option value="" disabled selected hidden>Seleziona prima un\'ora</option>';
          resolve();
          return;
        }
        
        aulaSelect.innerHTML = '<option value="" disabled selected hidden>Caricamento aule in corso...</option>';
        
        const periodo = parseInt(ora_hValue) >= 14 ? 1 : 0;
        
        loadAuleForDateTime(data, periodo)
          .then(aule => {
            populateAulaSelect(aulaSelect, aule, true);
            
            // Rimuovi listener esistente per evitare duplicati prima di aggiungerne uno nuovo
            const newAulaSelect = aulaSelect.cloneNode(true); // Clona per rimuovere listener in modo pulito
            aulaSelect.parentNode.replaceChild(newAulaSelect, aulaSelect);

            newAulaSelect.addEventListener('change', function() {
              updateEventAula(data, this.value);
            });
            resolve();
          })
          .catch(error => {
            console.error("Errore nel recupero delle aule:", error);
            aulaSelect.innerHTML = '<option value="" disabled selected>Errore nel caricamento delle aule</option>';
            
            const option = document.createElement("option");
            option.value = "Studio docente DMI";
            option.textContent = "Studio docente DMI";
            aulaSelect.appendChild(option);
            reject(error); // Rigetta in caso di errore per segnalarlo al chiamante
          });
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
        console.error("Container dateAppelliContainer non trovato durante l'inizializzazione");
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
              // Assicurati che sia selezionato per default se non ha un valore salvato
              if (!showInCalendarCheckbox.hasAttribute('data-user-modified')) {
                  showInCalendarCheckbox.checked = true;
              }
              
              // Marca come modificato dall'utente quando viene cambiato
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
    } else {
      console.error("EsameAppelli non è inizializzato correttamente per removeDateSection.");
    }
  };
});