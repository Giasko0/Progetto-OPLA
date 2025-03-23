// Script per la gestione del form di inserimento esame
const EsameForm = (function() {
  // Variabili private
  let isLoaded = false;
  let isLoading = false;
  let formElement = null;
  let popupOverlay = null;
  
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
      if (window.InsegnamentiManager && window.InsegnamentiManager.cleanupEventListeners) {
        window.InsegnamentiManager.cleanupEventListeners();
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
    
    initEventListeners();
    initUI(options);
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

    // Gestione chiusura overlay
    const closeOverlay = document.getElementById("closeOverlay");
    closeOverlay?.addEventListener("click", hideForm);
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
            const username = field.value;
            
            // Debug
            console.log("Username: ", username);
            console.log("InsegnamentiManager disponibile: ", !!window.InsegnamentiManager);
            
            // Inizializza la select multipla tramite InsegnamentiManager
            if (window.InsegnamentiManager) {
              try {
                // Inizializza solo se gli elementi esistono
                const boxElement = document.getElementById("insegnamentoBox");
                const dropdownElement = document.getElementById("insegnamentoDropdown");
                const optionsElement = document.getElementById("insegnamentoOptions");
                
                if (boxElement && dropdownElement) {
                  console.log("Elementi trovati, inizializzazione multi-select");
                  
                  // Prima pulizia
                  window.InsegnamentiManager.cleanupEventListeners();
                  
                  // Poi inizializzazione
                  window.InsegnamentiManager.initMultiSelect("insegnamentoBox", "insegnamentoDropdown", "insegnamentoOptions");
                  window.InsegnamentiManager.initFormInsegnamenti(username, () => {
                    checkPreselectedInsegnamenti();
                  });
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
        
        window.InsegnamentiManager.loadSelectedInsegnamenti(username, (insegnamenti) => {
          window.InsegnamentiManager.syncTags(multiSelectBox, insegnamenti);
          
          // Aggiorna anche la select nascosta per il submit
          const hiddenSelect = document.getElementById("insegnamento");
          if (hiddenSelect) {
            hiddenSelect.innerHTML = '';
            window.InsegnamentiManager.getSelectedCodes().forEach(code => {
              const option = document.createElement('option');
              option.value = code;
              option.selected = true;
              hiddenSelect.appendChild(option);
            });
          }
        });
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
      ? "Opzioni avanzate &#x25BA;" // freccia verso destra
      : "Opzioni avanzate &#x25BC;"; // freccia verso il basso
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
    
    console.log("Caricamento insegnamenti preselezionati:", preselectedCodes);
    
    fetch(`/api/ottieniInsegnamenti?username=${username}&codici=${preselectedCodes.join(",")}`)
      .then(response => response.json())
      .then(data => {
        console.log("Dati insegnamenti ricevuti:", data);
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
            window.InsegnamentiManager.syncTags(multiSelectBox, data);
            
            // Aggiorna anche la select nascosta
            const hiddenSelect = document.getElementById("insegnamento");
            if (hiddenSelect) {
              hiddenSelect.innerHTML = '';
              data.forEach(ins => {
                const option = document.createElement('option');
                option.value = ins.codice;
                option.selected = true;
                hiddenSelect.appendChild(option);
              });
            }
          }
        }
      })
      .catch(error => console.error("Errore nel caricamento degli insegnamenti preselezionati:", error));
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

  // Gestisce l'invio del form
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

    const formData = new FormData(this);

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
          window.InsegnamentiManager?.clearSelection();
          window.forceCalendarRefresh?.();

          window.showMessage(
            data.message || "Esami inseriti con successo",
            "Operazione completata",
            "notification"
          );
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

  // Interfaccia pubblica
  return {
    loadForm,
    showForm,
    hideForm,
    isFormLoaded: () => isLoaded
  };
})();

// Esportazione globale (solo l'oggetto EsameForm)
window.EsameForm = EsameForm;
