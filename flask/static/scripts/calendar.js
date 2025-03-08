import { getValidDateRange } from './calendarProps.js';

document.addEventListener("DOMContentLoaded", function () {
  const currentDate = new Date();
  const planningYear = currentDate.getMonth() >= 9 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  const dateRange = getValidDateRange();
  
  // Definizione dei calendari
  const calendarIds = [
    { id: 'calendar-anticipata', name: 'Anticipata' },
    { id: 'calendar-estiva', name: 'Estiva' },
    { id: 'calendar-autunnale', name: 'Autunnale' },
    { id: 'calendar-invernale', name: 'Invernale' },
    { id: 'calendar-pausa1', name: 'PausaDidatticaPrimo' },
    { id: 'calendar-pausa2', name: 'PausaDidatticaSecondo' },
    { id: 'calendar-completo', name: 'Completo' }
  ];

  // Ottieni le date delle sessioni prima di inizializzare i calendari
  fetch('/flask/api/ottieniSessioni')
    .then(response => response.json())
    .then(sessioni => {
      // Converti tutte le date valide per gli esami in un unico array
      const dateValide = [
        [sessioni.anticipata.start, sessioni.anticipata.end, 'Sessione Anticipata'],
        [sessioni.estiva.start, sessioni.estiva.end, 'Sessione Estiva'],
        [sessioni.autunnale.start, sessioni.autunnale.end, 'Sessione Autunnale'],
        [sessioni.invernale.start, sessioni.invernale.end, 'Sessione Invernale'],
        [sessioni.pausa_primo.start, sessioni.pausa_primo.end, 'Pausa Didattica 1° sem'],
        [sessioni.pausa_secondo.start, sessioni.pausa_secondo.end, 'Pausa Didattica 2° sem']
      ];

      // Crea dropdown per le sessioni
      const dropdownSessioni = document.createElement('div');
      dropdownSessioni.className = 'calendar-dropdown';
      dropdownSessioni.id = 'sessioniDropdown';
      document.body.appendChild(dropdownSessioni);
      
      // Popola il dropdown con le sessioni
      let dropdownSessioniHTML = `
        <div class="dropdown-item" data-data="${sessioni.anticipata.start}">Sessione Anticipata</div>
        <div class="dropdown-item" data-data="${sessioni.estiva.start}">Sessione Estiva</div>
        <div class="dropdown-item" data-data="${sessioni.autunnale.start}">Sessione Autunnale</div>
        <div class="dropdown-item" data-data="${sessioni.invernale.start}">Sessione Invernale</div>
        <div class="dropdown-item" data-data="${sessioni.pausa_primo.start}">Pausa Didattica (1° sem)</div>
        <div class="dropdown-item" data-data="${sessioni.pausa_secondo.start}">Pausa Didattica (2° sem)</div>
      `;
      dropdownSessioni.innerHTML = dropdownSessioniHTML;

      const dropdownInsegnamenti = document.createElement('div');
      dropdownInsegnamenti.className = 'calendar-dropdown';
      document.body.appendChild(dropdownInsegnamenti);

      // Funzione per aprire il form degli esami con insegnamenti preselezionati
      function openEsameFormWithInsegnamenti() {
        // Usa InsegnamentiManager invece di selectedInsegnamenti
        if (window.InsegnamentiManager && window.InsegnamentiManager.getSelectedCodes().length > 0) {
          // Ottieni i codici degli insegnamenti selezionati
          const insegnamentiCodes = window.InsegnamentiManager.getSelectedCodes();
          
          // Apri il form degli esami con i parametri nell'URL
          const popupOverlay = document.getElementById('popupOverlay');
          if (popupOverlay) {
            // Imposta direttamente gli insegnamenti preselezionati come variabile globale
            window.preselectedInsegnamenti = insegnamentiCodes;
            
            // Mostra il form
            popupOverlay.style.display = 'flex';
            
            // Ottieni i dati degli insegnamenti selezionati
            const username = document.cookie
              .split('; ')
              .find(row => row.startsWith('username='))
              ?.split('=')[1];
              
            if (username) {
              // Carica direttamente gli insegnamenti selezionati
              fetch(`/flask/api/ottieniInsegnamenti?username=${username}&codici=${insegnamentiCodes.join(',')}`)
                .then(response => response.json())
                .then(data => {
                  if (data.length > 0) {
                    // Rimuovi il placeholder se presente
                    const multiSelectBox = document.getElementById('insegnamentoBox');
                    const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
                    if (placeholder) {
                      placeholder.remove();
                    }
                    
                    // Aggiungi i tag per gli insegnamenti
                    data.forEach(ins => {
                      // Verifica se esiste già un tag per questo insegnamento
                      const existingTag = Array.from(multiSelectBox.querySelectorAll('.multi-select-tag'))
                        .find(tag => tag.dataset.value === ins.codice);
                      
                      if (!existingTag) {
                        // Se la funzione toggleOption è disponibile, usala
                        if (window.toggleOption) {
                          // Cerca l'opzione corrispondente
                          const option = document.querySelector(`.multi-select-option[data-value="${ins.codice}"]`);
                          if (option) {
                            window.toggleOption(option);
                          } else {
                            // Se l'opzione non esiste, crea manualmente il tag
                            createTag(ins.codice, ins.titolo, multiSelectBox);
                          }
                        } else {
                          // Altrimenti crea manualmente il tag
                          createTag(ins.codice, ins.titolo, multiSelectBox);
                        }
                      }
                    });
                    
                    // Aggiorna la select nascosta
                    if (window.updateHiddenSelect) {
                      window.updateHiddenSelect();
                    } else {
                      updateHiddenSelectFallback();
                    }
                  }
                })
                .catch(error => console.error('Errore nel caricamento degli insegnamenti preselezionati:', error));
            }
          } else {
            // Se il form non è presente nella pagina, reindirizza a una nuova pagina
            window.location.href = '/flask/nuovoEsame?insegnamenti=' + insegnamentiCodes.join(',');
          }
        } else {
          alert('Seleziona almeno un insegnamento prima di creare un esame.');
        }
      }
      
      // Funzione di supporto per creare un tag
      function createTag(value, text, container) {
        // Crea il tag
        const tag = document.createElement('div');
        tag.className = 'multi-select-tag';
        tag.dataset.value = value;
        tag.innerHTML = text + '<span class="multi-select-tag-remove">&times;</span>';
        
        // Aggiungi evento per rimuovere il tag
        tag.querySelector('.multi-select-tag-remove').addEventListener('click', function(e) {
          e.stopPropagation();
          
          // Rimuovi il tag
          tag.remove();
          
          // Se non ci sono più tag, mostra il placeholder
          if (container.querySelectorAll('.multi-select-tag').length === 0) {
            const placeholder = document.createElement('span');
            placeholder.className = 'multi-select-placeholder';
            placeholder.textContent = 'Seleziona gli insegnamenti';
            container.appendChild(placeholder);
          }
          
          // Aggiorna la select nascosta
          if (window.updateHiddenSelect) {
            window.updateHiddenSelect();
          } else {
            updateHiddenSelectFallback();
          }
        });
        
        container.appendChild(tag);
      }
      
      // Funzione di fallback per aggiornare la select nascosta
      function updateHiddenSelectFallback() {
        const hiddenSelect = document.getElementById('insegnamento');
        const multiSelectBox = document.getElementById('insegnamentoBox');
        if (hiddenSelect && multiSelectBox) {
          // Rimuovi tutte le opzioni esistenti
          while (hiddenSelect.options.length > 0) {
            hiddenSelect.remove(0);
          }
          
          // Aggiungi le opzioni selezionate
          const tags = multiSelectBox.querySelectorAll('.multi-select-tag');
          tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.dataset.value;
            option.textContent = tag.textContent.replace('×', '').trim();
            option.selected = true;
            hiddenSelect.appendChild(option);
          });
        }
      }

      // Funzione unificata per caricare gli eventi del calendario
      function fetchCalendarEvents(info, successCallback, calendarType = null) {
        // Otteniamo il docente loggato
        const loggedDocente = document.cookie
          .split('; ')
          .find(row => row.startsWith('username='))
          ?.split('=')[1];
          
        // Prepara i parametri comuni per le richieste API
        const params = new URLSearchParams();
        params.append('docente', loggedDocente);
        params.append('anno', planningYear);
        
        // Aggiungi parametri per gli insegnamenti selezionati
        if (window.InsegnamentiManager) {
          const selected = window.InsegnamentiManager.getSelected();
          
          // Se nessun insegnamento è selezionato, mostra solo gli esami del docente
          if (selected.size === 0) {
            params.append('solo_docente', 'true');
          } else {
            // Aggiungi codici insegnamenti
            const codici = Array.from(selected.keys());
            params.append('insegnamenti', codici.join(','));
            
            // Raccogli anni corso e semestri
            const anniCorso = new Set();
            const semestri = new Set();
            selected.forEach(ins => {
              if (ins.anno_corso) anniCorso.add(ins.anno_corso);
              if (ins.semestre) semestri.add(ins.semestre);
            });
            
            // Aggiungi parametri per anno corso e semestre
            if (anniCorso.size > 0) {
              params.append('anni_corso', Array.from(anniCorso).join(','));
            }
            if (semestri.size > 0) {
              params.append('semestri', Array.from(semestri).join(','));
            }
          }
        } else {
          // Se InsegnamentiManager non è disponibile, mostra solo gli esami del docente
          params.append('solo_docente', 'true');
        }
        
        // Esegui richiesta API
        fetch('/flask/api/getEsami?' + params.toString())
          .then(response => response.json())
          .then(data => {
            // Filtra gli eventi in base al tipo di calendario, se specificato
            if (calendarType && calendarType !== 'Completo') {
              // Per calendari di sessione, filtra per data
              let startDate, endDate;
              
              switch(calendarType) {
                case 'Anticipata':
                  startDate = new Date(sessioni.anticipata.start);
                  endDate = new Date(sessioni.anticipata.end);
                  break;
                case 'Estiva':
                  startDate = new Date(sessioni.estiva.start);
                  endDate = new Date(sessioni.estiva.end);
                  break;
                case 'Autunnale':
                  startDate = new Date(sessioni.autunnale.start);
                  endDate = new Date(sessioni.autunnale.end);
                  break;
                case 'Invernale':
                  startDate = new Date(sessioni.invernale.start);
                  endDate = new Date(sessioni.invernale.end);
                  break;
                case 'PausaDidatticaPrimo':
                  startDate = new Date(sessioni.pausa_primo.start);
                  endDate = new Date(sessioni.pausa_primo.end);
                  break;
                case 'PausaDidatticaSecondo':
                  startDate = new Date(sessioni.pausa_secondo.start);
                  endDate = new Date(sessioni.pausa_secondo.end);
                  break;
              }
              
              // Aggiungiamo un giorno alla data di fine per includerla completamente
              endDate.setDate(endDate.getDate() + 1);
              
              // Filtra gli eventi che rientrano nel periodo della sessione
              data = data.filter(event => {
                const eventDate = new Date(event.start);
                return eventDate >= startDate && eventDate < endDate;
              });
            }
            
            if (successCallback) {
              // Siamo nel callback events di FullCalendar
              successCallback(data);
            } else {
              // Aggiorna tutti i calendari
              calendarIds.forEach(calId => {
                const calendar = window[`calendar_${calId.name.toLowerCase()}`];
                if (calendar) {
                  // Rimuovi tutti gli eventi esistenti
                  calendar.getEventSources().forEach(source => source.remove());
                  
                  // Filtra gli eventi per questo calendario specifico
                  let calendarEvents = data;
                  if (calId.name !== 'Completo') {
                    calendarEvents = data.filter(event => {
                      const eventDate = new Date(event.start);
                      let startDate, endDate;
                      
                      switch(calId.name) {
                        case 'Anticipata':
                          startDate = new Date(sessioni.anticipata.start);
                          endDate = new Date(sessioni.anticipata.end);
                          break;
                        case 'Estiva':
                          startDate = new Date(sessioni.estiva.start);
                          endDate = new Date(sessioni.estiva.end);
                          break;
                        case 'Autunnale':
                          startDate = new Date(sessioni.autunnale.start);
                          endDate = new Date(sessioni.autunnale.end);
                          break;
                        case 'Invernale':
                          startDate = new Date(sessioni.invernale.start);
                          endDate = new Date(sessioni.invernale.end);
                          break;
                        case 'PausaDidatticaPrimo':
                          startDate = new Date(sessioni.pausa_primo.start);
                          endDate = new Date(sessioni.pausa_primo.end);
                          break;
                        case 'PausaDidatticaSecondo':
                          startDate = new Date(sessioni.pausa_secondo.start);
                          endDate = new Date(sessioni.pausa_secondo.end);
                          break;
                      }
                      
                      // Aggiungi un giorno alla data di fine per includerla
                      endDate.setDate(endDate.getDate() + 1);
                      return eventDate >= startDate && eventDate < endDate;
                    });
                  }
                  
                  // Aggiungi gli eventi filtrati al calendario
                  calendar.addEventSource(calendarEvents);
                }
              });
            }
          })
          .catch(error => {
            console.error('Errore nel caricamento degli esami:', error);
            if (successCallback) {
              successCallback([]);  // Invia array vuoto in caso di errore
            }
          });
      }

      // Funzione per creare le opzioni di configurazione per ciascun calendario
      function createCalendarConfig(calendarType) {
        let validRange = {};
        let initialDate;

        // Imposta l'intervallo valido e la data iniziale in base al tipo di calendario
        switch(calendarType) {
          case 'Anticipata':
            validRange = {
              start: sessioni.anticipata.start,
              end: sessioni.anticipata.end
            };
            initialDate = sessioni.anticipata.start;
            break;
          case 'Estiva':
            validRange = {
              start: sessioni.estiva.start,
              end: sessioni.estiva.end
            };
            initialDate = sessioni.estiva.start;
            break;
          case 'Autunnale':
            validRange = {
              start: sessioni.autunnale.start,
              end: sessioni.autunnale.end
            };
            initialDate = sessioni.autunnale.start;
            break;
          case 'Invernale':
            validRange = {
              start: sessioni.invernale.start,
              end: sessioni.invernale.end
            };
            initialDate = sessioni.invernale.start;
            break;
          case 'PausaDidatticaPrimo':
            validRange = {
              start: sessioni.pausa_primo.start,
              end: sessioni.pausa_primo.end
            };
            initialDate = sessioni.pausa_primo.start;
            break;
          case 'PausaDidatticaSecondo':
            validRange = {
              start: sessioni.pausa_secondo.start,
              end: sessioni.pausa_secondo.end
            };
            initialDate = sessioni.pausa_secondo.start;
            break;
          case 'Completo':
          default:
            validRange = dateRange;
            initialDate = dateRange.start;
            break;
        }

        return {
          contentHeight: 'auto',
          locale: "it",
          initialDate: initialDate,
          initialView: "dayGridMonth",
          selectable: true,
          events: (info, successCallback) => fetchCalendarEvents(info, successCallback, calendarType),
          validRange: function() {
            return validRange;
          },
          headerToolbar: calendarType === 'Completo' ? {
            left: 'title',
            center: '',
            right: 'pulsanteInsegnamenti pulsanteDebug prev,next'
          } : {
            left: 'title',
            center: '',
            right: 'prev,next'
          },
          customButtons: {
            pulsanteInsegnamenti: {
              text: 'Insegnamenti',
              click: function(e) {
                // Position and show courses dropdown
                const button = e.currentTarget;
                const rect = button.getBoundingClientRect();
                dropdownInsegnamenti.style.top = `${rect.bottom}px`;
                dropdownInsegnamenti.style.left = `${rect.left}px`;
                
                // Chiudi altri dropdown
                dropdownSessioni.classList.remove('show');
                
                // Get courses from API
                const docente = document.cookie
                  .split('; ')
                  .find(row => row.startsWith('username='))
                  ?.split('=')[1];
                  
                fetch(`/flask/api/getInsegnamentiDocente?anno=${planningYear}&docente=${docente}`)
                  .then(response => response.json())
                  .then(insegnamenti => {
                    // Raggruppa gli insegnamenti per CDS
                    const insegnamentiPerCds = {};
                    
                    insegnamenti.forEach(ins => {
                      if (!insegnamentiPerCds[ins.cds_codice]) {
                        insegnamentiPerCds[ins.cds_codice] = {
                          nome: ins.cds_nome,
                          insegnamenti: []
                        };
                      }
                      insegnamentiPerCds[ins.cds_codice].insegnamenti.push(ins);
                    });
                    
                    // Costruisci l'HTML del dropdown raggruppato per CDS
                    let dropdownHTML = '';
                    
                    // Per ogni CDS, crea una sezione con titolo e lista di insegnamenti
                    Object.keys(insegnamentiPerCds).forEach(cdsCodice => {
                      const cds = insegnamentiPerCds[cdsCodice];
                      
                      // Aggiungi il titolo del CDS
                      dropdownHTML += `<div class="dropdown-cds-title">${cds.nome}</div>`;
                      
                      // Aggiungi gli insegnamenti del CDS con indentazione
                      cds.insegnamenti.forEach(ins => {
                        // Usa InsegnamentiManager per verificare se l'insegnamento è selezionato
                        const isSelected = window.InsegnamentiManager && window.InsegnamentiManager.isSelected(ins.codice);
                        
                        dropdownHTML += `
                          <div class="dropdown-item dropdown-item-indented" data-codice="${ins.codice}" data-semestre="${ins.semestre}" data-anno-corso="${ins.anno_corso || ''}" data-cds="${ins.cds_codice}">
                            <input type="checkbox" id="ins-${ins.codice}" 
                              value="${ins.codice}"
                              ${isSelected ? 'checked' : ''}>
                            <label for="ins-${ins.codice}">${ins.titolo}</label>
                          </div>
                        `;
                      });
                    });
                    
                    // Aggiorna il contenuto del dropdown
                    dropdownInsegnamenti.innerHTML = dropdownHTML;
                    
                    // Aggiorna il CSS per il dropdown
                    const style = document.createElement('style');
                    style.textContent = `
                      .dropdown-cds-title {
                        font-weight: bold;
                        padding: 8px 12px;
                        background-color: #f8f9fa;
                        border-bottom: 1px solid #ddd;
                        margin-top: 5px;
                      }
                      .dropdown-item-indented {
                        margin-left: 15px;
                        border-left: 3px solid #e9ecef;
                      }
                    `;
                    document.head.appendChild(style);
                    
                    // Mostra il dropdown
                    dropdownInsegnamenti.classList.toggle('show');
                  });
              }
            },
            pulsanteDebug: {
              text: '(Debug) Tutti gli esami',
              click: function() {
                // Rimuovi tutti gli eventi esistenti da tutti i calendari
                calendarIds.forEach(calId => {
                  const calendar = window[`calendar_${calId.name.toLowerCase()}`];
                  if (calendar) {
                    calendar.getEventSources().forEach(source => source.remove());
                  }
                });
                
                // Usa un parametro speciale per indicare che vuoi tutti gli esami
                fetch('/flask/api/getEsami?all=true')
                  .then(response => response.json())
                  .then(data => {
                    // Distribuisci gli eventi nei calendari appropriati
                    calendarIds.forEach(calId => {
                      const calendar = window[`calendar_${calId.name.toLowerCase()}`];
                      if (calendar) {
                        let calendarEvents = data;
                        
                        // Per calendari specifici, filtra gli eventi
                        if (calId.name !== 'Completo') {
                          calendarEvents = data.filter(event => {
                            const eventDate = new Date(event.start);
                            let startDate, endDate;
                            
                            switch(calId.name) {
                              case 'Anticipata':
                                startDate = new Date(sessioni.anticipata.start);
                                endDate = new Date(sessioni.anticipata.end);
                                break;
                              case 'Estiva':
                                startDate = new Date(sessioni.estiva.start);
                                endDate = new Date(sessioni.estiva.end);
                                break;
                              case 'Autunnale':
                                startDate = new Date(sessioni.autunnale.start);
                                endDate = new Date(sessioni.autunnale.end);
                                break;
                              case 'Invernale':
                                startDate = new Date(sessioni.invernale.start);
                                endDate = new Date(sessioni.invernale.end);
                                break;
                              case 'PausaDidatticaPrimo':
                                startDate = new Date(sessioni.pausa_primo.start);
                                endDate = new Date(sessioni.pausa_primo.end);
                                break;
                              case 'PausaDidatticaSecondo':
                                startDate = new Date(sessioni.pausa_secondo.start);
                                endDate = new Date(sessioni.pausa_secondo.end);
                                break;
                            }
                            
                            // Aggiungi un giorno alla data di fine per includerla
                            endDate.setDate(endDate.getDate() + 1);
                            return eventDate >= startDate && eventDate < endDate;
                          });
                        }
                        
                        calendar.addEventSource(calendarEvents);
                      }
                    });
                  })
                  .catch(error => {
                    console.error('Errore nel caricamento degli esami:', error);
                  });
              }
            }
          },
          buttonText: {
            today: 'Oggi',
          },
          weekends: false,
          displayEventTime: true,
          eventDisplay: 'block',
          eventTimeFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          },
          showNonCurrentDates: false, 
          fixedWeekCount: false,
          slotMinTime: '08:00:00',
          slotMaxTime: '19:00:00',
          allDaySlot: false,
          slotDuration: '05:00:00',
          slotLabelContent: function(arg) {
            return arg.date.getHours() < 13 ? 'Mattina' : 'Pomeriggio';
          },
          dateClick: function (info) {
            const dataClick = new Date(info.dateStr);
            const periodo = info.view.type === 'timeGrid' ? 
              (info.date.getHours() < 14 ? '0' : '1') : 
              null;
            
            // Verifica se la data è valida per qualsiasi sessione
            const dataValida = dateValide.some(([start, end]) => {
                const startDate = new Date(start);
                const endDate = new Date(end);
                endDate.setHours(23, 59, 59, 999); // Imposta la fine della giornata, altrimenti conta anche il giorno successivo
                
                return dataClick >= startDate && dataClick <= endDate;
            });

            if (!dataValida) {
              alert('Non è possibile inserire esami al di fuori delle sessioni o delle pause didattiche');
              return;
            }

            if (document.cookie.split(';').some(cookie => cookie.trim().startsWith('username='))) {
              // Formatta la data nel formato YYYY-MM-DD per l'input type="date"
              const formattedDate = dataClick.toISOString().split('T')[0];
              document.getElementById('dataora').value = formattedDate;
              if (periodo !== null) {
                document.getElementById('periodo').value = periodo;
              }
              
              // Usa InsegnamentiManager per pre-popolare il form
              if (window.InsegnamentiManager && window.InsegnamentiManager.getSelectedCodes().length > 0) {
                const username = document.cookie
                  .split('; ')
                  .find(row => row.startsWith('username='))
                  ?.split('=')[1];
                
                if (username) {
                  // Prima svuota il contenitore attuale dei tag
                  const multiSelectBox = document.getElementById('insegnamentoBox');
                  if (multiSelectBox) {
                    // Salva il placeholder se esiste
                    const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
                    
                    // Rimuovi tutti i tag esistenti (svuota il contenitore)
                    multiSelectBox.innerHTML = '';
                    
                    // Ripristina il placeholder se necessario
                    if (placeholder && window.InsegnamentiManager.getSelectedCodes().length === 0) {
                      multiSelectBox.appendChild(placeholder.cloneNode(true));
                    }
                  
                    // Carica gli insegnamenti selezionati
                    window.InsegnamentiManager.loadSelectedInsegnamenti(username, function(data) {
                      if (data.length > 0) {
                        // Rimuovi il placeholder se presente
                        const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
                        if (placeholder) {
                          placeholder.remove();
                        }
                        
                        // Aggiungi i tag per tutti gli insegnamenti selezionati
                        data.forEach(ins => {
                          // Se la funzione createInsegnamentoTag è disponibile, usa quella
                          if (typeof window.createInsegnamentoTag === 'function') {
                            window.createInsegnamentoTag(ins.codice, ins.titolo, multiSelectBox);
                          } else {
                            // Crea il tag manualmente
                            const tag = document.createElement('div');
                            tag.className = 'multi-select-tag';
                            tag.dataset.value = ins.codice;
                            tag.innerHTML = ins.titolo + '<span class="multi-select-tag-remove">&times;</span>';
                            
                            // Aggiungi evento per rimuovere il tag
                            tag.querySelector('.multi-select-tag-remove').addEventListener('click', function(e) {
                              e.stopPropagation();
                              
                              // Rimuovi il tag
                              tag.remove();
                              
                              // Se non ci sono più tag, mostra il placeholder
                              if (multiSelectBox.querySelectorAll('.multi-select-tag').length === 0) {
                                const newPlaceholder = document.createElement('span');
                                newPlaceholder.className = 'multi-select-placeholder';
                                newPlaceholder.textContent = 'Seleziona gli insegnamenti';
                                multiSelectBox.appendChild(newPlaceholder);
                              }
                              
                              // Deseleziona l'insegnamento nel manager
                              if (window.InsegnamentiManager) {
                                window.InsegnamentiManager.deselectInsegnamento(ins.codice);
                              }
                              
                              // Aggiorna la select nascosta
                              if (window.updateHiddenSelect) {
                                window.updateHiddenSelect();
                              }
                            });
                            
                            multiSelectBox.appendChild(tag);
                          }
                        });
                        
                        // Aggiorna la select nascosta
                        if (window.updateHiddenSelect) {
                          window.updateHiddenSelect();
                        }
                        
                        // Aggiorna anche le opzioni nel dropdown, marcandole come selezionate
                        const options = document.querySelectorAll('#insegnamentoOptions .multi-select-option');
                        options.forEach(option => {
                          if (window.InsegnamentiManager.isSelected(option.dataset.value)) {
                            option.classList.add('selected');
                          }
                        });
                      }
                    });
                  }
                }
              }
              
              // Mostra il form
              document.getElementById('popupOverlay').style.display = 'flex';
            } else {
              alert("Devi essere loggato per inserire un esame.");
            }
          },
          eventClick: function (info) {
            let dataEvento = calendar.formatDate(info.event.start, {
              month: 'long',
              year: 'numeric',
              day: 'numeric',
              locale: 'it'
            });
            alert('Titolo: ' + info.event.title + '\n' + 'Data: ' + dataEvento + '\n' + 'Aula: ' + info.event.extendedProps.aula);
          },
          eventDidMount: function(info) {
            info.el.title = info.event.extendedProps.description;
            
            const loggedDocente = document.cookie
              .split('; ')
              .find(row => row.startsWith('username='))
              ?.split('=')[1];
            
            // Imposta il colore blu per i propri esami
            const color = info.event.extendedProps.docente === loggedDocente 
              ? '#0a58ca'   // blu per i propri esami
              : '#C12235';  // rosso per gli esami degli altri
            
            info.el.style.backgroundColor = color;
            info.el.style.borderColor = color;
          },
          eventContent: function(arg) {
            const event = arg.event;
            const annoCorso = event.extendedProps.annoCorso;
            const semestre = event.extendedProps.semestre;
            const annoAcc = event.extendedProps.annoAccademico;
            return {
              html: `
                <div class="fc-event-main-frame">
                  <div class="fc-event-time">${arg.timeText}</div>
                  <div class="fc-event-title-container">
                    <div class="fc-event-title fc-sticky">${event.title}</div>
                    <div class="fc-event-description">
                      A.A. ${annoAcc}/${parseInt(annoAcc)+1}
                      - Anno ${annoCorso}° 
                      - ${semestre}° sem.
                    </div>
                  </div>
                </div>
              `
            };
          },
          dayCellClassNames: function(arg) {
            const dataCorrente = arg.date;
            
            // Verifica se la data è valida per qualsiasi sessione
            const dataValida = dateValide.some(([start, end]) => {
                const startDate = new Date(start);
                const endDate = new Date(end);
                endDate.setHours(23, 59, 59, 999); // Imposta la fine della giornata, altrimenti conta anche il giorno successivo
                
                return dataCorrente >= startDate && dataCorrente <= endDate;
            });
            
            return dataValida ? [] : ['fc-disabled-day'];
          }
        };
      }

      // Inizializza i calendari
      calendarIds.forEach(calId => {
        const calendarEl = document.getElementById(calId.id);
        if (calendarEl) {
          const calendarConfig = createCalendarConfig(calId.name);
          const calendar = new FullCalendar.Calendar(calendarEl, calendarConfig);
          calendar.render();
          window[`calendar_${calId.name.toLowerCase()}`] = calendar;
        }
      });

      // Chiudi dropdown quando clicchi fuori
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.fc-pulsanteInsegnamenti-button') && !e.target.closest('.calendar-dropdown')) {
          dropdownInsegnamenti.classList.remove('show');
        }
        if (!e.target.closest('.fc-pulsanteSessioni-button') && !e.target.closest('#sessioniDropdown')) {
          dropdownSessioni.classList.remove('show');
        }
      });

      // Handler per scelta insegnamenti
      dropdownInsegnamenti.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
          const checkbox = item.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
          
          const codice = item.dataset.codice;
          const semestre = parseInt(item.dataset.semestre);
          const annoCorso = parseInt(item.dataset.annoCorso) || 1;
          const cds = item.dataset.cds;
          
          // Usa InsegnamentiManager invece di selezionare direttamente
          if (window.InsegnamentiManager) {
            if (checkbox.checked) {
              window.InsegnamentiManager.selectInsegnamento(codice, { 
                semestre: semestre, 
                anno_corso: annoCorso,
                cds: cds
              });
            } else {
              window.InsegnamentiManager.deselectInsegnamento(codice);
            }
          }
        }
      });

      // Funzione per aggiornare i checkbox nel dropdown quando lo stato cambia
      function updateDropdownCheckboxes() {
        if (window.InsegnamentiManager) {
          // Trova tutti i checkbox nel dropdown
          const checkboxes = dropdownInsegnamenti.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(checkbox => {
            const code = checkbox.value;
            checkbox.checked = window.InsegnamentiManager.isSelected(code);
          });
        }
      }
      
      // Sostituisci la registrazione del listener per InsegnamentiManager
      if (window.InsegnamentiManager) {
        // Aggiungi il listener con debounce per evitare aggiornamenti multipli troppo vicini
        let debounceTimer;
        window.InsegnamentiManager.onChange(() => {
          // Cancella il timer esistente se presente
          if (debounceTimer) clearTimeout(debounceTimer);
          
          // Imposta un nuovo timer - aggiorna dopo 200ms di inattività
          debounceTimer = setTimeout(() => {
            fetchCalendarEvents();
          }, 100);
        });
      }
    })
    .catch(error => console.error('Errore nel caricamento delle sessioni:', error));
  
  // Aggiungi un event handler per il pulsante di chiusura del form
  const closeButton = document.getElementById('closeOverlay');
  if (closeButton) {
    closeButton.addEventListener('click', function() {
      // Quando il form viene chiuso, assicurati che al prossimo click
      // vengano visualizzati tutti gli insegnamenti selezionati
      window.preselectedInsegnamenti = [];
      
      // Rifletti le modifiche nella visualizzazione del calendario
      fetchCalendarEvents();
    });
  }
  
  // Anche quando si clicca fuori dal form per chiuderlo
  const popupOverlay = document.getElementById('popupOverlay');
  if (popupOverlay) {
    popupOverlay.addEventListener('click', function(event) {
      if (event.target === popupOverlay) {
        // Quando il form viene chiuso, assicurati che al prossimo click
        // vengano visualizzati tutti gli insegnamenti selezionati
        window.preselectedInsegnamenti = [];
        
        // Rifletti le modifiche nella visualizzazione del calendario
        fetchCalendarEvents();
      }
    });
  }

  // Aggiorna anche gli event listener del popup form
  closeButton.addEventListener('click', function() {
    window.preselectedInsegnamenti = [];
    fetchCalendarEvents();  // Usa la funzione unificata
  });

  popupOverlay.addEventListener('click', function(event) {
    if (event.target === popupOverlay) {
      window.preselectedInsegnamenti = [];
      fetchCalendarEvents();  // Usa la funzione unificata
    }
  });
});