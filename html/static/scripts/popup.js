/**
 * Mostra un popup con un messaggio
 * @param {string} message - Il messaggio da mostrare
 * @param {string} title - Il titolo del popup (default: "Errore")
 * @param {Object} options - Opzioni aggiuntive per il popup
 * @param {string} options.type - Tipo di popup (info, error, success, warning)
 * @param {Function} options.callback - Funzione da chiamare alla chiusura
 * @param {boolean} options.showButton - Se mostrare il pulsante OK (default: false)
 */
function showPopup(message, title = "Errore", options = {}) {
  const defaultOptions = {
    type: "error", // info, error, success, warning
    callback: null, // callback da eseguire alla chiusura
    showButton: false, // se mostrare il pulsante OK
  };

  const settings = { ...defaultOptions, ...options };

  // Stili per i diversi tipi di popup
  const typeStyles = {
    error: { bg: "#f8d7da", color: "#721c24" },
    success: { bg: "#d4edda", color: "#155724" },
    warning: { bg: "#fff3cd", color: "#856404" },
    info: { bg: "#d1ecf1", color: "#0c5460" },
  };

  // Usa lo stile appropriato o default a error
  const style = typeStyles[settings.type] || typeStyles.error;

  // Crea l'overlay
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  // Costruisco il contenuto HTML
  let buttonHTML = "";
  if (settings.showButton) {
    buttonHTML = `
      <div style="text-align: center; margin-top: 15px;">
        <button class="popup-button invia">OK</button>
      </div>
    `;
  }

  overlay.innerHTML = `
    <div class="popup" style="border-top: 4px solid ${style.color}">
      <div class="popup-header" style="background-color: ${style.bg}; color: ${style.color}">
        <h2>${title}</h2>
        <span class="popup-close">&times;</span>
      </div>
      <div class="popup-content">
        <p>${message}</p>
        ${buttonHTML}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  // Mostra l'overlay impostando display: flex
  overlay.style.display = "flex";

  // Funzione per chiudere il popup
  const closePopup = () => {
    overlay.remove();
    // Esegui il callback se fornito
    if (settings.callback && typeof settings.callback === "function") {
      settings.callback();
    }
  };

  // Gestione chiusura al click sulla X o sull'overlay
  overlay.querySelector(".popup-close").addEventListener("click", closePopup);

  // Click sul pulsante OK se presente
  const okButton = overlay.querySelector(".popup-button");
  if (okButton) {
    okButton.addEventListener("click", closePopup);
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closePopup();
    }
  });

  // Chiusura con tasto ESC
  const escHandler = (e) => {
    if (e.key === "Escape") {
      closePopup();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);

  // Return overlay per gestione esterna
  return overlay;
}
