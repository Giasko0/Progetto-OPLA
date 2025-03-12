document.addEventListener("DOMContentLoaded", () => {
  // ------- Inizializzazione e variabili -------
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
  const anno_accademico = currentMonth >= 9 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  
  // Imposta l'anno accademico nel campo hidden
  const annoAccademicoField = document.getElementById('anno_accademico');
  if (annoAccademicoField) {
    annoAccademicoField.value = anno_accademico;
  }

  // ------- Funzioni per gestire gli elementi della UI -------
  
  // Inizializza ascoltatori eventi
  initEventListeners();
  
  // Inizializza la UI
  initUI();
  
  // Funzione per inizializzare gli ascoltatori di eventi
  function initEventListeners() {
    // Ascoltatori per filtro aule
    const dataoraInput = document.getElementById("dataora");
    const oraInput = document.getElementById("ora");
    
    if (dataoraInput) {
      dataoraInput.addEventListener("change", aggiornaAuleDisponibili);
    }
    
    if (oraInput) {
      oraInput.addEventListener("change", aggiornaAuleDisponibili);
    }
    
    // Gestione opzioni avanzate
    const pulsanteAdv = document.getElementById("buttonOpzioniAvanzate");
    if (pulsanteAdv) {
      pulsanteAdv.addEventListener("click", toggleOpzioniAvanzate);
    }
    
    // Gestione submit del form
    const form = document.getElementById("formEsame");
    if (form) {
      form.addEventListener("submit", handleFormSubmit);
    }
    
    // Gestione chiusura overlay
    const closeOverlay = document.getElementById('closeOverlay');
    if (closeOverlay) {
      closeOverlay.addEventListener('click', closePopupOverlay);
    }
    
    // Chiusura overlay su click esterno
    window.addEventListener('click', function(event) {
      const popupOverlay = document.getElementById('popupOverlay');
      if (event.target === popupOverlay) {
        closePopupOverlay();
      }
    });
  }
  
  // Funzione per inizializzare la UI
  function initUI() {
    // Inizializza la select multipla
    initMultiSelect();
    
    // Popola le aule iniziali
    popolaAule();
    
    // Popola gli insegnamenti
    popolaInsegnamenti();
    
    // Imposta username nel campo docente
    setUsernameField('docente');
    
    // Personalizza il saluto
    personalizzaSaluto();
    
    // Controlla insegnamenti preselezionati
    checkPreselectedInsegnamenti();
  }
  
  // Funzione per personalizzare il saluto
  function personalizzaSaluto() {
    getUserData().then(data => {
      if (data && data.authenticated && data.user_data) {
        const userData = data.user_data;
        const titolo = document.querySelector('.titolo');
        if (titolo) {
          const nomeCompleto = userData.nome && userData.cognome ? 
            `${userData.nome} ${userData.cognome}` : 
            userData.username;
          titolo.textContent = `Benvenuto, ${nomeCompleto}!`;
        }
      }
    }).catch(error => {
      console.error('Errore nel recupero dei dati utente:', error);
    });
  }
  
  // Funzione per chiudere il popup overlay
  function closePopupOverlay() {
    const popupOverlay = document.getElementById('popupOverlay');
    if (popupOverlay) {
      popupOverlay.style.display = 'none';
    }
  }
  
  // Funzione per mostrare/nascondere opzioni avanzate
  function toggleOpzioniAvanzate() {
    const opzioni = document.getElementById("opzioniAvanzate");
    const button = document.getElementById("buttonOpzioniAvanzate");
    
    if (!opzioni || !button) return;
    
    if (opzioni.style.display === "grid") {
      opzioni.style.display = "none";
      button.innerHTML = "Opzioni avanzate &#x25BA;"; // freccia verso destra
    } else {
      opzioni.style.display = "grid";
      button.innerHTML = "Opzioni avanzate &#x25BC;"; // freccia verso il basso
    }
  }

  // ------- Funzioni per la gestione degli insegnamenti -------
  
  // Funzione per controllare insegnamenti preselezionati
  function checkPreselectedInsegnamenti() {
    // Controlla se c'è un parametro nell'URL che indica insegnamenti preselezionati
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedInsegnamenti = urlParams.get('insegnamenti');
    
    if (preselectedInsegnamenti) {
      window.preselectedInsegnamenti = preselectedInsegnamenti.split(',');
    }
  }
  
  // Funzione per popolare insegnamenti
  function popolaInsegnamenti() {
    getUserData().then(data => {
      if (data && data.authenticated && data.user_data) {
        const userData = data.user_data;
        fetch('/api/ottieniInsegnamenti?username=' + userData.username)
          .then(response => response.json())
          .then(data => {
            const optionsContainer = document.getElementById('insegnamentoOptions');
            if (!optionsContainer) return;
            
            optionsContainer.innerHTML = '';
            
            data.forEach(ins => {
              const option = document.createElement('div');
              option.className = 'multi-select-option';
              option.dataset.value = ins.codice;
              option.textContent = ins.titolo;
              
              option.addEventListener('click', function() {
                toggleOption(this);
              });
              
              optionsContainer.appendChild(option);
            });
            
            preselectInsegnamenti();
            setupExistingTagsRemoval();
          })
          .catch(error => console.error('Errore nel caricamento degli insegnamenti:', error));
      }
    }).catch(error => {
      console.error('Errore nel recupero dei dati utente:', error);
    });
  }
  
  // Funzione per preselezionare insegnamenti
  function preselectInsegnamenti() {
    if (!window.preselectedInsegnamenti || !window.preselectedInsegnamenti.length) return;
    
    if (window.InsegnamentiManager) {
      const selectedCodes = window.InsegnamentiManager.getSelectedCodes();
      if (selectedCodes.length > 0) {
        window.preselectedInsegnamenti = selectedCodes;
      }
    }
    
    const options = document.querySelectorAll('.multi-select-option');
    const multiSelectBox = document.getElementById('insegnamentoBox');
    if (!multiSelectBox) return;
    
    const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
    if (placeholder && options.length > 0) {
      placeholder.remove();
    }
    
    let preselectedCount = 0;
    
    options.forEach(option => {
      if (window.preselectedInsegnamenti.includes(option.dataset.value)) {
        const existingTag = Array.from(multiSelectBox.querySelectorAll('.multi-select-tag'))
          .find(tag => tag.dataset.value === option.dataset.value);
        
        if (!option.classList.contains('selected') && !existingTag) {
          option.classList.add('selected');
          
          const tag = document.createElement('div');
          tag.className = 'multi-select-tag';
          tag.dataset.value = option.dataset.value;
          tag.innerHTML = option.textContent + '<span class="multi-select-tag-remove">&times;</span>';
          
          const removeHandler = createTagRemoveHandler(tag, option.dataset.value, option);
          tag.querySelector('.multi-select-tag-remove').addEventListener('click', removeHandler);
          
          multiSelectBox.appendChild(tag);
          preselectedCount++;
        }
      }
    });
    
    if (preselectedCount === 0 && window.preselectedInsegnamenti.length > 0) {
      loadPreselectedFromServer(multiSelectBox);
    } else if (preselectedCount > 0) {
      updateHiddenSelect();
    }
  }
  
  // Carica insegnamenti preselezionati dal server
  function loadPreselectedFromServer(multiSelectBox) {
    const username = document.getElementById('docente')?.value;
    if (!username) return;
    
    const insegnamentiCodes = window.preselectedInsegnamenti.join(',');
    fetch(`/api/ottieniInsegnamenti?username=${username}&codici=${insegnamentiCodes}`)
      .then(response => response.json())
      .then(data => {
        if (data.length > 0) {
          const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
          if (placeholder) {
            placeholder.remove();
          }
          
          data.forEach(ins => {
            createInsegnamentoTag(ins.codice, ins.titolo, multiSelectBox);
          });
          
          updateHiddenSelect();
        }
      })
      .catch(error => console.error('Errore nel caricamento degli insegnamenti preselezionati:', error));
  }

  // ------- Funzioni per la select multipla -------
  
  // Inizializza la select multipla
  function initMultiSelect() {
    const multiSelectBox = document.getElementById('insegnamentoBox');
    const multiSelectDropdown = document.getElementById('insegnamentoDropdown');
    
    if (!multiSelectBox || !multiSelectDropdown) {
      return;
    }
    
    multiSelectBox.addEventListener('click', function(e) {
      e.stopPropagation();
      const isActive = multiSelectDropdown.style.display === 'block';
      
      multiSelectDropdown.style.display = isActive ? 'none' : 'block';
    });
    
    document.addEventListener('click', function(e) {
      if (!multiSelectBox.contains(e.target) && !multiSelectDropdown.contains(e.target)) {
        multiSelectDropdown.style.display = 'none';
        multiSelectBox.classList.remove('active');
      }
    });
    
    multiSelectDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
  
  // Toggle opzione nella select multipla
  function toggleOption(option) {
    const value = option.dataset.value;
    const text = option.textContent;
    const multiSelectBox = document.getElementById('insegnamentoBox');
    
    const existingTag = Array.from(multiSelectBox.querySelectorAll('.multi-select-tag'))
      .find(tag => tag.dataset.value === value);
    
    if (option.classList.contains('selected') || existingTag) {
      // Deseleziona
      option.classList.remove('selected');
      
      if (existingTag) {
        existingTag.remove();
      }
      
      if (multiSelectBox.querySelectorAll('.multi-select-tag').length === 0) {
        addPlaceholder(multiSelectBox);
      }
      
      if (window.InsegnamentiManager) {
        window.InsegnamentiManager.deselectInsegnamento(value);
      }
    } else {
      // Seleziona
      option.classList.add('selected');
      
      const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
      if (placeholder) {
        placeholder.remove();
      }
      
      if (!existingTag) {
        createInsegnamentoTag(value, text, multiSelectBox);
      }
      
      if (window.InsegnamentiManager) {
        const metadata = {
          semestre: 1,  // valore di default
          anno_corso: 1 // valore di default
        };
        
        window.InsegnamentiManager.selectInsegnamento(value, metadata);
      }
    }
    
    updateHiddenSelect();
  }
  
  // Crea tag per insegnamento
  function createInsegnamentoTag(value, text, container) {
    const tag = document.createElement('div');
    tag.className = 'multi-select-tag';
    tag.dataset.value = value;
    tag.innerHTML = text + '<span class="multi-select-tag-remove">&times;</span>';
    
    const option = document.querySelector(`.multi-select-option[data-value="${value}"]`);
    
    tag.querySelector('.multi-select-tag-remove').addEventListener('click', createTagRemoveHandler(tag, value, option));
    
    container.appendChild(tag);
    
    return tag;
  }
  
  // Crea handler per rimuovere un tag
  function createTagRemoveHandler(tag, value, option) {
    return function(e) {
      e.stopPropagation();
      
      tag.remove();
      
      if (option) {
        option.classList.remove('selected');
      }
      
      const multiSelectBox = document.getElementById('insegnamentoBox');
      if (multiSelectBox && multiSelectBox.querySelectorAll('.multi-select-tag').length === 0) {
        addPlaceholder(multiSelectBox);
      }
      
      if (window.InsegnamentiManager) {
        window.InsegnamentiManager.deselectInsegnamento(value);
      }
      
      updateHiddenSelect();
    };
  }
  
  // Aggiunge placeholder alla select multipla
  function addPlaceholder(container) {
    const placeholder = document.createElement('span');
    placeholder.className = 'multi-select-placeholder';
    placeholder.textContent = 'Seleziona gli insegnamenti';
    container.appendChild(placeholder);
  }
  
  // Configura rimozione tag esistenti
  function setupExistingTagsRemoval() {
    const multiSelectBox = document.getElementById('insegnamentoBox');
    if (!multiSelectBox) return;
    
    const existingTags = multiSelectBox.querySelectorAll('.multi-select-tag');
    existingTags.forEach(tag => {
      const removeButton = tag.querySelector('.multi-select-tag-remove');
      if (removeButton) {
        const newRemoveButton = removeButton.cloneNode(true);
        removeButton.parentNode.replaceChild(newRemoveButton, removeButton);
        
        newRemoveButton.addEventListener('click', function(e) {
          e.stopPropagation();
          
          const value = tag.dataset.value;
          
          tag.remove();
          
          const option = document.querySelector(`.multi-select-option[data-value="${value}"]`);
          if (option) {
            option.classList.remove('selected');
          }
          
          if (multiSelectBox.querySelectorAll('.multi-select-tag').length === 0) {
            addPlaceholder(multiSelectBox);
          }
          
          if (window.InsegnamentiManager) {
            window.InsegnamentiManager.deselectInsegnamento(value);
          }
          
          updateHiddenSelect();
        });
      }
    });
  }
  
  // Aggiorna la select nascosta
  function updateHiddenSelect() {
    const hiddenSelect = document.getElementById('insegnamento');
    if (!hiddenSelect) return;
    
    const tags = document.querySelectorAll('.multi-select-tag');
    
    while (hiddenSelect.options.length > 0) {
      hiddenSelect.remove(0);
    }
    
    tags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag.dataset.value;
      option.textContent = tag.textContent.replace('×', '').trim();
      option.selected = true;
      hiddenSelect.appendChild(option);
    });
  }

  // ------- Funzioni per gestire le aule -------
  
  // Popola select con aule predefinite
  function popolaAule() {
    const selectAula = document.getElementById("aula");
    if (selectAula) {
      selectAula.innerHTML = '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
    }
  }
  
  // Aggiorna aule disponibili in base a data e ora
  function aggiornaAuleDisponibili() {
    const dataoraInput = document.getElementById("dataora");
    const oraInput = document.getElementById("ora");
    const selectAula = document.getElementById("aula");
    
    if (!dataoraInput || !oraInput || !selectAula) return;
    
    const data = dataoraInput.value;
    const ora = oraInput.value;
    
    if (!data || !ora) {
      selectAula.innerHTML = '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
      return;
    }
    
    const periodo = determinaPeriodo(ora);
    const studioDocente = "Studio docente DMI";
    
    fetch(`/api/ottieniAule?data=${data}&periodo=${periodo}`)
      .then((response) => response.json())
      .then((aule) => {
        selectAula.innerHTML = '<option value="" disabled selected hidden>Scegli l\'aula</option>';
        
        let studioDocentePresente = aule.includes(studioDocente);
        
        if (!studioDocentePresente) {
          aule.push(studioDocente);
          aule.sort();
        }
        
        aule.forEach((aula) => {
          let option = document.createElement("option");
          option.value = aula;
          option.textContent = aula;
          
          if (aula === studioDocente && aule.length === 1) {
            option.selected = true;
          }
          
          selectAula.appendChild(option);
        });
      })
      .catch((error) => {
        console.error("Errore nel recupero delle aule:", error);
        selectAula.innerHTML = '<option value="" disabled selected>Errore nel caricamento delle aule</option>';
        
        let option = document.createElement("option");
        option.value = studioDocente;
        option.textContent = studioDocente;
        selectAula.appendChild(option);
      });
  }
  
  // Determina periodo (mattina/pomeriggio) in base all'ora
  function determinaPeriodo(ora) {
    if (!ora) return null;
    const oreParts = ora.split(':');
    const oreInt = parseInt(oreParts[0], 10);
    return oreInt > 13 ? 1 : 0; // 1 pomeriggio, 0 mattina
  }

  // ------- Funzioni di utility -------
  
  // Imposta username in un campo
  function setUsernameField(fieldId) {
    getUserData().then(data => {
      if (data && data.authenticated && data.user_data) {
        const userData = data.user_data;
        const field = document.getElementById(fieldId);
        if (field) {
          field.value = userData.username;
        }
      }
    }).catch(error => {
      console.error('Errore nel recupero dei dati utente:', error);
    });
  }

  // ------- Gestione form e validazione -------
  
  // Validazione ora appello
  function validaOraAppello(ora) {
    if (!ora) return false;
    
    const [hours, minutes] = ora.split(':').map(Number);
    return hours >= 8 && hours <= 23;
  }
  
  // Handler submit form
  function handleFormSubmit(e) {
    e.preventDefault();
    
    const oraAppello = document.getElementById('ora')?.value;
    if (!validaOraAppello(oraAppello)) {
      showPopup("L'ora dell'appello deve essere compresa tra le 08:00 e le 23:00", "Errore di validazione", {type: 'error'});
      return;
    }
    
    const aulaSelezionata = document.getElementById('aula')?.value;
    if (!aulaSelezionata) {
      showPopup("Seleziona un'aula disponibile", "Errore di validazione", {type: 'error'});
      return;
    }
    
    const formData = new FormData(this);

    fetch("/api/inserisciEsame", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "error") {
          showPopup(data.message, "Errore", {type: 'error'});
        } else if (data.status === "validation") {
          mostraPopupConferma(data);
        } else {
          window.preselectedInsegnamenti = [];
          
          if (window.InsegnamentiManager) {
            window.InsegnamentiManager.clearSelection();
          }
          
          showPopup(data.message || "Esami inseriti con successo", "Operazione completata", {
            type: 'success',
            callback: function() {
              window.location.reload();
            }
          });
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        showPopup("Si è verificato un errore durante l'inserimento dell'esame", "Errore", {type: 'error'});
      });
  }

  // Mostra popup di conferma per validazione esami
  function mostraPopupConferma(data) {
    // Crea il contenitore del popup
    const popupContainer = document.createElement('div');
    popupContainer.id = 'popupConferma';
    popupContainer.className = 'popup-overlay';
    popupContainer.style.display = 'flex';
    
    // Crea il contenuto del popup
    const popupContent = document.createElement('div');
    popupContent.className = 'popup';
    popupContent.style.width = 'clamp(500px, 50vw, 800px)';
    
    // Header del popup
    const header = document.createElement('div');
    header.className = 'popup-header';
    header.innerHTML = `
      <h2>Conferma inserimento esami</h2>
      <span id="closeConferma" class="popup-close">&times;</span>
    `;
    
    // Contenuto del popup
    const content = document.createElement('div');
    content.className = 'popup-content';
    
    // Costruisci l'HTML per gli esami validi e invalidi
    let htmlContent = '';
    
    // Se ci sono esami invalidi, mostra un avviso
    if (data.esami_invalidi?.length > 0) {
      htmlContent += `
        <div class="alert alert-warning" style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
          <p><strong>Attenzione!</strong> Alcuni esami non possono essere inseriti:</p>
          <ul style="margin-left: 20px;">
      `;
      
      data.esami_invalidi.forEach(esame => {
        htmlContent += `<li>${esame.titolo || esame.codice}: ${esame.errore}</li>`;
      });
      
      htmlContent += `
          </ul>
        </div>
      `;
    }
    
    // Tabella degli esami validi
    if (data.esami_validi?.length > 0) {
      htmlContent += `
        <p>I seguenti esami possono essere inseriti:</p>
        <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd; background-color: #f2f2f2;">
                  <input type="checkbox" id="selectAllExams" checked> Seleziona tutti
                </th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd; background-color: #f2f2f2;">Insegnamento</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      data.esami_validi.forEach(esame => {
        htmlContent += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
              <input type="checkbox" class="esame-checkbox" data-codice="${esame.codice}" 
                     data-inizio="${esame.data_inizio_iscrizione}" data-fine="${esame.data_fine_iscrizione}" checked>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${esame.titolo}</td>
          </tr>
        `;
      });
      
      htmlContent += `
            </tbody>
          </table>
        </div>
        <div style="text-align: center;">
          <button id="btnConfermaEsami" class="invia" style="margin-right: 10px;">Conferma</button>
          <button id="btnAnnullaEsami" class="invia" style="background-color: #6c757d;">Annulla</button>
        </div>
      `;
    } else {
      htmlContent += `
        <p>Non ci sono esami validi da inserire.</p>
        <div style="text-align: center;">
          <button id="btnAnnullaEsami" class="invia">Chiudi</button>
        </div>
      `;
    }
    
    content.innerHTML = htmlContent;
    
    // Assembla il popup
    popupContent.appendChild(header);
    popupContent.appendChild(content);
    popupContainer.appendChild(popupContent);
    
    // Aggiungi il popup al DOM
    document.body.appendChild(popupContainer);
    
    // Aggiungi event listeners
    document.getElementById('closeConferma')?.addEventListener('click', () => {
      document.body.removeChild(popupContainer);
    });
    
    document.getElementById('btnAnnullaEsami')?.addEventListener('click', () => {
      document.body.removeChild(popupContainer);
    });
    
    // Event listener per "Seleziona tutti"
    const selectAllCheckbox = document.getElementById('selectAllExams');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.esame-checkbox');
        checkboxes.forEach(checkbox => {
          checkbox.checked = selectAllCheckbox.checked;
        });
      });
    }
    
    // Event listener per il pulsante di conferma
    const btnConferma = document.getElementById('btnConfermaEsami');
    if (btnConferma) {
      btnConferma.addEventListener('click', () => {
        // Raccogli gli esami selezionati
        const checkboxes = document.querySelectorAll('.esame-checkbox:checked');
        const esamiSelezionati = Array.from(checkboxes).map(checkbox => ({
          codice: checkbox.dataset.codice,
          data_inizio_iscrizione: checkbox.dataset.inizio,
          data_fine_iscrizione: checkbox.dataset.fine
        }));
        
        // Se non ci sono esami selezionati, mostra un messaggio e non fare nulla
        if (esamiSelezionati.length === 0) {
          showPopup('Seleziona almeno un esame da inserire', 'Attenzione', {type: 'warning'});
          return;
        }
        
        // Invia la richiesta al server per inserire gli esami selezionati
        fetch('/api/confermaEsami', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dati_comuni: data.dati_comuni,
            esami_da_inserire: esamiSelezionati
          }),
        })
        .then(response => response.json())
        .then(response => {
          // Rimuovi il popup
          document.body.removeChild(popupContainer);
          
          if (response.status === 'success' || response.status === 'partial') {
            window.preselectedInsegnamenti = [];
            
            if (window.InsegnamentiManager) {
              window.InsegnamentiManager.clearSelection();
            }
            
            showPopup(response.message, response.status === 'success' ? 'Operazione completata' : 'Inserimento parziale', {
              type: response.status === 'success' ? 'success' : 'warning',
              callback: function() {
                window.location.reload();
              }
            });
          } else {
            showPopup('Errore: ' + response.message, 'Errore', {type: 'error'});
          }
        })
        .catch(error => {
          console.error('Error:', error);
          showPopup('Si è verificato un errore durante l\'inserimento degli esami', 'Errore', {type: 'error'});
        });
      });
    }
  }

  // ------- Esportazione funzioni globali -------
  
  // Rendi le funzioni accessibili globalmente
  window.updateHiddenSelect = updateHiddenSelect;
  window.toggleOption = toggleOption;
  window.createInsegnamentoTag = createInsegnamentoTag;
});