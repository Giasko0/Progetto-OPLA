document.addEventListener("DOMContentLoaded", function () {
  // Controlla gli esami minimi all'avvio della pagina
  fetch("/api/checkEsamiMinimi")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Errore nella richiesta API");
      }
      return response.json();
    })
    .then((data) => {
      if (
        data.status === "success" &&
        data.insegnamenti_sotto_minimo.length > 0
      ) {
        // Ci sono insegnamenti sotto il minimo
        // Invia i dati alla funzione showMessage in sidebar.js
        if (window.showMessage) {
          // Crea contenuto formattato per gli insegnamenti
          let content = `<p>Insegnamenti con meno di 8 esami inseriti:</p>`;
          content += `<ul style="margin-top:8px;margin-bottom:8px;padding-left:20px;">`;
          data.insegnamenti_sotto_minimo.forEach((ins) => {
            content += `<li style="font-size:0.9em;margin-bottom:4px;">${ins.titolo}: ${ins.esami_inseriti}/8</li>`;
          });
          content += `</ul>`;

          // Mostra l'avviso nella sidebar con il titolo "Attenzione!"
          window.showMessage(content, "Attenzione!", "warning", { html: true });
        }
      }
    })
    .catch((error) => {
      console.error("Errore nel recupero degli esami minimi:", error);
      // Usa showMessage per gli errori di esami minimi
      if (window.showMessage) {
        window.showMessage(
          "Errore nel recupero degli esami minimi. Riprova più tardi.",
          "Errore di sistema",
          "error"
        );
      }
    });
});
