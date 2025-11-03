// Sistema centralizzato per la gestione degli insegnamenti tra calendario e form
const InsegnamentiManager = (function () {
  // STATO INTERNO
  let selectedInsegnamenti = new Map();
  let insegnamentiCache = [];
  let cdsCache = [];
  let selectedCds = null;
  let onChangeCallbacks = [];
  let onCdsChangeCallbacks = [];
  let lastCacheUpdate = 0;
  let cacheExpirationTime = 1800000; // 30 minuti
  let requestInProgress = null;

  // GESTIONE SELEZIONE INSEGNAMENTI
  function selectInsegnamento(id, metadata) {
    selectedInsegnamenti.set(id, { id, ...metadata });
    notifyChange();
  }

  function deselectInsegnamento(id) {
    selectedInsegnamenti.delete(id);
    notifyChange();
  }

  function isSelected(id) {
    return selectedInsegnamenti.has(id);
  }

  function getSelectedInsegnamenti() {
    // Restituisce gli ID degli insegnamenti selezionati
    return Array.from(selectedInsegnamenti.keys());
  }

  function clearSelection() {
    selectedInsegnamenti.clear();
    notifyChange();
  }

  function onChange(callback) {
    if (typeof callback === "function") {
      onChangeCallbacks.push(callback);
    }
  }

  function notifyChange() {
    onChangeCallbacks.forEach((callback) => callback(getSelectedInsegnamenti()));
  }

  // GESTIONE CDS
  function setCds(cdsCode) {
    const oldCds = selectedCds;
    selectedCds = cdsCode;
    if (oldCds !== selectedCds) {
      onCdsChangeCallbacks.forEach((callback) => callback(selectedCds));
    }
  }

  function getCds() {
    return selectedCds;
  }

  function onCdsChange(callback) {
    if (typeof callback === "function") {
      onCdsChangeCallbacks.push(callback);
    }
  }

  async function isAdmin() {
    try {
      const data = await window.getUserData();
      return data.authenticated && data.user_data && data.user_data.permessi_admin;
    } catch (error) {
      console.error("Errore nel controllo dei permessi admin:", error);
      return false;
    }
  }

  function isCacheValid() {
    return insegnamentiCache.length > 0 && 
           cdsCache.length > 0 && 
           (Date.now() - lastCacheUpdate < cacheExpirationTime);
  }

  // CARICAMENTO DATI
  async function loadInsegnamenti(username, options = {}, callback = null) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    const { filter = null, cds = selectedCds, forceReload = false } = options;
    
    if (!forceReload && isCacheValid()) {
      let risultati = insegnamentiCache;
      
      if (cds) {
        risultati = risultati.filter(ins => ins.cds_codice === cds);
      }
      
      if (filter) {
        const filteredIds = Array.isArray(filter) ? filter : [filter];
        risultati = risultati.filter(ins => filteredIds.includes(ins.id));
      }

      if (callback) callback(risultati);
      return;
    }

    if (requestInProgress) {
      requestInProgress.then(() => loadInsegnamenti(username, options, callback));
      return;
    }

    // Usa AnnoAccademicoManager per ottenere l'anno
    const annoAccademico = await window.AnnoAccademicoManager.waitForInit();
    if (!annoAccademico) {
      console.error("Impossibile ottenere l'anno accademico");
      if (callback) callback([]);
      return;
    }

    const url = `/api/get-insegnamenti-docente?docente=${username}&anno=${annoAccademico}`;

    requestInProgress = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
        return response.json();
      })
      .then(data => {
        lastCacheUpdate = Date.now();
        
        if (data.cds) {
          cdsCache = data.cds.map(c => ({ codice: c.codice, nome_corso: c.nome }));
          insegnamentiCache = flattenInsegnamenti(data.cds);
        }
        let risultati = insegnamentiCache;
        
        if (cds) risultati = risultati.filter(ins => ins.cds_codice === cds);
        if (filter) {
          const filteredIds = Array.isArray(filter) ? filter : [filter];
          risultati = risultati.filter(ins => filteredIds.includes(ins.id));
        }

        if (callback) callback(risultati);
        requestInProgress = null;
        return risultati;
      })
      .catch(error => {
        console.error("Errore nel caricamento degli insegnamenti:", error);
        requestInProgress = null;
        if (callback) callback([]);
        return [];
      });

    return requestInProgress;
  }

  function flattenInsegnamenti(cdsList) {
    const flattened = [];
    cdsList.forEach(cds => {
      if (cds.insegnamenti && Array.isArray(cds.insegnamenti)) {
        cds.insegnamenti.forEach(ins => {
          flattened.push({
            id: ins.id,
            codice: ins.codice,
            titolo: ins.titolo,
            semestre: ins.semestre,
            anno_corso: ins.anno_corso,
            cds_codice: cds.codice,
            cds_nome: cds.nome
          });
        });
      }
    });
    return flattened;
  }

  async function loadCds(username, callback = null) {
    if (cdsCache.length > 0 && (Date.now() - lastCacheUpdate < cacheExpirationTime)) {
      if (callback) callback(cdsCache);
      return;
    }
    
    await loadInsegnamenti(username, (insegnamenti) => {
      if (callback) callback(cdsCache);
    });
  }

  function invalidateCache() {
    lastCacheUpdate = 0;
  }

  // GESTIONE UI
  function syncUI(container, insegnamenti = null) {
    if (!container) return;

    // Se non sono forniti insegnamenti, carica quelli selezionati
    if (!insegnamenti) {
      const username = document.getElementById("docente")?.value;
      if (!username || getSelectedInsegnamenti().length === 0) {
        // Nessun insegnamento selezionato, mostra placeholder
        container.innerHTML =
          '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
        return;
      }

      // Carica solo gli insegnamenti selezionati
      loadInsegnamenti(username, { 
        filter: getSelectedInsegnamenti()
      }, (data) => {
        syncUI(container, data);
      });
      return;
    }

    // Svuota il container
    container.innerHTML = "";

    // Se ci sono insegnamenti da mostrare
    if (insegnamenti && insegnamenti.length > 0) {
      // Filtra insegnamenti per mostrare solo quelli selezionati
      const insegnamentiSelezionati = insegnamenti.filter(ins => isSelected(ins.id));
      
      // Se non ci sono insegnamenti selezionati, mostra placeholder
      if (insegnamentiSelezionati.length === 0) {
        container.innerHTML =
          '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
        return;
      }
      
      // Crea tag solo per gli insegnamenti selezionati
      insegnamentiSelezionati.forEach((ins) => {
        const tag = document.createElement("div");
        tag.className = "multi-select-tag";
        tag.dataset.value = ins.id;
        
        // Includi "nome CdS - codice CdS"
        const cdsText =` (${ins.cds_nome} - ${ins.cds_codice})`;
        tag.innerHTML =
          `${ins.titolo}${cdsText} <span class="multi-select-tag-remove">&times;</span>`;

        // Gestione rimozione
        tag
          .querySelector(".multi-select-tag-remove")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            tag.remove();
            deselectInsegnamento(ins.id);

            // Rimuovi evidenziazione dall'opzione corrispondente nel dropdown
            const dropdown = container.parentNode?.querySelector('.multi-select-dropdown');
            if (dropdown) {
              const option = dropdown.querySelector(`[data-value="${ins.id}"]`);
              if (option) {
                option.classList.remove("selected");
              }
            }

            // Mostra placeholder se necessario
            if (container.querySelectorAll(".multi-select-tag").length === 0) {
              container.innerHTML =
                '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
            }

            // Aggiorna select nascosta
            updateHiddenSelect(container);
          });

        container.appendChild(tag);
      });
    } else {
      // Nessun insegnamento, mostra placeholder
      container.innerHTML =
        '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
    }

    // Aggiorna la select nascosta
    updateHiddenSelect(container);
  }

  function updateHiddenSelect(container, hiddenSelectId = "insegnamento") {
    const hiddenSelect = document.getElementById(hiddenSelectId);
    if (!hiddenSelect || !container) return;

    hiddenSelect.innerHTML = "";

    const tags = container.querySelectorAll(".multi-select-tag");
    tags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag.dataset.value;
      option.textContent = tag.textContent.replace("×", "").trim();
      option.selected = true;
      hiddenSelect.appendChild(option);
    });
  }
  
  // Inizializza UI con multi-select e dropdown
  function initUI(
    containerSelector,
    dropdownSelector,
    optionsSelector,
    username
  ) {
    const container = document.getElementById(containerSelector);
    const dropdown = document.getElementById(dropdownSelector);
    const optionsContainer = document.getElementById(optionsSelector);

    if (!container || !dropdown || !optionsContainer) {
      console.error("Elementi UI non trovati");
      return;
    }

    // Assicurati che il container abbia la classe corretta
    container.classList.add("multi-select-box");

    // Pulisci vecchi event listeners
    const newContainer = container.cloneNode(true);
    container.parentNode?.replaceChild(newContainer, container);

    // Click sul container mostra/nasconde dropdown
    newContainer.addEventListener("click", (e) => {
      e.stopPropagation();

      newContainer.classList.toggle("active");
      const isVisible = dropdown.style.display === "block";
      dropdown.style.display = isVisible ? "none" : "block";

      if (!isVisible) {
        dropdown.style.left = "0";
        dropdown.style.top = "100%";
        dropdown.style.width = "100%";
      }
    });

    // Rimuovi vecchio handler document click
    if (window._insegnamentiManagerDocClickHandler) {
      document.removeEventListener(
        "click",
        window._insegnamentiManagerDocClickHandler
      );
    }

    // Nuovo handler per chiudere dropdown su click esterno
    window._insegnamentiManagerDocClickHandler = (e) => {
      if (!newContainer.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
        newContainer.classList.remove("active");
      }
    };
    document.addEventListener(
      "click",
      window._insegnamentiManagerDocClickHandler
    );

    // Carica insegnamenti e popola opzioni
    loadInsegnamenti(username, (insegnamenti) => {
      // Popola opzioni
      optionsContainer.innerHTML = "";
      
      if (!insegnamenti || insegnamenti.length === 0) {
        optionsContainer.innerHTML =
          '<div class="multi-select-no-data">Nessun insegnamento disponibile</div>';
        return;
      }
      
      // Ordina gli insegnamenti per titolo
      insegnamenti.sort((a, b) => a.titolo.localeCompare(b.titolo));
      
      // Aggiungi insegnamenti direttamente senza raggruppamento per CdS
      insegnamenti.forEach((ins) => {
        const option = document.createElement("div");
        option.className = "multi-select-option";
        option.dataset.value = ins.id;
        option.dataset.cds = ins.cds_codice || "";
        option.dataset.semestre = ins.semestre || "1";
        option.dataset.annoCorso = ins.anno_corso || "1";
        
        // Includi "nome CdS - codice CdS"
        const cdsText =` (${ins.cds_nome} - ${ins.cds_codice})`;
        option.textContent = `${ins.titolo}${cdsText}`;
        
        if (isSelected(ins.id)) {
          option.classList.add("selected");
        }
        
        option.addEventListener("click", (e) => {
          e.stopPropagation();
          
          const isCurrentlySelected = option.classList.contains("selected");
          
          if (isCurrentlySelected) {
            // Deseleziona
            option.classList.remove("selected");
            deselectInsegnamento(ins.id);
          } else {
            // Seleziona
            option.classList.add("selected");
            selectInsegnamento(ins.id, {
              semestre: parseInt(option.dataset.semestre) || 1,
              anno_corso: parseInt(option.dataset.annoCorso) || 1,
              cds: option.dataset.cds || "",
            });
          }
          
          // Aggiorna UI direttamente senza ricaricare dati dal server
          syncUI(newContainer);
        });
        
        optionsContainer.appendChild(option);
      });
      
      // Sincronizza i tag iniziali se ci sono già insegnamenti selezionati
      if (getSelectedInsegnamenti().length > 0) {
        loadInsegnamenti(username, { filter: getSelectedInsegnamenti() }, (data) => {
          syncUI(newContainer, data);
        });
      } else {
        syncUI(newContainer);
      }
    });

    return { container: newContainer, dropdown, optionsContainer };
  }

  function getRequestParams(docente) {
    const params = new URLSearchParams();

    if (docente) params.append("docente", docente);
    if (selectedCds) params.append("cds", selectedCds);

    const ids = getSelectedInsegnamenti();
    if (ids.length > 0) {
      params.append("insegnamenti", ids.join(","));
    } else if (docente) {
      params.append("solo_docente", "true");
    }

    return params;
  }

  function cleanup() {
    if (window._insegnamentiManagerDocClickHandler) {
      document.removeEventListener("click", window._insegnamentiManagerDocClickHandler);
      window._insegnamentiManagerDocClickHandler = null;
    }

    document.querySelectorAll(".multi-select-dropdown").forEach((dropdown) => {
      dropdown.style.display = "none";
    });

    document.querySelectorAll(".multi-select-box").forEach((box) => {
      box.classList.remove("active");
    });
  }

  // API pubblica
  return {
    selectInsegnamento,
    deselectInsegnamento,
    isSelected,
    getSelectedInsegnamenti,
    clearSelection,
    onChange,
    setCds,
    getCds,
    onCdsChange,
    loadCds,
    loadInsegnamenti,
    invalidateCache,
    isCacheValid,
    syncUI,
    updateHiddenSelect,
    initUI,
    getRequestParams,
    cleanup,
    isAdmin,
    flattenInsegnamenti,
  };
})();

// Esportazione globale
window.InsegnamentiManager = InsegnamentiManager;