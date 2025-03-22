document.addEventListener("DOMContentLoaded", () => {
  // ------- Inizializzazione e variabili -------
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
  const anno_accademico =
    currentMonth >= 9
      ? currentDate.getFullYear()
      : currentDate.getFullYear() - 1;

  // Imposta l'anno accademico nel campo hidden
  const annoAccademicoField = document.getElementById("anno_accademico");
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

    // Gestione prova parziale
    const provaParzialeCheckbox = document.getElementById("provaParziale");
    if (provaParzialeCheckbox) {
      provaParzialeCheckbox.addEventListener("change", aggiornaVerbalizzazione);
    }

    // Gestione submit del form
    const form = document.getElementById("formEsame");
    if (form) {
      form.addEventListener("submit", handleFormSubmit);
    }

    // Gestione chiusura overlay
    const closeOverlay = document.getElementById("closeOverlay");
    if (closeOverlay) {
      closeOverlay.addEventListener("click", closePopupOverlay);
    }
  }

  // Funzione per inizializzare la UI
  function initUI() {
    // Imposta username nel campo docente
    setUsernameField("docente", () => {
      const username = document.getElementById("docente")?.value;
      if (!username) return;
      
      // Inizializza la select multipla tramite InsegnamentiManager
      if (window.InsegnamentiManager) {
        window.InsegnamentiManager.initMultiSelect("insegnamentoBox", "insegnamentoDropdown");
        
        // Carica insegnamenti e inizializza il form
        window.InsegnamentiManager.initFormInsegnamenti(username, () => {
          // Controlla insegnamenti preselezionati dall'URL
          checkPreselectedInsegnamenti();
        });
      }
    });
    
    // Popola le aule iniziali
    popolaAule();
    
    // Personalizza il saluto
    if (window.updatePageTitle) {
      window.updatePageTitle();
    }
    
    // Aggiungi listener per aggiornare i tag quando cambiano gli insegnamenti selezionati
    if (window.InsegnamentiManager) {
      window.InsegnamentiManager.onChange(() => {
        const username = document.getElementById("docente")?.value;
        if (!username) return;
        
        const multiSelectBox = document.getElementById("insegnamentoBox");
        if (!multiSelectBox) return;
        
        // Sincronizza i tag con gli insegnamenti selezionati
        window.InsegnamentiManager.loadSelectedInsegnamenti(username, (insegnamenti) => {
          window.InsegnamentiManager.syncTags(multiSelectBox, insegnamenti);
        });
      });
    }
  }

  // Funzione per chiudere il popup overlay
  function closePopupOverlay() {
    const popupOverlay = document.getElementById("popupOverlay");
    if (popupOverlay) {
      popupOverlay.style.display = "none";
    }
    
    // Assicuriamoci che il dropdown venga chiuso quando si chiude il form
    const dropdown = document.getElementById("insegnamentoDropdown");
    if (dropdown) {
      dropdown.style.display = "none";
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

  // Funzione per controllare insegnamenti preselezionati dall'URL
  function checkPreselectedInsegnamenti() {
    // Controlla se c'è un parametro nell'URL che indica insegnamenti preselezionati
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedParam = urlParams.get("insegnamenti");
    
    if (preselectedParam) {
      const preselectedCodes = preselectedParam.split(",");
      const username = document.getElementById("docente")?.value;
      
      if (username && window.InsegnamentiManager) {
        // Carica dati insegnamenti
        fetch(`/api/ottieniInsegnamenti?username=${username}&codici=${preselectedCodes.join(",")}`)
          .then(response => response.json())
          .then(data => {
            if (data.length > 0) {
              // Seleziona gli insegnamenti nel manager
              data.forEach(ins => {
                const metadata = {
                  semestre: ins.semestre || 1,
                  anno_corso: ins.anno_corso || 1,
                  cds: ins.cds_codice || ""
                };
                
                window.InsegnamentiManager.selectInsegnamento(ins.codice, metadata);
              });
              
              // Sincronizza UI
              const multiSelectBox = document.getElementById("insegnamentoBox");
              if (multiSelectBox) {
                window.InsegnamentiManager.syncTags(multiSelectBox, data);
              }
            }
          })
          .catch(error => console.error("Errore nel caricamento degli insegnamenti preselezionati:", error));
      }
    }
  }

  // ------- Funzioni per gestire le aule -------

  // Popola select con aule predefinite
  function popolaAule() {
    const selectAula = document.getElementById("aula");
    if (selectAula) {
      selectAula.innerHTML =
        '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
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
      selectAula.innerHTML =
        '<option value="" disabled selected hidden>Seleziona prima data e ora</option>';
      return;
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
          // Riordina le aule per nome
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

        let option = document.createElement("option");
        option.value = studioDocenteNome;
        option.textContent = studioDocenteNome;

        selectAula.appendChild(option);
      });
  }

  // Funzione per determinare periodo (mattina/pomeriggio) in base all'ora
  function determinaPeriodo(ora) {
    if (!ora) return null;
    const oreParts = ora.split(":");
    const oreInt = parseInt(oreParts[0], 10);
    return oreInt > 13 ? 1 : 0; // 1 pomeriggio, 0 mattina
  }

  // ------- Funzioni di utility -------

  // Imposta username in un campo
  function setUsernameField(fieldId, callback) {
    getUserData()
      .then((data) => {
        if (data && data.authenticated && data.user_data) {
          const userData = data.user_data;
          const field = document.getElementById(fieldId);
          if (field) {
            field.value = userData.username;
            if (typeof callback === "function") {
              callback(userData.username);
            }
          }
        }
      })
      .catch((error) => {
        console.error("Errore nel recupero dei dati utente:", error);
      });
  }

  // ------- Gestione form e validazione -------

  // Validazione ora appello
  function validaOraAppello(ora) {
    if (!ora) return false;

    const [hours, minutes] = ora.split(":").map(Number);
    return hours >= 8 && hours <= 23;
  }

  // Funzione per validare la durata dell'esame
  function validaDurataEsame(durataMinuti) {
    if (!durataMinuti) return false;

    const durata = parseInt(durataMinuti, 10);
    return durata >= 30 && durata <= 480;
  }

  // Handler submit form
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
          // Resetta selezioni usando InsegnamentiManager
          if (window.InsegnamentiManager) {
            window.InsegnamentiManager.clearSelection();
          }

          // Forza aggiornamento del calendario
          if (window.forceCalendarRefresh) {
            window.forceCalendarRefresh();
          }

          window.showMessage(
            data.message || "Esami inseriti con successo",
            "Operazione completata",
            "notification"
          );
          document.getElementById("popupOverlay").style.display = "none";
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

  // Mostra popup di conferma per validazione esami
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

    // Aggiungi event listeners
    document.getElementById("closeConferma")?.addEventListener("click", () => {
      document.body.removeChild(popupContainer);
    });

    document
      .getElementById("btnAnnullaEsami")
      ?.addEventListener("click", () => {
        document.body.removeChild(popupContainer);
      });

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
            document.body.removeChild(popupContainer);

            if (
              response.status === "success" ||
              response.status === "partial"
            ) {
              window.preselectedInsegnamenti = [];

              if (window.InsegnamentiManager) {
                window.InsegnamentiManager.clearSelection();
              }

              // Forza aggiornamento del calendario con la nuova funzione semplificata
              if (window.forceCalendarRefresh) {
                window.forceCalendarRefresh();
              }

              const messageType =
                response.status === "success" ? "notification" : "warning";
              const messageTitle =
                response.status === "success"
                  ? "Operazione completata"
                  : "Inserimento parziale";

              window.showMessage(response.message, messageTitle, messageType);

              // Aggiorna calendario
              if (window.calendar) {
                window.calendar.refetchEvents();
                document.getElementById("popupOverlay").style.display = "none";
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

  // ------- Esportazione funzioni globali -------

  // Rendi le funzioni accessibili globalmente
  window.aggiornaAuleDisponibili = aggiornaAuleDisponibili;

  // Funzione per aggiornare le opzioni di verbalizzazione in base al checkbox di prova parziale
  function aggiornaVerbalizzazione() {
    const provaParzialeCheckbox = document.getElementById("provaParziale");
    const verbalizzazioneSelect = document.getElementById("verbalizzazione");

    if (!provaParzialeCheckbox || !verbalizzazioneSelect) return;

    // Salva il valore corrente se possibile
    const currentValue = verbalizzazioneSelect.value;

    // Svuota le opzioni attuali
    verbalizzazioneSelect.innerHTML = "";

    if (provaParzialeCheckbox.checked) {
      // Opzioni per prova parziale
      const options = [
        { value: "PAR", text: "Prova parziale" },
        { value: "PPP", text: "Prova parziale con pubblicazione" },
      ];

      options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        verbalizzazioneSelect.appendChild(optionElement);
      });

      // Seleziona la prima opzione
      verbalizzazioneSelect.value = "PAR";
    } else {
      // Opzioni standard
      const options = [
        { value: "FSS", text: "Firma digitale singola" },
        { value: "FWP", text: "Firma digitale con pubblicazione" },
      ];

      options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        verbalizzazioneSelect.appendChild(optionElement);
      });

      // Seleziona la prima opzione
      verbalizzazioneSelect.value = "FSS";
    }
  }
});
