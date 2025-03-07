document.addEventListener("DOMContentLoaded", () => {
  // Calcola l'anno accademico corrente
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
  const anno_accademico = currentMonth >= 9 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  
  // Imposta l'anno accademico nel campo hidden
  document.getElementById('anno_accademico').value = anno_accademico;

  // Inizializza la select multipla personalizzata
  initMultiSelect();
  
  // Controlla se ci sono insegnamenti preselezionati dal calendario
  checkPreselectedInsegnamenti();

  // Funzione per popolare la select con le aule
  function popolaAule() {
    fetch("/flask/api/ottieniAule")
      .then((response) => response.json())
      .then((aule) => {
        const selectAula = document.getElementById("aula");
        // Imposta la prima option di default
        selectAula.innerHTML =
          '<option value="" disabled selected hidden>Scegli l\'aula</option>';
        aule.forEach((aula) => {
          let option = document.createElement("option");
          option.value = aula;
          option.textContent = aula;
          selectAula.appendChild(option);
        });
      })
      .catch((error) =>
        console.error("Errore nel recupero delle aule:", error)
      );
  }
  
  // Funzione per popolare il selettore degli insegnamenti con titolo visibile e codice come value
  function popolaInsegnamenti() {
    const username = document.getElementById('docente').value;
    if (username) {
      fetch('/flask/api/ottieniInsegnamenti?username=' + username)
        .then(response => response.json())
        .then(data => {
          // Ottieni il container delle opzioni
          const optionsContainer = document.getElementById('insegnamentoOptions');
          // Svuota le opzioni esistenti
          optionsContainer.innerHTML = '';
          
          // Aggiungi le opzioni degli insegnamenti
          data.forEach(ins => {
            const option = document.createElement('div');
            option.className = 'multi-select-option';
            option.dataset.value = ins.codice;
            option.textContent = ins.titolo;
            
            // Aggiungi evento click per selezionare/deselezionare
            option.addEventListener('click', function() {
              toggleOption(this);
            });
            
            optionsContainer.appendChild(option);
          });
          
          // Dopo aver popolato gli insegnamenti, controlla se ci sono insegnamenti preselezionati
          preselectInsegnamenti();
          
          // Gestisci l'evento di rimozione per i tag già esistenti
          setupExistingTagsRemoval();
        })
        .catch(error => console.error('Errore nel caricamento degli insegnamenti:', error));
    }
  }
  
  // Funzione per controllare se ci sono insegnamenti preselezionati dal calendario
  function checkPreselectedInsegnamenti() {
    // Controlla se c'è un parametro nell'URL che indica insegnamenti preselezionati
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedInsegnamenti = urlParams.get('insegnamenti');
    
    if (preselectedInsegnamenti) {
      // Salva gli insegnamenti preselezionati in una variabile globale
      window.preselectedInsegnamenti = preselectedInsegnamenti.split(',');
    }
  }
  
  // Funzione per preselezionare gli insegnamenti
  function preselectInsegnamenti() {
    if (window.preselectedInsegnamenti && window.preselectedInsegnamenti.length > 0) {
      // Se è disponibile InsegnamentiManager, usa quello per preselezionare
      if (window.InsegnamentiManager) {
        const selectedCodes = window.InsegnamentiManager.getSelectedCodes();
        if (selectedCodes.length > 0) {
          window.preselectedInsegnamenti = selectedCodes;
        }
      }
      
      // Continua con la logica esistente
      const options = document.querySelectorAll('.multi-select-option');
      const multiSelectBox = document.getElementById('insegnamentoBox');
      
      // Rimuovi il placeholder se presente
      const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
      if (placeholder && options.length > 0) {
        placeholder.remove();
      }
      
      // Tieni traccia di quanti insegnamenti sono stati preselezionati
      let preselectedCount = 0;
      
      options.forEach(option => {
        if (window.preselectedInsegnamenti.includes(option.dataset.value)) {
          // Verifica se l'opzione è già selezionata o se esiste già un tag corrispondente
          const existingTag = Array.from(multiSelectBox.querySelectorAll('.multi-select-tag'))
            .find(tag => tag.dataset.value === option.dataset.value);
          
          if (!option.classList.contains('selected') && !existingTag) {
            // Seleziona questa opzione
            option.classList.add('selected');
            
            // Crea il tag
            const tag = document.createElement('div');
            tag.className = 'multi-select-tag';
            tag.dataset.value = option.dataset.value;
            tag.innerHTML = option.textContent + '<span class="multi-select-tag-remove">&times;</span>';
            
            // Aggiungi evento per rimuovere il tag
            const removeHandler = createTagRemoveHandler(tag, option.dataset.value, option);
            tag.querySelector('.multi-select-tag-remove').addEventListener('click', removeHandler);
            
            multiSelectBox.appendChild(tag);
            preselectedCount++;
          }
        }
      });
      
      // Se non è stato possibile preselezionare nessun insegnamento ma ci sono insegnamenti preselezionati,
      // potrebbe essere necessario caricare gli insegnamenti dal server
      if (preselectedCount === 0 && window.preselectedInsegnamenti.length > 0) {
        // Carica gli insegnamenti specifici dal server
        const username = document.getElementById('docente').value;
        if (username) {
          const insegnamentiCodes = window.preselectedInsegnamenti.join(',');
          fetch(`/flask/api/ottieniInsegnamenti?username=${username}&codici=${insegnamentiCodes}`)
            .then(response => response.json())
            .then(data => {
              if (data.length > 0) {
                // Rimuovi il placeholder se presente
                const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
                if (placeholder) {
                  placeholder.remove();
                }
                
                // Aggiungi i tag per gli insegnamenti
                data.forEach(ins => {
                  // Usa la funzione di creazione tag centralizzata
                  createInsegnamentoTag(ins.codice, ins.titolo, multiSelectBox);
                });
                
                // Aggiorna la select nascosta
                updateHiddenSelect();
              }
            })
            .catch(error => console.error('Errore nel caricamento degli insegnamenti preselezionati:', error));
        }
      } else if (preselectedCount > 0) {
        // Aggiorna la select nascosta
        updateHiddenSelect();
      }
    }
  }
  
  // Funzione per inizializzare la select multipla
  function initMultiSelect() {
    const multiSelectBox = document.getElementById('insegnamentoBox');
    const multiSelectDropdown = document.getElementById('insegnamentoDropdown');
    
    if (!multiSelectBox || !multiSelectDropdown) {
      console.error('Elementi della select multipla non trovati');
      return;
    }
    
    // Apri/chiudi dropdown al click sulla box
    multiSelectBox.addEventListener('click', function(e) {
      e.stopPropagation();
      const isActive = multiSelectDropdown.style.display === 'block';
      
      if (isActive) {
        multiSelectDropdown.style.display = 'none';
        multiSelectBox.classList.remove('active');
      } else {
        multiSelectDropdown.style.display = 'block';
        multiSelectBox.classList.add('active');
      }
    });
    
    // Chiudi dropdown quando si clicca fuori
    document.addEventListener('click', function(e) {
      if (!multiSelectBox.contains(e.target) && !multiSelectDropdown.contains(e.target)) {
        multiSelectDropdown.style.display = 'none';
        multiSelectBox.classList.remove('active');
      }
    });
    
    // Impedisci che il click sul dropdown chiuda il dropdown
    multiSelectDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
  
  // Funzione per rimuovere un tag
  function createTagRemoveHandler(tag, value, option) {
    return function(e) {
      e.stopPropagation();
      
      // Rimuovi il tag
      tag.remove();
      
      // Deseleziona l'opzione se esiste
      if (option) {
        option.classList.remove('selected');
      }
      
      // Se non ci sono più tag, mostra il placeholder
      const multiSelectBox = document.getElementById('insegnamentoBox');
      if (multiSelectBox && multiSelectBox.querySelectorAll('.multi-select-tag').length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'multi-select-placeholder';
        placeholder.textContent = 'Seleziona gli insegnamenti';
        multiSelectBox.appendChild(placeholder);
      }
      
      // Deseleziona l'insegnamento usando InsegnamentiManager per sincronizzare con il calendario
      if (window.InsegnamentiManager) {
        window.InsegnamentiManager.deselectInsegnamento(value);
      }
      
      // Aggiorna la select nascosta
      updateHiddenSelect();
    };
  }

  // Funzione per configurare gli handler di rimozione per i tag esistenti
  function setupExistingTagsRemoval() {
    const multiSelectBox = document.getElementById('insegnamentoBox');
    if (!multiSelectBox) return;
    
    const existingTags = multiSelectBox.querySelectorAll('.multi-select-tag');
    existingTags.forEach(tag => {
      const removeButton = tag.querySelector('.multi-select-tag-remove');
      if (removeButton) {
        // Rimuovi gli event listener esistenti
        const newRemoveButton = removeButton.cloneNode(true);
        removeButton.parentNode.replaceChild(newRemoveButton, removeButton);
        
        // Aggiungi il nuovo event listener che usa InsegnamentiManager
        newRemoveButton.addEventListener('click', function(e) {
          e.stopPropagation();
          
          const value = tag.dataset.value;
          
          // Rimuovi il tag
          tag.remove();
          
          // Deseleziona l'opzione corrispondente
          const option = document.querySelector(`.multi-select-option[data-value="${value}"]`);
          if (option) {
            option.classList.remove('selected');
          }
          
          // Se non ci sono più tag, mostra il placeholder
          if (multiSelectBox.querySelectorAll('.multi-select-tag').length === 0) {
            const placeholder = document.createElement('span');
            placeholder.className = 'multi-select-placeholder';
            placeholder.textContent = 'Seleziona gli insegnamenti';
            multiSelectBox.appendChild(placeholder);
          }
          
          // Deseleziona l'insegnamento usando InsegnamentiManager
          if (window.InsegnamentiManager) {
            window.InsegnamentiManager.deselectInsegnamento(value);
          }
          
          // Aggiorna la select nascosta
          updateHiddenSelect();
        });
      }
    });
  }
  
  // Funzione per selezionare/deselezionare un'opzione
  function toggleOption(option) {
    const value = option.dataset.value;
    const text = option.textContent;
    const multiSelectBox = document.getElementById('insegnamentoBox');
    const hiddenSelect = document.getElementById('insegnamento');
    
    // Controlla se c'è già un tag per questo insegnamento
    const existingTag = Array.from(multiSelectBox.querySelectorAll('.multi-select-tag'))
      .find(tag => tag.dataset.value === value);
    
    if (option.classList.contains('selected') || existingTag) {
      // Deseleziona
      option.classList.remove('selected');
      
      // Rimuovi il tag se esiste
      if (existingTag) {
        existingTag.remove();
      }
      
      // Se non ci sono più tag, mostra il placeholder
      if (multiSelectBox.querySelectorAll('.multi-select-tag').length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'multi-select-placeholder';
        placeholder.textContent = 'Seleziona gli insegnamenti';
        multiSelectBox.appendChild(placeholder);
      }
      
      // Usa InsegnamentiManager per deselezionare
      if (window.InsegnamentiManager) {
        window.InsegnamentiManager.deselectInsegnamento(value);
      }
    } else {
      // Seleziona
      option.classList.add('selected');
      
      // Rimuovi il placeholder se presente
      const placeholder = multiSelectBox.querySelector('.multi-select-placeholder');
      if (placeholder) {
        placeholder.remove();
      }
      
      // Crea il tag solo se non esiste già
      if (!existingTag) {
        const tag = createInsegnamentoTag(value, text, multiSelectBox);
      }
      
      // Usa InsegnamentiManager per selezionare
      const username = document.getElementById('docente').value;
      if (window.InsegnamentiManager) {
        // Ottieni il semestre e l'anno corso dall'elemento se possibile
        const metadata = {
          semestre: 1,  // valore di default
          anno_corso: 1 // valore di default
        };
        
        // Seleziona l'insegnamento
        window.InsegnamentiManager.selectInsegnamento(value, metadata);
      }
    }
    
    // Aggiorna la select nascosta
    updateHiddenSelect();
  }

  // Funzione per creare un tag per un insegnamento selezionato
  function createInsegnamentoTag(value, text, container) {
    // Crea il tag
    const tag = document.createElement('div');
    tag.className = 'multi-select-tag';
    tag.dataset.value = value;
    tag.innerHTML = text + '<span class="multi-select-tag-remove">&times;</span>';
    
    // Trova l'opzione corrispondente
    const option = document.querySelector(`.multi-select-option[data-value="${value}"]`);
    
    // Aggiungi evento per rimuovere il tag
    tag.querySelector('.multi-select-tag-remove').addEventListener('click', createTagRemoveHandler(tag, value, option));
    
    container.appendChild(tag);
    
    return tag;
  }
  
  // Funzione per aggiornare la select nascosta
  function updateHiddenSelect() {
    const hiddenSelect = document.getElementById('insegnamento');
    const tags = document.querySelectorAll('.multi-select-tag');
    
    // Rimuovi tutte le opzioni esistenti
    while (hiddenSelect.options.length > 0) {
      hiddenSelect.remove(0);
    }
    
    // Aggiungi le opzioni selezionate
    tags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag.dataset.value;
      option.textContent = tag.textContent.replace('×', '').trim();
      option.selected = true;
      hiddenSelect.appendChild(option);
    });
  }
  
  // Rendi la funzione accessibile globalmente
  window.updateHiddenSelect = updateHiddenSelect;
  window.toggleOption = toggleOption;
  window.createInsegnamentoTag = createInsegnamentoTag;  // Esporta la funzione di creazione dei tag

  // Esegui funzioni di popolamento
  popolaAule();
  popolaInsegnamenti();

  // Funzione per gestire le opzioni avanzate
  const pulsanteAdv = document.getElementById("buttonOpzioniAvanzate");
  pulsanteAdv.addEventListener("click", function () {
    const opzioni = document.getElementById("opzioniAvanzate");
    if (opzioni.style.display === "grid") {
      opzioni.style.display = "none";
      pulsanteAdv.innerHTML = "Opzioni avanzate &#x25BA;"; // freccia verso destra
    } else {
      opzioni.style.display = "grid";
      pulsanteAdv.innerHTML = "Opzioni avanzate &#x25BC;"; // freccia verso il basso
    }
  });

  // Funzione per validare l'ora dell'appello
  function validaOraAppello(ora) {
    if (!ora) return false;
    
    const [hours, minutes] = ora.split(':').map(Number);
    return hours >= 8 && hours <= 23;
  }

  // Funzione per inviare al server i dati del form
  const form = document.getElementById("formEsame");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    
    // Validazione ora appello
    const oraAppello = document.getElementById('ora').value;
    if (!validaOraAppello(oraAppello)) {
      alert("L'ora dell'appello deve essere compresa tra le 08:00 e le 23:00");
      return;
    }
    
    const formData = new FormData(this);

    fetch("/flask/api/inserisciEsame", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "error") {
          showPopup(data.message);
        } else {
          // Rimuovi eventualmente i preselected insegnamenti
          window.preselectedInsegnamenti = [];
          
          // Se è disponibile InsegnamentiManager, svuota la selezione
          if (window.InsegnamentiManager) {
            window.InsegnamentiManager.clearSelection();
          }
          
          window.location.reload();
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Si è verificato un errore durante l'inserimento dell'esame");
      });
  });
  
  // Variabile per l'anno corrente
  const year = currentDate.getFullYear();
});