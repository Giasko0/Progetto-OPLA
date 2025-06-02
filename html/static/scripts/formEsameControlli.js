// filepath: /home/giasko/Scrivania/UniPG/Tesi/Progetto-OPLA/html/static/scripts/formEsameControlli.js
// Modulo per la gestione della validazione e controlli del form esame
const FormEsameControlli = (function() {
  // Verifica che FormUtils sia caricato
  if (!window.FormUtils) {
    throw new Error('FormUtils non è caricato. Assicurati che formUtils.js sia incluso prima di formEsameControlli.js');
  }

  // Importa utilità da FormUtils
  const {
    validateFormField,
    validators,
    getCommonValidationRules,
    showValidationError,
    checkUserPermissions
  } = window.FormUtils;

  // Configurazione validatori e regole
  const formValidationRules = getCommonValidationRules();

  // Helper functions per la validazione
  function getFirstDateValue() {
    const firstDateInput = document.querySelector('[id^="dataora_"]');
    return firstDateInput ? firstDateInput.value : null;
  }

  function getFirstTimeValue() {
    const firstOraH = document.querySelector('[id^="ora_h_"]');
    const firstOraM = document.querySelector('[id^="ora_m_"]');
    if (firstOraH && firstOraM && firstOraH.value && firstOraM.value) {
      return `${firstOraH.value}:${firstOraM.value}`;
    }
    return null;
  }

  function getDurationValue() {
    const durataField = document.getElementById("durata");
    return durataField ? durataField.value : null;
  }

  // Controlla se l'utente è un amministratore
  async function isUserAdmin() {
    try {
      const permissions = await checkUserPermissions();
      return permissions.isAdmin;
    } catch (error) {
      console.error("Errore nel controllo dei permessi admin:", error);
      return false;
    }
  }

  // Validazione standard del form
  function validateForm() {
    // Controlla se ci sono campi data con errori di validazione
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di inviare il form");
      // Focalizza il primo campo con errore
      errorFields[0].focus();
      return false;
    }

    // Validazione usando le regole unificate
    const validationResults = {
      giorno_settimana: validateFormField('giorno_settimana', getFirstDateValue(), formValidationRules),
      ora_appello: validateFormField('ora_appello', getFirstTimeValue(), formValidationRules),
      durata_esame: validateFormField('durata_esame', getDurationValue(), formValidationRules)
    };

    // Controlla se ci sono errori di validazione
    for (const [field, result] of Object.entries(validationResults)) {
      if (!result.isValid) {
        showValidationError(result.message);
        return false;
      }
    }

    // Validazione aula
    const firstAulaSelect = document.querySelector('[id^="aula_"]');
    if (firstAulaSelect && !firstAulaSelect.value) {
      showValidationError("Seleziona un'aula disponibile");
      return false;
    }

    return true;
  }

  // Validazione con bypass per amministratori
  function validateFormWithBypass() {
    // Anche per il bypass, controlla se ci sono errori di validazione delle date
    const errorFields = document.querySelectorAll('.form-input-error');
    if (errorFields.length > 0) {
      showValidationError("Correggi gli errori nelle date prima di inviare il form, anche con bypass");
      errorFields[0].focus();
      return false;
    }

    return true;
  }

  // Mostra il dialogo di conferma per la validazione degli esami
  function mostraPopupConferma(data) {
    // Crea il contenitore del dialogo
    const dialogContainer = document.createElement("div");
    dialogContainer.id = "exam-confirmation-dialog";
    dialogContainer.className = "specific-confirmation-overlay";
    dialogContainer.style.display = "flex";

    // Crea il contenuto del dialogo
    const dialogContent = document.createElement("div");
    dialogContent.className = "specific-confirmation-panel";
    dialogContent.style.width = "clamp(500px, 50vw, 800px)";

    // Header del dialogo
    const header = document.createElement("div");
    header.className = "specific-confirmation-header";
    header.innerHTML = `
      <h2>Conferma inserimento esami</h2>
      <span id="closeExamConfirmationDialog" class="form-close">&times;</span>
    `;

    // Contenuto del dialogo
    const content = document.createElement("div");
    content.className = "specific-confirmation-body";

    // Costruisci l'HTML per gli esami validi e invalidi
    let htmlContent = "";

    // Se ci sono esami invalidi, mostra un avviso
    if (data.esami_invalidi?.length > 0) {
      htmlContent += `
        <div class="alert alert-warning">
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
                     data-data="${esame.data_appello}" data-aula="${esame.aula}" 
                     data-ora="${esame.ora_appello}" data-durata="${esame.durata_appello}"
                     data-periodo="${esame.periodo}" data-inizio="${esame.data_inizio_iscrizione}" 
                     data-fine="${esame.data_fine_iscrizione}" checked>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${esame.titolo} - ${esame.data_appello}</td>
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

    // Assembla il dialogo
    dialogContent.appendChild(header);
    dialogContent.appendChild(content);
    dialogContainer.appendChild(dialogContent);

    // Aggiungi il dialogo al DOM
    document.body.appendChild(dialogContainer);

    // Funzione per rimuovere il dialogo
    const removeDialog = () => document.body.removeChild(dialogContainer);

    // Aggiungi event listeners
    document.getElementById("closeExamConfirmationDialog")?.addEventListener("click", removeDialog);
    document.getElementById("btnAnnullaEsami")?.addEventListener("click", removeDialog);

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
          data_appello: checkbox.dataset.data,
          aula: checkbox.dataset.aula,
          ora_appello: checkbox.dataset.ora,
          durata_appello: parseInt(checkbox.dataset.durata),
          periodo: parseInt(checkbox.dataset.periodo),
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
            // Rimuovi il dialogo
            removeDialog();

            if (
              response.status === "success" ||
              response.status === "partial"
            ) {
              // Chiama la funzione di cleanup del form principale
              if (window.EsameForm && window.EsameForm.cleanupAndHideForm) {
                window.EsameForm.cleanupAndHideForm();
              }

              const messageType = response.status === "success" ? "notification" : "warning";
              const messageTitle = response.status === "success" ? "Operazione completata" : "Inserimento parziale";

              // Usa la funzione showMessage per mostrare notifiche nella sidebar
              if (window.showMessage) {
                window.showMessage(response.message, messageTitle, messageType, { timeout: 5000 });
              }

              // Aggiorna calendario
              if (window.EsameForm && window.EsameForm.hideForm) {
                window.EsameForm.hideForm(true);
              }

              // Se ci sono errori specifici in caso di inserimento parziale
              if (response.status === "partial" && response.errors) {
                response.errors.forEach((error) => {
                  if (window.showMessage) {
                    window.showMessage(
                      `Errore per ${error.codice}: ${error.errore}`,
                      "Dettagli errore",
                      "warning"
                    );
                  }
                });
              }
            } else {
              // Errore
              if (window.showMessage) {
                window.showMessage(
                  response.message || "Errore durante l'inserimento degli esami",
                  "Errore",
                  "error"
                );
              }
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            // Rimuovi il dialogo anche in caso di errore
            if (document.body.contains(dialogContainer)) {
              removeDialog();
            }
            
            if (window.showMessage) {
              window.showMessage(
                "Si è verificato un errore durante l'inserimento degli esami",
                "Errore di rete",
                "error"
              );
            }
          });
      });
    }
  }

  // Interfaccia pubblica
  return {
    getFirstDateValue,
    getFirstTimeValue,
    getDurationValue,
    isUserAdmin,
    validateForm,
    validateFormWithBypass,
    mostraPopupConferma
  };
}());

// Espone il modulo globalmente
window.FormEsameControlli = FormEsameControlli;