// Funzione per controllare gli esami minimi e mostrare avvisi nella sidebar
async function checkEsamiMinimi() {
  try {
    // Ottieni i dati dell'utente autenticato
    const userData = await window.getUserData();
    if (!userData || !userData.authenticated || !userData.user_data) {
      return;
    }

    // Assicurati che l'anno accademico sia inizializzato
    const selectedYear = window.AnnoAccademicoManager.getSelectedAcademicYear();
    if (!selectedYear) {
      return;
    }

    // Costruisci i parametri per includere l'anno selezionato
    let params = new URLSearchParams();
    
    params.append('anno', selectedYear);
    params.append('docente', userData.user_data.username);
    
    const url = `/api/check-esami-minimi?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Errore nella richiesta API");
    }

    const data = await response.json();
    
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
        const targetEsami = data.target_esami;
        let content = `<p>Insegnamenti con meno di ${targetEsami} esami inseriti:</p>`;
        content += `<ul style="margin-top:8px;margin-bottom:8px;padding-left:20px;">`;
        data.insegnamenti_sotto_minimo.forEach((ins) => {
          content += `<li style="font-size:0.9em;margin-bottom:4px;">${ins.titolo} (${ins.codici_cds}): ${ins.esami_inseriti}/${targetEsami}</li>`;
        });
        content += `</ul>`;

        // Mostra l'avviso nella sidebar con il titolo "Attenzione!"
        window.showMessage(content, "Attenzione!", "warning", { html: true });
      }
    }
  } catch (error) {
    console.error("Errore nel recupero degli esami minimi:", error);
    // Usa showMessage per gli errori di esami minimi
    if (window.showMessage) {
      window.showMessage(
        "Errore nel recupero degli esami minimi. Riprova più tardi.",
        "Errore di sistema",
        "error"
      );
    }
  }
}

window.checkEsamiMinimi = checkEsamiMinimi;

document.addEventListener("DOMContentLoaded", async function () {
  // Assicurati che l'anno accademico sia caricato prima di controllare gli esami minimi
  await window.AnnoAccademicoManager.initSelectedAcademicYear();
  checkEsamiMinimi();
});
