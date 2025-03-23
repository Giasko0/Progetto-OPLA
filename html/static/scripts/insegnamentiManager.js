// Sistema centralizzato per la gestione degli insegnamenti tra calendario e form
const InsegnamentiManager = (function () {
  // Mappa degli insegnamenti selezionati: codice -> {codice, anno_corso, semestre, cds}
  let selectedInsegnamenti = new Map();
  // Cache degli insegnamenti recuperati
  let insegnamentiCache = [];
  // Corso di studi selezionato
  let selectedCds = null;
  // Callbacks da chiamare quando cambia la selezione degli insegnamenti
  let onChangeCallbacks = [];
  // Callbacks da chiamare quando cambia il CdS selezionato
  let onCdsChangeCallbacks = [];

  // Variabile per tenere traccia degli eventi già aggiunti
  let eventListenersAdded = new Set();

  // Seleziona un insegnamento
  function selectInsegnamento(codice, metadata) {
    selectedInsegnamenti.set(codice, {
      codice: codice,
      ...metadata,
    });
    notifyChange();
  }

  // Deseleziona un insegnamento
  function deselectInsegnamento(codice) {
    selectedInsegnamenti.delete(codice);
    notifyChange();
  }

  // Controlla se un insegnamento è selezionato
  function isSelected(codice) {
    return selectedInsegnamenti.has(codice);
  }

  // Ottiene tutti i codici degli insegnamenti selezionati
  function getSelectedCodes() {
    return Array.from(selectedInsegnamenti.keys());
  }

  // Ottiene tutti gli insegnamenti selezionati
  function getSelected() {
    return new Map(selectedInsegnamenti);
  }

  // Svuota la selezione
  function clearSelection() {
    selectedInsegnamenti.clear();
    notifyChange();
  }

  // Aggiunge una callback da chiamare quando cambia la selezione
  function onChange(callback) {
    if (typeof callback === "function") {
      onChangeCallbacks.push(callback);
    }
  }

  // Notifica tutti i listener del cambiamento
  function notifyChange() {
    onChangeCallbacks.forEach((callback) => callback(getSelectedCodes()));
  }

  // Seleziona il Corso di Studi da filtrare
  function setCds(cdsCode) {
    const oldCds = selectedCds;
    selectedCds = cdsCode;
    
    if (oldCds !== selectedCds) {
      notifyCdsChange();
    }
  }

  // Ottiene il CdS correntemente selezionato
  function getCds() {
    return selectedCds;
  }

  // Aggiunge una callback da chiamare quando cambia il CdS selezionato
  function onCdsChange(callback) {
    if (typeof callback === "function") {
      onCdsChangeCallbacks.push(callback);
    }
  }

  // Notifica i listener del cambiamento del CdS
  function notifyCdsChange() {
    onCdsChangeCallbacks.forEach((callback) => callback(selectedCds));
  }

  // Carica gli insegnamenti dalla cache o dal server
  function loadInsegnamenti(username, annoAccademico, callback) {
    // Se abbiamo già i dati in cache, usa quelli
    if (insegnamentiCache.length > 0) {
      if (typeof callback === "function") {
        callback(insegnamentiCache);
      }
      return;
    }
    
    // Altrimenti carica dal server
    fetch(`/api/ottieniInsegnamenti?username=${username}`)
      .then((response) => response.json())
      .then((data) => {
        insegnamentiCache = data;
        if (typeof callback === "function") {
          callback(data);
        }
      })
      .catch((error) => {
        console.error("Errore nel caricamento degli insegnamenti:", error);
        if (typeof callback === "function") {
          callback([]);
        }
      });
  }

  // Ottiene gli insegnamenti filtrati per CdS
  function getInsegnamentiFiltered(cdsCode = null) {
    const cdsToUse = cdsCode || selectedCds;
    
    if (!cdsToUse) {
      return insegnamentiCache; // Ritorna tutti se non c'è filtro
    }
    
    return insegnamentiCache.filter(ins => ins.cds_codice === cdsToUse);
  }

  // Carica gli insegnamenti selezionati dal server
  function loadSelectedInsegnamenti(username, callback) {
    if (!username || getSelectedCodes().length === 0) {
      if (typeof callback === "function") callback([]);
      return;
    }

    fetch(
      `/api/ottieniInsegnamenti?username=${username}&codici=${getSelectedCodes().join(
        ","
      )}`
    )
      .then((response) => response.json())
      .then((data) => {
        if (typeof callback === "function") callback(data);
      })
      .catch((error) => {
        console.error("Errore nel caricamento degli insegnamenti:", error);
        if (typeof callback === "function") callback([]);
      });
  }

  // Crea un tag visuale per un insegnamento selezionato
  function createInsegnamentoTag(codice, titolo, container, onRemoveCallback) {
    // Crea elemento tag
    const tag = document.createElement("div");
    tag.className = "multi-select-tag";
    tag.dataset.value = codice;
    tag.innerHTML =
      titolo + '<span class="multi-select-tag-remove">&times;</span>';

    // Gestione rimozione
    tag
      .querySelector(".multi-select-tag-remove")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        tag.remove();

        // Mostra placeholder se necessario
        if (container.querySelectorAll(".multi-select-tag").length === 0) {
          const placeholder = document.createElement("span");
          placeholder.className = "multi-select-placeholder";
          placeholder.textContent = "Seleziona gli insegnamenti";
          container.appendChild(placeholder);
        }

        // Deseleziona l'insegnamento
        deselectInsegnamento(codice);

        // Aggiorna select nascosto
        updateHiddenSelect(container);

        // Chiama callback personalizzata se fornita
        if (typeof onRemoveCallback === 'function') {
          onRemoveCallback(codice);
        }
      });

    container.appendChild(tag);
    return tag;
  }

  // Sincronizza i tag visualizzati con gli insegnamenti selezionati
  function syncTags(container, insegnamenti) {
    if (!container) return;
    
    // Rimuovi tutti i tag esistenti
    const existingTags = container.querySelectorAll(".multi-select-tag");
    existingTags.forEach(tag => tag.remove());
    
    // Rimuovi placeholder se ci sono insegnamenti
    if (insegnamenti && insegnamenti.length > 0) {
      const placeholder = container.querySelector(".multi-select-placeholder");
      if (placeholder) placeholder.remove();
      
      // Crea tag per ogni insegnamento
      insegnamenti.forEach(ins => {
        createInsegnamentoTag(ins.codice, ins.titolo, container);
      });
    } else {
      // Aggiungi placeholder se non ci sono insegnamenti
      if (container.querySelectorAll(".multi-select-tag").length === 0) {
        const placeholder = document.createElement("span");
        placeholder.className = "multi-select-placeholder";
        placeholder.textContent = "Seleziona gli insegnamenti";
        container.appendChild(placeholder);
      }
    }
    
    // Aggiorna la select nascosta
    updateHiddenSelect(container);
  }

  // Aggiorna la select nascosta con i valori dei tag
  function updateHiddenSelect(multiSelectBox, hiddenSelectId = "insegnamento") {
    const hiddenSelect = document.getElementById(hiddenSelectId);
    if (hiddenSelect && multiSelectBox) {
      // Rimuovi opzioni esistenti
      while (hiddenSelect.options.length > 0) {
        hiddenSelect.remove(0);
      }

      // Aggiungi opzioni dai tag
      const tags = multiSelectBox.querySelectorAll(".multi-select-tag");
      tags.forEach((tag) => {
        const option = document.createElement("option");
        option.value = tag.dataset.value;
        option.textContent = tag.textContent.replace("×", "").trim();
        option.selected = true;
        hiddenSelect.appendChild(option);
      });
    }
  }

  // Genera i parametri della richiesta per ottenere gli esami
  function getRequestParams(docente) {
    const params = new URLSearchParams();
    
    // Aggiungi il docente
    if (docente) {
      params.append("docente", docente);
    }
    
    // Aggiungi filtro CdS se selezionato
    if (selectedCds) {
      params.append("cds", selectedCds);
    }
    
    // Aggiungi filtro insegnamenti selezionati
    const codici = getSelectedCodes();
    if (codici.length > 0) {
      params.append("insegnamenti", codici.join(","));
    } else if (docente) {
      // Solo esami del docente se non ci sono insegnamenti specifici
      params.append("solo_docente", "true");
    }
    
    return params;
  }

  // Modifica la funzione initMultiSelect per gestire correttamente gli eventi di click e prevenire duplicazioni
  function initMultiSelect(boxId, dropdownId, optionsId = null) {
    let box = document.getElementById(boxId);
    const dropdown = document.getElementById(dropdownId);
    
    if (!box || !dropdown) {
      console.error(`Elementi multi-select non trovati: box=${!!box}, dropdown=${!!dropdown}`);
      return;
    }
    
    
    // Se è stato fornito optionsId, usa quell'elemento per le opzioni
    const optionsContainer = optionsId ? 
      document.getElementById(optionsId) : 
      dropdown.querySelector('.multi-select-options') || 
      document.createElement('div');
    
    // Se abbiamo creato un nuovo elemento, aggiungiamo classe e appendiamo al dropdown
    if (!optionsId && !dropdown.querySelector('.multi-select-options')) {
      optionsContainer.className = 'multi-select-options';
      dropdown.appendChild(optionsContainer);
    }
    
    // Associa l'ID opzionale se fornito e non già presente
    if (optionsId && !optionsContainer.id) {
      optionsContainer.id = optionsId;
    }
    
    // Rimuovi eventuali click handler precedenti
    const newBox = box.cloneNode(true);
    if (box.parentNode) {
      box.parentNode.replaceChild(newBox, box);
    }
    box = newBox;
    
    // Aggiungi evento click al box per mostrare/nascondere il dropdown
    box.addEventListener('click', function(e) {
      e.stopPropagation();
      
      console.log("Box clicked, toggling dropdown visibility");
      
      // Aggiungi/rimuovi classe active per styling
      this.classList.toggle('active');
      
      // Mostra/nascondi dropdown
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      
      // Posiziona il dropdown sotto il box
      if (!isVisible) {
        // Usa la posizione relativa al container
        dropdown.style.left = '0';
        dropdown.style.top = '100%'; // Posiziona esattamente sotto il box
        dropdown.style.width = '100%';
      }
    });
    
    // Rimuovi tutti i vecchi handler a livello di documento
    if (window._insegnamentiManagerDocClickHandler) {
      document.removeEventListener('click', window._insegnamentiManagerDocClickHandler);
    }
    
    // Aggiungi nuovo handler per i click esterni
    window._insegnamentiManagerDocClickHandler = function(e) {
      if (!box.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
        box.classList.remove('active');
      }
    };
    
    document.addEventListener('click', window._insegnamentiManagerDocClickHandler);
  }

  // Popola le opzioni del dropdown di selezione insegnamenti
  function populateInsegnamentiOptions(containerId, insegnamenti) {
    const optionsContainer = document.getElementById(containerId);
    if (!optionsContainer) return;
    
    optionsContainer.innerHTML = "";
    
    insegnamenti.forEach((ins) => {
      const option = document.createElement("div");
      option.className = "multi-select-option";
      option.dataset.value = ins.codice;
      option.dataset.cds = ins.cds_codice || "";
      option.dataset.semestre = ins.semestre || "1";
      option.dataset.annoCorso = ins.anno_corso || "1";
      option.textContent = ins.titolo;
      
      // Se è già selezionato, aggiungi classe selected
      if (isSelected(ins.codice)) {
        option.classList.add("selected");
      }
      
      // Aggiungi handler per il click
      option.addEventListener("click", function() {
        toggleInsegnamentoSelection(this);
      });
      
      optionsContainer.appendChild(option);
    });
  }

  // Gestisce il toggle della selezione di un insegnamento
  function toggleInsegnamentoSelection(option) {
    const codice = option.dataset.value;
    const titolo = option.textContent;
    const multiSelectBox = document.getElementById("insegnamentoBox");
    
    if (!multiSelectBox) return;
    
    const existingTag = multiSelectBox.querySelector(`.multi-select-tag[data-value="${codice}"]`);
    
    if (option.classList.contains("selected") || existingTag) {
      // Deseleziona
      option.classList.remove("selected");
      
      if (existingTag) {
        existingTag.remove();
      }
      
      if (multiSelectBox.querySelectorAll(".multi-select-tag").length === 0) {
        // Aggiungi placeholder
        const placeholder = document.createElement("span");
        placeholder.className = "multi-select-placeholder";
        placeholder.textContent = "Seleziona gli insegnamenti";
        multiSelectBox.appendChild(placeholder);
      }
      
      deselectInsegnamento(codice);
    } else {
      // Seleziona
      option.classList.add("selected");
      
      // Rimuovi placeholder se presente
      const placeholder = multiSelectBox.querySelector(".multi-select-placeholder");
      if (placeholder) {
        placeholder.remove();
      }
      
      if (!existingTag) {
        createInsegnamentoTag(codice, titolo, multiSelectBox);
      }
      
      const metadata = {
        semestre: parseInt(option.dataset.semestre) || 1,
        anno_corso: parseInt(option.dataset.annoCorso) || 1,
        cds: option.dataset.cds || ""
      };
      
      selectInsegnamento(codice, metadata);
    }
    
    updateHiddenSelect(multiSelectBox);
  }

  // Carica e inizializza gli insegnamenti per il form
  function initFormInsegnamenti(username, callback) {
    // Carica insegnamenti
    loadInsegnamenti(username, null, (insegnamenti) => {
      // Popola le opzioni
      populateInsegnamentiOptions("insegnamentoOptions", insegnamenti);
      
      // Pre-seleziona insegnamenti se necessario
      if (getSelectedCodes().length > 0) {
        loadSelectedInsegnamenti(username, (selectedData) => {
          const multiSelectBox = document.getElementById("insegnamentoBox");
          if (multiSelectBox) {
            syncTags(multiSelectBox, selectedData);
          }
          
          if (typeof callback === "function") {
            callback(selectedData);
          }
        });
      } else if (typeof callback === "function") {
        callback([]);
      }
    });
  }

  // Pulisci gli eventi quando il form viene chiuso - versione migliorata
  function cleanupEventListeners() {
    // Rimuovi gli event listener globali
    if (window._insegnamentiManagerDocClickHandler) {
      document.removeEventListener('click', window._insegnamentiManagerDocClickHandler);
      window._insegnamentiManagerDocClickHandler = null;
    }
    
    // Resetta lo stato di qualsiasi dropdown aperto
    const dropdowns = document.querySelectorAll('.multi-select-dropdown');
    dropdowns.forEach(dropdown => {
      dropdown.style.display = 'none';
    });
    
    const boxes = document.querySelectorAll('.multi-select-box');
    boxes.forEach(box => {
      box.classList.remove('active');
    });
    
    // Svuota il set di event listener tracciati
    eventListenersAdded.clear();
  }

  // API pubblica
  return {
    // Gestione selezione insegnamenti
    selectInsegnamento,
    deselectInsegnamento,
    isSelected,
    getSelectedCodes,
    getSelected,
    clearSelection,
    onChange,
    
    // Gestione CdS
    setCds,
    getCds,
    onCdsChange,
    
    // Caricamento dati
    loadInsegnamenti,
    getInsegnamentiFiltered,
    loadSelectedInsegnamenti,
    
    // Gestione UI
    createInsegnamentoTag,
    syncTags,
    updateHiddenSelect,
    initMultiSelect,
    populateInsegnamentiOptions,
    toggleInsegnamentoSelection,
    initFormInsegnamenti,
    cleanupEventListeners,
    
    // Utility
    getRequestParams
  };
})();

// Rendiamo il manager disponibile globalmente
window.InsegnamentiManager = InsegnamentiManager;
