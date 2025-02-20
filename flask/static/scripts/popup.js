function showPopup(message, title = "Errore") {
  // Crea l'overlay
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";
  overlay.innerHTML = `
    <div class="popup">
      <div class="popup-header">
        <h2>${title}</h2>
        <span class="popup-close">&times;</span>
      </div>
      <div class="popup-content">
        <p>${message}</p>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  // Mostra l'overlay impostando display: flex
  overlay.style.display = "flex";

  // Gestione chiusura al click sulla X o sull'overlay
  overlay.querySelector(".popup-close").addEventListener("click", () => {
    overlay.remove();
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });
}