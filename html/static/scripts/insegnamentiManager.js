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

  // Inizializza il box di selezione multipla
  function initMultiSelect(boxId, dropdownId) {
    const multiSelectBox = document.getElementById(boxId);
    const multiSelectDropdown = document.getElementById(dropdownId);
  
    if (!multiSelectBox || !multiSelectDropdown) {
      return;
    }
  
    // Assicurati che il dropdown abbia il display impostato correttamente all'inizio
    multiSelectDropdown.style.display = "none";
  
    // Rimuovi tutti gli event listener precedenti clonando l'elemento
    const oldBox = multiSelectBox;
    const newBox = oldBox.cloneNode(true);
    if (oldBox.parentNode) {
      oldBox.parentNode.replaceChild(newBox, oldBox);
    }
  
    // Aggiungi il nuovo event listener
    newBox.addEventListener("click", function (e) {
      e.stopPropagation();
      const isActive = multiSelectDropdown.style.display === "block";
      multiSelectDropdown.style.display = isActive ? "none" : "block";
    });
  
    // Gestisci click all'esterno per chiudere il dropdown
    const closeDropdownHandler = function (e) {
      if (
        !newBox.contains(e.target) &&
        !multiSelectDropdown.contains(e.target)
      ) {
        multiSelectDropdown.style.display = "none";
      }
    };
  
    // Rimuovi il vecchio handler se esiste e aggiungi quello nuovo
    document.removeEventListener("click", closeDropdownHandler);
    document.addEventListener("click", closeDropdownHandler);
  
    // Impedisci che i click dentro il dropdown si propaghino
    multiSelectDropdown.addEventListener("click", function (e) {
      e.stopPropagation();
    });
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
    
    // Utility
    getRequestParams
  };
})();

// Rendiamo il manager disponibile globalmente
window.InsegnamentiManager = InsegnamentiManager;
