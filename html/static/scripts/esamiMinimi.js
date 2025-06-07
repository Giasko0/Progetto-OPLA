// Funzione per controllare gli esami minimi e mostrare avvisi nella sidebar
function checkEsamiMinimi() {
  // Costruisci i parametri per includere l'anno selezionato
  let params = new URLSearchParams();
  
  // Aggiungi l'anno selezionato
  const selectedYear = window.AnnoAccademicoManager?.getSelectedAcademicYear();
  if (!selectedYear) {
    console.warn('Anno accademico non selezionato per il controllo esami minimi');
    // Non procedere se non c'è un anno selezionato
    return;
  }
  params.append('anno', selectedYear);
  
  // Ottieni il docente se disponibile (per admin)
  if (window.currentUsername) {
    params.append('docente', window.currentUsername);
  }
  
  const url = `/api/check-esami-minimi?${params.toString()}`;

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Errore nella richiesta API");
      }
      return response.json();
    })
    .then((data) => {
      // Prima elimina tutte le notifiche di avviso esistenti per gli esami minimi
      if (window.clearAlerts) {
        window.clearAlerts();
      }

      if (
        data.status === "warning" &&
        data.nessun_problema === false &&
        data.insegnamenti_sotto_minimo &&
        data.insegnamenti_sotto_minimo.length > 0
      ) {
        // Ci sono insegnamenti sotto il minimo
        // Invia i dati alla funzione showMessage in sidebar.js
        if (window.showMessage) {
          // Crea contenuto formattato per gli insegnamenti
          let content = `<p>Insegnamenti con meno di 8 esami inseriti:</p>`;
          content += `<ul style="margin-top:8px;margin-bottom:8px;padding-left:20px;">`;
          data.insegnamenti_sotto_minimo.forEach((ins) => {
            content += `<li style="font-size:0.9em;margin-bottom:4px;">${ins.titolo} (${ins.codici_cds}): ${ins.esami_inseriti}/8</li>`;
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
}

// Espone la funzione globalmente per poterla chiamare dopo inserimenti riusciti
// NOTA: Questa funzione viene automaticamente chiamata da window.forceCalendarRefresh()
// che deve essere invocata dopo ogni inserimento, modifica o eliminazione di esami
window.checkEsamiMinimi = checkEsamiMinimi;

document.addEventListener("DOMContentLoaded", function () {
  // Controlla gli esami minimi all'avvio della pagina
  checkEsamiMinimi();
});
