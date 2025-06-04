// Script per gestire il comportamento dinamico dei pulsanti CTA
document.addEventListener("DOMContentLoaded", function () {
  const loginMessage = document.getElementById("login-message");
  const buttonsContainer = document.getElementById("auth-buttons");
  const ctaButton = document.querySelector(".cta-button");

  // Controlla lo stato di autenticazione dell'utente
  window
    .getUserData()
    .then((data) => {
      if (data && data.authenticated) {
        // Se l'utente è già autenticato, mostra i pulsanti e nascondi il messaggio di login
        if (loginMessage) loginMessage.style.display = "none";
        if (buttonsContainer) buttonsContainer.style.display = "flex";
      } else {
        // Se l'utente non è autenticato, mostra il messaggio di login e nascondi i pulsanti
        if (loginMessage) loginMessage.style.display = "block";
        if (buttonsContainer) buttonsContainer.style.display = "none";

        // Configura il pulsante per andare al login con redirect
        if (ctaButton) {
          ctaButton.href = `login.html?redirect=${encodeURIComponent(
            "/calendario.html"
          )}`;
          ctaButton.textContent = "Accedi ora";
        }
      }
    })
    .catch((error) => {
      console.error("Errore nel controllo dell'autenticazione:", error);
      // In caso di errore, impostare il comportamento predefinito
      if (loginMessage) loginMessage.style.display = "block";
      if (buttonsContainer) buttonsContainer.style.display = "none";
      if (ctaButton) {
        ctaButton.href = `login.html?redirect=${encodeURIComponent(
          "/calendario.html"
        )}`;
      }
    });
});
