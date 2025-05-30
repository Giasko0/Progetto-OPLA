// Sistema centralizzato per la gestione degli insegnamenti tra calendario e form
const InsegnamentiManager = (function () {
  // STATO INTERNO
  let selectedInsegnamenti = new Map(); // Mappa codice -> metadata
  let insegnamentiCache = []; // Cache degli insegnamenti
  let cdsCache = []; // Cache dei CdS
  let selectedCds = null; // CdS selezionato
  let onChangeCallbacks = []; // Callbacks per cambio selezione
  let onCdsChangeCallbacks = []; // Callbacks per cambio CdS
  let lastCacheUpdate = 0; // Timestamp dell'ultimo aggiornamento della cache
  let cacheExpirationTime = 1800000; // 30 minuti in ms
  let requestInProgress = null; // Promise dell'ultima richiesta in corso

  // GESTIONE SELEZIONE INSEGNAMENTI
  function selectInsegnamento(codice, metadata) {
    selectedInsegnamenti.set(codice, { codice, ...metadata });
    notifyChange();
  }

  function deselectInsegnamento(codice) {
    selectedInsegnamenti.delete(codice);
    notifyChange();
  }

  function isSelected(codice) {
    return selectedInsegnamenti.has(codice);
  }

  function getSelectedCodes() {
    return Array.from(selectedInsegnamenti.keys());
  }

  function clearSelection() {
    selectedInsegnamenti.clear();
    notifyChange();
  }

  // GESTIONE CALLBACKS
  function onChange(callback) {
    if (typeof callback === "function") {
      onChangeCallbacks.push(callback);
    }
  }

  function notifyChange() {
    onChangeCallbacks.forEach((callback) => callback(getSelectedCodes()));
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

  // Controllo se l'utente è un amministratore
  async function isAdmin() {
    try {
      const data = await getUserData();
      return data.authenticated && data.user_data && data.user_data.permessi_admin;
    } catch (error) {
      console.error("Errore nel controllo dei permessi admin:", error);
      return false;
    }
  }

  // VERIFICA STATO CACHE
  function isCacheValid() {
    return insegnamentiCache.length > 0 && 
           cdsCache.length > 0 && 
           (Date.now() - lastCacheUpdate < cacheExpirationTime);
  }

  // CARICAMENTO DATI
  function loadInsegnamenti(username, options = {}, callback = null) {
    // Gestione overload: se options è una funzione, è il callback
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    const { filter = null, cds = selectedCds, forceReload = false } = options;
    
    // Usa la cache se disponibile e valida, e non è richiesto un ricaricamento forzato
    if (!forceReload && isCacheValid()) {
      // Filtra i dati dalla cache
      let risultati = insegnamentiCache;
      
      // Filtra per codice CdS se specificato
      if (cds) {
        risultati = risultati.filter(ins => ins.cds_codice === cds);
      }
      
      // Filtra per codici specifici se richiesto
      if (filter) {
        const filteredCodes = Array.isArray(filter) ? filter : [filter];
        risultati = risultati.filter(ins => filteredCodes.includes(ins.codice));
      }

      if (typeof callback === "function") {
        callback(risultati);
      }
      return;
    }

    // Se è già in corso una richiesta, attendila invece di farne una nuova
    if (requestInProgress) {
      requestInProgress.then(() => {
        // Usa la cache appena aggiornata
        loadInsegnamenti(username, options, callback);
      });
      return;
    }

    // Ottieni l'anno accademico corrente
    const currentDate = new Date();
    const planningYear = currentDate.getMonth() >= 9 
        ? currentDate.getFullYear() 
        : currentDate.getFullYear() - 1;

    // Costruisci URL con l'endpoint unificato
    const url = `/api/get-insegnamenti-docente?docente=${username}&anno=${planningYear}`;

    // Avvia una nuova richiesta e memorizzala
    requestInProgress = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Errore HTTP: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        // Aggiorna timestamp cache
        lastCacheUpdate = Date.now();
        
        // Gestisci il formato gerarchico
        if (data.cds) {
          // Formato gerarchico - Estrai i CdS per l'uso futuro
          cdsCache = data.cds.map(c => ({
            codice: c.codice,
            nome_corso: c.nome
          }));
          
          // Piattifica gli insegnamenti per compatibilità
          insegnamentiCache = flattenInsegnamenti(data.cds);
        } else if (data.insegnamenti && Array.isArray(data.insegnamenti)) {
          // Formato legacy per docenti non admin
          insegnamentiCache = data.insegnamenti.map(ins => ({
            codice: ins.codice,
            titolo: ins.titolo,
            semestre: 1, // default
            anno_corso: 1, // default
            cds_codice: '',
            cds_nome: ''
          }));
        } else if (Array.isArray(data)) {
          // Formato piatto (legacy)
          insegnamentiCache = data;
        }

        // Filtra i risultati se necessario
        let risultati = insegnamentiCache;
        
        if (cds) {
          risultati = risultati.filter(ins => ins.cds_codice === cds);
        }
        
        if (filter) {
          const filteredCodes = Array.isArray(filter) ? filter : [filter];
          risultati = risultati.filter(ins => filteredCodes.includes(ins.codice));
        }

        if (typeof callback === "function") {
          callback(risultati);
        }
        
        // Reset della richiesta in corso
        requestInProgress = null;
        
        return risultati;
      })
      .catch((error) => {
        console.error("Errore nel caricamento degli insegnamenti:", error);
        requestInProgress = null;
        
        if (typeof callback === "function") {
          callback([]);
        }
        
        return [];
      });

    return requestInProgress;
  }

  // Nuova funzione di utilità per appiattire insegnamenti gerarchici
  function flattenInsegnamenti(cdsList) {
    const flattened = [];
    cdsList.forEach(cds => {
      if (cds.insegnamenti && Array.isArray(cds.insegnamenti)) {
        cds.insegnamenti.forEach(ins => {
          flattened.push({
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

  // Carica solo i CdS per il docente
  function loadCds(username, callback = null) {
    // Se la cache è già popolata e valida, utilizzala
    if (cdsCache.length > 0 && (Date.now() - lastCacheUpdate < cacheExpirationTime)) {
      if (typeof callback === "function") {
        callback(cdsCache);
      }
      return;
    }
    
    // Usa loadInsegnamenti per caricare tutti i dati e popolare entrambe le cache
    loadInsegnamenti(username, (insegnamenti) => {
      // I CdS sono già stati caricati in cdsCache da loadInsegnamenti
      if (typeof callback === "function") {
        callback(cdsCache);
      }
    });
  }

  // Invalida la cache forzatamente
  function invalidateCache() {
    lastCacheUpdate = 0;
  }

  // GESTIONE UI
  function syncUI(container, insegnamenti = null) {
    if (!container) return;

    // Se non sono forniti insegnamenti, carica quelli selezionati
    if (!insegnamenti) {
      const username = document.getElementById("docente")?.value;
      if (!username || getSelectedCodes().length === 0) {
        // Nessun insegnamento selezionato, mostra placeholder
        container.innerHTML =
          '<span class="multi-select-placeholder">Seleziona gli insegnamenti</span>';
        return;
      }

      // Carica solo gli insegnamenti selezionati
      loadInsegnamenti(username, { 
        filter: getSelectedCodes()
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
      const insegnamentiSelezionati = insegnamenti.filter(ins => isSelected(ins.codice));
      
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
        tag.dataset.value = ins.codice;
        
        // Includi il codice CdS tra parentesi se disponibile
        const cdsText = ins.cds_codice ? ` (${ins.cds_codice})` : '';
        tag.innerHTML =
          `${ins.titolo}${cdsText} <span class="multi-select-tag-remove">&times;</span>`;

        // Gestione rimozione
        tag
          .querySelector(".multi-select-tag-remove")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            tag.remove();
            deselectInsegnamento(ins.codice);

            // Rimuovi evidenziazione dall'opzione corrispondente nel dropdown
            const dropdown = container.parentNode?.querySelector('.multi-select-dropdown');
            if (dropdown) {
              const option = dropdown.querySelector(`[data-value="${ins.codice}"]`);
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

    // Rimuovi opzioni esistenti
    hiddenSelect.innerHTML = "";

    // Aggiungi nuove opzioni dai tag
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
        option.dataset.value = ins.codice;
        option.dataset.cds = ins.cds_codice || "";
        option.dataset.semestre = ins.semestre || "1";
        option.dataset.annoCorso = ins.anno_corso || "1";
        
        // Includi il codice CdS tra parentesi se disponibile
        const cdsText = ins.cds_codice ? ` (${ins.cds_codice})` : '';
        option.textContent = `${ins.titolo}${cdsText}`;
        
        if (isSelected(ins.codice)) {
          option.classList.add("selected");
        }
        
        option.addEventListener("click", (e) => {
          e.stopPropagation();
          
          const isCurrentlySelected = option.classList.contains("selected");
          
          if (isCurrentlySelected) {
            // Deseleziona
            option.classList.remove("selected");
            deselectInsegnamento(ins.codice);
          } else {
            // Seleziona
            option.classList.add("selected");
            selectInsegnamento(ins.codice, {
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
      if (getSelectedCodes().length > 0) {
        loadInsegnamenti(username, { filter: getSelectedCodes() }, (data) => {
          syncUI(newContainer, data);
        });
      } else {
        syncUI(newContainer);
      }
    });

    return { container: newContainer, dropdown, optionsContainer };
  }

  // Parametri per richieste API
  function getRequestParams(docente) {
    const params = new URLSearchParams();

    if (docente) {
      params.append("docente", docente);
    }
    
    if (selectedCds) {
      params.append("cds", selectedCds);
    }

    const codici = getSelectedCodes();
    if (codici.length > 0) {
      params.append("insegnamenti", codici.join(","));
    } else if (docente) {
      params.append("solo_docente", "true");
    }

    return params;
  }

  // Pulizia risorse
  function cleanup() {
    if (window._insegnamentiManagerDocClickHandler) {
      document.removeEventListener(
        "click",
        window._insegnamentiManagerDocClickHandler
      );
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
    // Core API
    selectInsegnamento,
    deselectInsegnamento,
    isSelected,
    getSelectedCodes,
    clearSelection,
    onChange,

    // CdS API
    setCds,
    getCds,
    onCdsChange,
    loadCds,

    // Dati API
    loadInsegnamenti,
    invalidateCache,
    isCacheValid,

    // UI API
    syncUI,
    updateHiddenSelect,
    initUI,

    // Utility
    getRequestParams,
    cleanup,
    isAdmin,
    flattenInsegnamenti,
  };
})();

// Esportazione globale
window.InsegnamentiManager = InsegnamentiManager;