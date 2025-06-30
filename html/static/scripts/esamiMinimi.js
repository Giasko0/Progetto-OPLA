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

    // Costruisci i parametri per l'API
    const params = new URLSearchParams({
      anno: selectedYear,
      docente: userData.user_data.username
    });
    
    const response = await fetch(`/api/check-esami-minimi?${params}`);
    if (!response.ok) {
      throw new Error("Errore nella richiesta API");
    }

    const data = await response.json();
    
    // Prima elimina tutte le notifiche di avviso esistenti per gli esami minimi
    if (window.clearAlerts) {
      window.clearAlerts();
    }

    if (data.status === "warning" && !data.nessun_problema && data.insegnamenti_sotto_minimo?.length > 0) {
      // Ci sono insegnamenti sotto il minimo
      if (window.showMessage) {
        const targetEsami = data.target_esami;
        let content = `<p>Insegnamenti con meno di ${targetEsami} esami inseriti:</p>`;
        content += `<ul style="margin-top:8px;margin-bottom:8px;padding-left:20px;">`;
        data.insegnamenti_sotto_minimo.forEach((ins) => {
          content += `<li style="font-size:0.9em;margin-bottom:4px;">${ins.titolo} (${ins.codici_cds}): ${ins.esami_inseriti}/${targetEsami}</li>`;
        });
        content += `</ul>`;

        // Mostra l'avviso nella sidebar
        window.showMessage(content, "Attenzione!", "warning", { html: true });
      }
    }
  } catch (error) {
    console.error("Errore nel recupero degli esami minimi:", error);
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
