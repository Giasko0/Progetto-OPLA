// Script per la gestione del form di inserimento esame
const EsameForm = (function() {
  // Variabili private
  let isLoaded = false;
  let isLoading = false;
  let formElement = null;
  let popupOverlay = null;
  let currentUsername = null;
  let userPreferences = [];
  
  // Carica il form HTML dinamicamente
  async function loadForm() {
    if (isLoaded || isLoading) return Promise.resolve(formElement);
    
    isLoading = true;
    
    try {
      // Verifica se l'overlay esiste già, altrimenti crealo
      if (!popupOverlay) {
        popupOverlay = document.getElementById('popupOverlay');
        
        if (!popupOverlay) {
          popupOverlay = document.createElement('div');
          popupOverlay.id = 'popupOverlay';
          popupOverlay.className = 'popup-overlay';
          document.body.appendChild(popupOverlay);
        }
      }
      
      // Carica il form tramite fetch
      const response = await fetch('/formEsame.html');
      if (!response.ok) {
        throw new Error(`Errore nel caricamento del form: ${response.status}`);
      }
      
      const html = await response.text();
      popupOverlay.innerHTML = html;
      formElement = document.getElementById('formEsameContainer');
      
      isLoaded = true;
      isLoading = false;
      
      return formElement;
    } catch (error) {
      console.error('Errore nel caricamento del form:', error);
      isLoading = false;
      throw error;
    }
  }
  
  // Mostra il form di inserimento esame
  async function showForm(options = {}) {
    try {
      await loadForm();
      popupOverlay.style.display = 'flex';
      
      // Reset dello stato precedente
      isLoaded = false;
      
      initForm(options);
      return true;
    } catch (error) {
      console.error('Errore nel mostrare il form:', error);
      return false;
    }
  }
  
  // Nasconde il form e pulisce gli handler degli eventi
  function hideForm() {
    if (popupOverlay) {
      popupOverlay.style.display = 'none';
      
      // Resetta il dropdown
      const dropdown = document.getElementById('insegnamentoDropdown');
      if (dropdown) {
        dropdown.style.display = 'none';
      }
      
      // Pulisci gli event listener per evitare duplicazioni
      if (window.InsegnamentiManager && window.InsegnamentiManager.cleanup) {
        window.InsegnamentiManager.cleanup();
      }
      
      // Forziamo la ricarica del form la prossima volta
      isLoaded = false;
    }
  }

  // Inizializza il form con gli eventi e i valori predefiniti
  function initForm(options = {}) {
    // Imposta l'anno accademico
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const anno_accademico = currentMonth >= 9 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
    
    const anno_field = document.getElementById("anno_accademico");
    if (anno_field) {
      anno_field.value = anno_accademico;
    }
    
    // Prima inizializziamo l'UI
    initUI(options);
    // Poi aggiungiamo gli event listeners
    initEventListeners();
    
    // Ottieni l'username corrente e poi carica le preferenze
    getUserData()
      .then((data) => {
        if (data?.authenticated && data?.user_data) {
          currentUsername = data.user_data.username;
          console.log("Username ottenuto:", currentUsername);
          
          // Carica le preferenze dell'utente dopo aver impostato i valori base
          loadUserPreferences();
        }
      })
      .catch((error) => {
        console.error("Errore nel recupero dei dati utente:", error);
      });
  }
  
  // Inizializza gli ascoltatori di eventi
  function initEventListeners() {
    // Ascoltatori per filtro aule
    const dataoraInput = document.getElementById("dataora");
    const oraInput = document.getElementById("ora");

    dataoraInput?.addEventListener("change", aggiornaAuleDisponibili);
    oraInput?.addEventListener("change", aggiornaAuleDisponibili);

    // Gestione opzioni avanzate
    const pulsanteAdv = document.getElementById("buttonOpzioniAvanzate");
    pulsanteAdv?.addEventListener("click", toggleOpzioniAvanzate);

    // Gestione prova parziale
    const provaParzialeCheckbox = document.getElementById("provaParziale");
    provaParzialeCheckbox?.addEventListener("change", aggiornaVerbalizzazione);

    // Gestione submit del form
    const form = document.getElementById("formEsame");
    form?.addEventListener("submit", handleFormSubmit);
    
    // Gestione del pulsante bypass controlli (solo per admin)
    const bypassChecksBtn = document.getElementById("bypassChecksBtn");
    if (bypassChecksBtn) {
      // Mostra solo agli admin
      if (isUserAdmin()) {
        bypassChecksBtn.style.display = "block";
        bypassChecksBtn.addEventListener("click", handleBypassChecksSubmit);
      } else {
        bypassChecksBtn.style.display = "none";
      }
    }

    // Gestione chiusura overlay
    const closeOverlay = document.getElementById("closeOverlay");
    closeOverlay?.addEventListener("click", hideForm);

    // Aggiungi event listeners per le preferenze
    document.getElementById("savePreferenceBtn")?.addEventListener("click", toggleSavePreferenceForm);
    document.getElementById("loadPreferenceBtn")?.addEventListener("click", togglePreferencesMenu);
    document.getElementById("confirmSavePreference")?.addEventListener("click", handleSavePreference);
    document.getElementById("cancelSavePreference")?.addEventListener("click", toggleSavePreferenceForm);
  }
  
  // Controlla se l'utente è un amministratore
  function isUserAdmin() {
    return document.cookie
      .split("; ")
      .find((row) => row.startsWith("admin="))
      ?.split("=")[1] === "true";
  }
  
  // Funzione unificata per inviare i dati del form
  function submitFormData(options = {}) {
    const form = document.getElementById("formEsame");
    if (!form) return;
    
    const formData = new FormData(form);
    
    // Aggiungi opzioni aggiuntive se fornite
    if (options.bypassChecks) {
      formData.append("bypass_checks", "true");
    }
        
    fetch("/api/inserisciEsame", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "error") {
          window.showMessage(data.message, "Errore", "error");
        } else if (data.status === "validation") {
          mostraPopupConferma(data);
        } else {
          // Pulizia dopo l'inserimento riuscito
          window.InsegnamentiManager?.clearSelection();
          window.forceCalendarRefresh?.();

          const successMessage = options.bypassChecks 
            ? "Esame inserito con successo (controlli bypassati)"
            : data.message || "Esami inseriti con successo";
            
          window.showMessage(successMessage, "Operazione completata", "notification");
          hideForm();
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        window.showMessage(
          "Si è verificato un errore durante l'inserimento dell'esame",
          "Errore",
          "error"
        );
      });
  }
  
  // Gestisce l'invio del form con bypass dei controlli
  function handleBypassChecksSubmit() {
    if (!isUserAdmin()) {
      window.showMessage(
        "Solo gli amministratori possono utilizzare questa funzione",
        "Accesso negato",
        "error"
      );
      return;
    }
    
    submitFormData({ bypassChecks: true });
  }

  // Gestisce l'invio standard del form
  function handleFormSubmit(e) {
    e.preventDefault();

    const oraAppello = document.getElementById("ora")?.value;
    if (!validaOraAppello(oraAppello)) {
      window.showMessage(
        "L'ora dell'appello deve essere compresa tra le 08:00 e le 23:00",
        "Errore di validazione",
        "error"
      );
      return;
    }

    const aulaSelezionata = document.getElementById("aula")?.value;
    if (!aulaSelezionata) {
      window.showMessage(
        "Seleziona un'aula disponibile",
        "Errore di validazione",
        "error"
      );
      return;
    }

    const durataEsame = document.getElementById("durata")?.value;
    if (!validaDurataEsame(durataEsame)) {
      window.showMessage(
        "La durata dell'esame deve essere di almeno 30 minuti e non superiore a 480 minuti (8 ore)",
        "Errore di validazione",
        "error"
      );
      return;
    }

    submitFormData();
  }

  // Inizializza l'interfaccia utente del form
  function initUI(options = {}) {
    // Pre-compilazione date
    if (options.date) {
      const dataElement = document.getElementById('dataora');
      if (dataElement) dataElement.value = options.date;
    }
    
    // Imposta username nel campo docente
    getUserData()
      .then((data) => {
        if (data?.authenticated && data?.user_data) {
          const field = document.getElementById("docente");
          if (field) {
            field.value = data.user_data.username;
            currentUsername = data.user_data.username;
            
            // Inizializza la select multipla tramite InsegnamentiManager
            if (window.InsegnamentiManager) {
              try {
                // Inizializza solo se gli elementi esistono
                const boxElement = document.getElementById("insegnamentoBox");
                const dropdownElement = document.getElementById("insegnamentoDropdown");
                const optionsElement = document.getElementById("insegnamentoOptions");
                
                if (boxElement && dropdownElement && optionsElement) {
                  // Prima pulizia
                  window.InsegnamentiManager.cleanup();
                  
                  // Poi inizializzazione usando la nuova API
                  window.InsegnamentiManager.initUI(
                    "insegnamentoBox", 
                    "insegnamentoDropdown", 
                    "insegnamentoOptions",
                    currentUsername
                  );
                  
                  // Controlla se ci sono insegnamenti preselezionati dall'URL
                  checkPreselectedInsegnamenti();
                } else {
                  console.error("Elementi DOM per multi-select non trovati");
                }
              } catch (error) {
                console.error("Errore nell'inizializzazione multi-select:", error);
              }
            }
          }
        }
      })
      .catch((error) => {
        console.error("Errore nel recupero dei dati utente:", error);
      });
    
    // Popola le aule iniziali
    const selectAula = document.getElementById("aula");
    if (selectAula) {
      selectAula.innerHTML =
        '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
    }
    
    // Personalizza il saluto
    window.updatePageTitle?.();
    
    // Aggiungi listener per aggiornare i tag
    if (window.InsegnamentiManager) {
      window.InsegnamentiManager.onChange(() => {
        const username = document.getElementById("docente")?.value;
        if (!username) return;
        
        const multiSelectBox = document.getElementById("insegnamentoBox");
        if (!multiSelectBox) return;
        
        // Usa la nuova API per sincronizzare l'UI
        window.InsegnamentiManager.syncUI(multiSelectBox);
      });
    }
  }

  // Mostra/nasconde le opzioni avanzate
  function toggleOpzioniAvanzate() {
    const opzioni = document.getElementById("opzioniAvanzate");
    const button = document.getElementById("buttonOpzioniAvanzate");

    if (!opzioni || !button) return;

    const isVisible = opzioni.style.display === "grid";
    opzioni.style.display = isVisible ? "none" : "grid";
    button.innerHTML = isVisible 
      ? "Opzioni avanzate <span class='material-symbols-outlined'>arrow_right</span>" // freccia verso destra
      : "Opzioni avanzate <span class='material-symbols-outlined'>arrow_drop_down</span>"; // freccia verso il basso
  }
  
  // Aggiorna le opzioni di verbalizzazione in base al checkbox di prova parziale
  function aggiornaVerbalizzazione() {
    const provaParzialeCheckbox = document.getElementById("provaParziale");
    const verbalizzazioneSelect = document.getElementById("verbalizzazione");

    if (!provaParzialeCheckbox || !verbalizzazioneSelect) return;

    verbalizzazioneSelect.innerHTML = "";

    const options = provaParzialeCheckbox.checked
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

    verbalizzazioneSelect.value = provaParzialeCheckbox.checked ? "PAR" : "FSS";
  }

  // Controlla e carica insegnamenti preselezionati dall'URL
  function checkPreselectedInsegnamenti() {
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedParam = urlParams.get("insegnamenti");
    
    if (!preselectedParam) return;
    
    const preselectedCodes = preselectedParam.split(",");
    const username = document.getElementById("docente")?.value;
    
    if (!username || !window.InsegnamentiManager) return;
    
    // Usa la nuova API loadInsegnamenti con filtro
    window.InsegnamentiManager.loadInsegnamenti(
      username, 
      { filter: preselectedCodes },
      data => {
        if (data.length > 0) {
          data.forEach(ins => {
            const metadata = {
              semestre: ins.semestre || 1,
              anno_corso: ins.anno_corso || 1,
              cds: ins.cds_codice || ""
            };
            
            window.InsegnamentiManager.selectInsegnamento(ins.codice, metadata);
          });
          
          const multiSelectBox = document.getElementById("insegnamentoBox");
          if (multiSelectBox) {
            // Usa syncUI invece di syncTags
            window.InsegnamentiManager.syncUI(multiSelectBox, data);
          }
        }
      }
    );
  }

  // Aggiorna le aule disponibili in base a data e ora
  function aggiornaAuleDisponibili() {
    const dataoraInput = document.getElementById("dataora");
    const oraInput = document.getElementById("ora");
    const selectAula = document.getElementById("aula");

    if (!dataoraInput || !oraInput || !selectAula) return;

    const data = dataoraInput.value;
    const ora = oraInput.value;

    if (!data || !ora) {
      selectAula.innerHTML =
        '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
      return;
    }

    // Determina il periodo (mattina/pomeriggio) in base all'ora
    function determinaPeriodo(ora) {
      if (!ora) return null;
      const oreParts = ora.split(":");
      const oreInt = parseInt(oreParts[0], 10);
      return oreInt > 13 ? 1 : 0; // 1 pomeriggio, 0 mattina
    }

    const periodo = determinaPeriodo(ora);
    const studioDocenteNome = "Studio docente DMI";

    fetch(`/api/ottieniAule?data=${data}&periodo=${periodo}`)
      .then((response) => response.json())
      .then((aule) => {
        selectAula.innerHTML =
          '<option value="" disabled selected hidden>Scegli l\'aula</option>';

        let studioDocentePresente = aule.some(
          (aula) => aula.nome === studioDocenteNome
        );

        if (!studioDocentePresente) {
          aule.push({ nome: studioDocenteNome });
          aule.sort((a, b) => a.nome.localeCompare(b.nome));
        }

        aule.forEach((aula) => {
          let option = document.createElement("option");
          option.value = aula.nome;
          option.textContent = aula.nome;

          if (aula.nome === studioDocenteNome && aule.length === 1) {
            option.selected = true;
          }

          selectAula.appendChild(option);
        });
      })
      .catch((error) => {
        console.error("Errore nel recupero delle aule:", error);
        selectAula.innerHTML =
          '<option value="" disabled selected>Errore nel caricamento delle aule</option>';

        const option = document.createElement("option");
        option.value = studioDocenteNome;
        option.textContent = studioDocenteNome;
        selectAula.appendChild(option);
      });
  }

  // Valida l'ora dell'appello
  function validaOraAppello(ora) {
    if (!ora) return false;
    const [hours, minutes] = ora.split(":").map(Number);
    return hours >= 8 && hours <= 23;
  }

  // Valida la durata dell'esame
  function validaDurataEsame(durataMinuti) {
    if (!durataMinuti) return false;
    const durata = parseInt(durataMinuti, 10);
    return durata >= 30 && durata <= 480;
  }

  // Mostra il popup di conferma per la validazione degli esami
  function mostraPopupConferma(data) {
    // Crea il contenitore del popup
    const popupContainer = document.createElement("div");
    popupContainer.id = "popupConferma";
    popupContainer.className = "popup-overlay";
    popupContainer.style.display = "flex";

    // Crea il contenuto del popup
    const popupContent = document.createElement("div");
    popupContent.className = "popup";
    popupContent.style.width = "clamp(500px, 50vw, 800px)";

    // Header del popup
    const header = document.createElement("div");
    header.className = "popup-header";
    header.innerHTML = `
      <h2>Conferma inserimento esami</h2>
      <span id="closeConferma" class="popup-close">&times;</span>
    `;

    // Contenuto del popup
    const content = document.createElement("div");
    content.className = "popup-content";

    // Costruisci l'HTML per gli esami validi e invalidi
    let htmlContent = "";

    // Se ci sono esami invalidi, mostra un avviso
    if (data.esami_invalidi?.length > 0) {
      htmlContent += `
        <div class="alert alert-warning" style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
          <p><strong>Attenzione!</strong> Alcuni esami non possono essere inseriti:</p>
          <ul style="margin-left: 20px;">
      `;

      data.esami_invalidi.forEach((esame) => {
        htmlContent += `<li>${esame.titolo || esame.codice}: ${
          esame.errore
        }</li>`;
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
                <th>
                  <input type="checkbox" id="selectAllExams" checked> Seleziona tutti
                </th>
                <th>Insegnamento</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.esami_validi.forEach((esame) => {
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

    // Funzione per rimuovere il popup
    const removePopup = () => document.body.removeChild(popupContainer);

    // Aggiungi event listeners
    document.getElementById("closeConferma")?.addEventListener("click", removePopup);
    document.getElementById("btnAnnullaEsami")?.addEventListener("click", removePopup);

    // Event listener per "Seleziona tutti"
    const selectAllCheckbox = document.getElementById("selectAllExams");
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener("change", () => {
        const checkboxes = document.querySelectorAll(".esame-checkbox");
        checkboxes.forEach((checkbox) => {
          checkbox.checked = selectAllCheckbox.checked;
        });
      });
    }

    // Event listener per il pulsante di conferma
    const btnConferma = document.getElementById("btnConfermaEsami");
    if (btnConferma) {
      btnConferma.addEventListener("click", () => {
        // Raccogli gli esami selezionati
        const checkboxes = document.querySelectorAll(".esame-checkbox:checked");

        const esamiSelezionati = Array.from(checkboxes).map((checkbox) => ({
          codice: checkbox.dataset.codice,
          data_inizio_iscrizione: checkbox.dataset.inizio,
          data_fine_iscrizione: checkbox.dataset.fine,
        }));

        // Se non ci sono esami selezionati, mostra un messaggio e non fare nulla
        if (esamiSelezionati.length === 0) {
          window.showMessage(
            "Seleziona almeno un esame da inserire",
            "Attenzione",
            "warning"
          );
          return;
        }

        // Invia la richiesta al server per inserire gli esami selezionati
        fetch("/api/confermaEsami", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dati_comuni: data.dati_comuni,
            esami_da_inserire: esamiSelezionati,
          }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Errore HTTP: ${response.status}`);
            }
            return response.json();
          })
          .then((response) => {
            // Rimuovi il popup
            removePopup();

            if (
              response.status === "success" ||
              response.status === "partial"
            ) {
              window.preselectedInsegnamenti = [];
              window.InsegnamentiManager?.clearSelection();
              window.forceCalendarRefresh?.();

              const messageType = response.status === "success" ? "notification" : "warning";
              const messageTitle = response.status === "success" ? "Operazione completata" : "Inserimento parziale";

              window.showMessage(response.message, messageTitle, messageType);

              // Aggiorna calendario
              if (window.calendar) {
                window.calendar.refetchEvents();
                hideForm();
              }

              // Se ci sono errori specifici in caso di inserimento parziale
              if (response.status === "partial" && response.errors) {
                response.errors.forEach((error) => {
                  window.showMessage(
                    `Errore per ${error.codice}: ${error.errore}`,
                    "Dettagli errore",
                    "warning"
                  );
                });
              }
            } else {
              window.showMessage(
                "Errore: " + response.message,
                "Errore",
                "error"
              );
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            window.showMessage(
              "Si è verificato un errore durante l'inserimento degli esami",
              "Errore",
              "error"
            );
          });
      });
    }
  }

  // Funzioni per la gestione delle preferenze
  
  // Carica le preferenze dell'utente
  function loadUserPreferences() {
    if (!currentUsername) {
      // Ottieni l'username dal campo nascosto
      currentUsername = document.getElementById("docente")?.value;
      if (!currentUsername) {
        console.error("Username non trovato, impossibile caricare le preferenze");
        return;
      }
    }
    
    console.log("Caricamento preferenze per:", currentUsername);
    
    fetch(`/api/ottieniPreferenzeForm?username=${encodeURIComponent(currentUsername)}&form_type=esame`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Errore nella risposta del server: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log("Preferenze ricevute:", data);
        if (data.status === 'success' && data.preferences) {
          userPreferences = data.preferences;
          
          // Aggiorna il menu delle preferenze
          updatePreferencesMenu();
          
          // Se ci sono preferenze, carica l'ultima come predefinita
          if (userPreferences.length > 0 && !document.getElementById("preferenceAlreadyLoaded")) {
            console.log("Applicazione preferenza predefinita:", userPreferences[0].name);
            applyPreference(userPreferences[0].preferences);
            
            // Aggiungi un marker nascosto per evitare caricamenti multipli
            const marker = document.createElement('input');
            marker.type = 'hidden';
            marker.id = 'preferenceAlreadyLoaded';
            document.getElementById('formEsame')?.appendChild(marker);
          } else {
            console.log("Nessuna preferenza da applicare o già caricata");
          }
        } else {
          console.log("Nessuna preferenza trovata o errore:", data.message);
        }
      })
      .catch(error => {
        console.error('Errore nel caricamento delle preferenze:', error);
      });
  }
  
  // Salva le preferenze correnti
  function saveCurrentPreference(preferenceName) {
    if (!currentUsername) {
      currentUsername = document.getElementById("docente")?.value;
      if (!currentUsername) {
        window.showMessage("Errore: nessun utente identificato", "Errore", "error");
        return;
      }
    }
    
    // Ottieni gli insegnamenti selezionati direttamente dall'elemento select nascosto
    let selectedInsegnamenti = [];
    try {
      const insegnamentoSelect = document.getElementById("insegnamento");
      if (insegnamentoSelect && insegnamentoSelect.options) {
        for (let i = 0; i < insegnamentoSelect.options.length; i++) {
          if (insegnamentoSelect.options[i].selected) {
            selectedInsegnamenti.push({
              codice: insegnamentoSelect.options[i].value,
              titolo: insegnamentoSelect.options[i].textContent
            });
          }
        }
      }
      
      // Alternativa - recupera i tag dal box se il select è vuoto
      if (selectedInsegnamenti.length === 0) {
        const tags = document.querySelectorAll('#insegnamentoBox .multi-select-tag');
        tags.forEach(tag => {
          const codiceMatch = tag.textContent.match(/\(([A-Z0-9]+)\)/);
          if (codiceMatch && codiceMatch[1]) {
            const codice = codiceMatch[1];
            const titolo = tag.textContent.replace(/\s*\([A-Z0-9]+\)$/, '').trim();
            selectedInsegnamenti.push({ codice, titolo });
          }
        });
      }
    } catch (error) {
      console.error("Errore nel recupero degli insegnamenti selezionati:", error);
    }
    
    console.log("Insegnamenti selezionati:", selectedInsegnamenti);
    
    // Raccogli i valori comuni del form escludendo i campi specifici dell'esame
    const preferences = {
      descrizione: document.getElementById("descrizione")?.value,
      insegnamenti: selectedInsegnamenti,
      tipoEsame: document.getElementById("tipoEsame")?.value,
      verbalizzazione: document.getElementById("verbalizzazione")?.value,
      oraAppello: document.getElementById("ora")?.value,
      durata: document.getElementById("durata")?.value,
      posti: document.getElementById("posti")?.value,
      provaParziale: document.getElementById("provaParziale")?.checked,
      note: document.getElementById("note")?.value
    };
    
    // Logging per debug
    console.log("Salvataggio preferenze:", preferences);
    
    // Invia i dati al server
    fetch('/api/salvaPreferienzaForm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: currentUsername,
        form_type: 'esame',
        name: preferenceName,
        preferences: preferences
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        window.showMessage(data.message, "Preferenze salvate", "notification");
        
        // Ricarica le preferenze
        loadUserPreferences();
      } else {
        window.showMessage(data.message, "Errore", "error");
      }
    })
    .catch(error => {
      console.error('Errore nel salvataggio delle preferenze:', error);
      window.showMessage("Errore nel salvataggio delle preferenze", "Errore", "error");
    });
  }
  
  // Applica una preferenza
  function applyPreference(preference) {
    console.log("Applicazione preferenza:", preference);

    // Imposta descrizione
    if (preference.descrizione) {
      const descrizione = document.getElementById("descrizione");
      if (descrizione) descrizione.value = preference.descrizione;
    }
    
    // Imposta insegnamenti
    if (preference.insegnamenti && preference.insegnamenti.length > 0 && window.InsegnamentiManager) {
      // Pulisci selezioni precedenti
      window.InsegnamentiManager.clearSelection();
      
      // Carica gli insegnamenti selezionati
      const username = document.getElementById("docente")?.value;
      if (username) {
        const insegnamentoCodes = preference.insegnamenti.map(ins => ins.codice);
        
        window.InsegnamentiManager.loadInsegnamenti(
          username, 
          { filter: insegnamentoCodes },
          data => {
            if (data.length > 0) {
              data.forEach(ins => {
                window.InsegnamentiManager.selectInsegnamento(ins.codice, {
                  semestre: ins.semestre || 1,
                  anno_corso: ins.anno_corso || 1,
                  cds: ins.cds_codice || ""
                });
              });
              
              const multiSelectBox = document.getElementById("insegnamentoBox");
              if (multiSelectBox) {
                window.InsegnamentiManager.syncUI(multiSelectBox);
              }
            }
          }
        );
      }
    }
    
    // Imposta ora appello
    if (preference.oraAppello) {
      const oraAppello = document.getElementById("ora");
      if (oraAppello) oraAppello.value = preference.oraAppello;
    }
    
    // Imposta tipo esame
    if (preference.tipoEsame) {
      const tipoEsame = document.getElementById("tipoEsame");
      if (tipoEsame) tipoEsame.value = preference.tipoEsame;
    }
    
    // Imposta verbalizzazione
    if (preference.verbalizzazione) {
      const verbalizzazione = document.getElementById("verbalizzazione");
      if (verbalizzazione) verbalizzazione.value = preference.verbalizzazione;
    }
    
    // Imposta durata
    if (preference.durata) {
      const durata = document.getElementById("durata");
      if (durata) durata.value = preference.durata;
    }
    
    // Imposta posti
    if (preference.posti) {
      const posti = document.getElementById("posti");
      if (posti) posti.value = preference.posti;
    }
    
    // Gestione checkbox
    if (preference.hasOwnProperty('provaParziale')) {
      const provaParziale = document.getElementById("provaParziale");
      if (provaParziale) {
        provaParziale.checked = !!preference.provaParziale;
        
        // Aggiorna la verbalizzazione basata sulla prova parziale
        aggiornaVerbalizzazione();
      }
    }
    
    // Imposta note
    if (preference.note) {
      const note = document.getElementById("note");
      if (note) note.value = preference.note;
    }
  }
  
  // Aggiorna il menu delle preferenze
  function updatePreferencesMenu() {
    const preferencesMenu = document.getElementById("preferencesMenu");
    if (!preferencesMenu) return;
    
    // Svuota il menu
    preferencesMenu.innerHTML = "";
    
    if (userPreferences.length === 0) {
      preferencesMenu.innerHTML = "<div class='preference-item'>Nessuna preferenza salvata</div>";
      return;
    }
    
    // Crea un elemento per ogni preferenza
    userPreferences.forEach(pref => {
      const item = document.createElement("div");
      item.className = "preference-item";
      item.innerHTML = `
        <span>${pref.name}</span>
        <span class="delete-btn" data-id="${pref.id}" title="Elimina"><span class="material-symbols-outlined">delete</span>
      `;
      
      // Event listener per caricare la preferenza
      item.addEventListener("click", (e) => {
        // Se il click è sulla X, non caricare la preferenza
        if (e.target.classList.contains("delete-btn")) return;
        
        applyPreference(pref.preferences);
        togglePreferencesMenu();
      });
      
      preferencesMenu.appendChild(item);
    });
    
    // Event listener per eliminare le preferenze
    preferencesMenu.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deletePreference(btn.dataset.id);
      });
    });
  }
  
  // Elimina una preferenza
  function deletePreference(id) {
    if (!confirm("Sei sicuro di voler eliminare questa preferenza?")) return;
    
    fetch('/api/eliminaPreferenzaForm', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: currentUsername,
        id: id
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        window.showMessage(data.message, "Preferenze", "notification");
        
        // Ricarica le preferenze
        loadUserPreferences();
      } else {
        window.showMessage(data.message, "Errore", "error");
      }
    })
    .catch(error => {
      console.error('Errore nell\'eliminazione della preferenza:', error);
      window.showMessage("Errore nell'eliminazione della preferenza", "Errore", "error");
    });
  }
  
  // Mostra/nasconde il form per salvare le preferenze
  function toggleSavePreferenceForm() {
    const saveForm = document.getElementById("savePreferenceForm");
    const menu = document.getElementById("preferencesMenu");
    
    if (!saveForm) return;
    
    const isVisible = saveForm.style.display === "flex";
    saveForm.style.display = isVisible ? "none" : "flex";
    
    // Nascondi il menu se è visibile
    if (menu && menu.style.display === "block") {
      menu.style.display = "none";
    }
    
    // Imposta il focus sul campo di input
    if (!isVisible) {
      document.getElementById("preferenceNameInput")?.focus();
    }
  }
  
  // Mostra/nasconde il menu delle preferenze
  function togglePreferencesMenu() {
    const menu = document.getElementById("preferencesMenu");
    const saveForm = document.getElementById("savePreferenceForm");
    
    if (!menu) return;
    
    const isVisible = menu.style.display === "block";
    menu.style.display = isVisible ? "none" : "block";
    
    // Nascondi il form di salvataggio se è visibile
    if (saveForm && saveForm.style.display === "flex") {
      saveForm.style.display = "none";
    }
  }
  
  // Gestisce il salvataggio di una preferenza
  function handleSavePreference() {
    const preferenceNameInput = document.getElementById("preferenceNameInput");
    if (!preferenceNameInput) return;
    
    const preferenceName = preferenceNameInput.value.trim();
    if (!preferenceName) {
      window.showMessage("Inserisci un nome per la preferenza", "Attenzione", "warning");
      return;
    }
    
    // Verifica se esiste già una preferenza con questo nome
    const exists = userPreferences.some(p => p.name === preferenceName);
    if (exists) {
      if (!confirm(`Esiste già una preferenza chiamata "${preferenceName}". Vuoi sovrascriverla?`)) {
        return;
      }
    }
    
    saveCurrentPreference(preferenceName);
    toggleSavePreferenceForm();
  }

  // Interfaccia pubblica
  return {
    loadForm,
    showForm,
    hideForm,
    isFormLoaded: () => isLoaded,
    loadPreferences: loadUserPreferences,
    applyPreference
  };
})();

// Esportazione globale (solo l'oggetto EsameForm)
window.EsameForm = EsameForm;
