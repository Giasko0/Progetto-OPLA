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
        let content = `<p>Problemi rilevati negli esami inseriti:</p>`;
        content += `<ul style="margin-top:8px;margin-bottom:8px;padding-left:20px;">`;
        
        data.insegnamenti_sotto_minimo.forEach((ins) => {
          content += `<li style="font-size:1rem;margin-bottom:8px;">`;
          content += `<strong>${ins.titolo}</strong> (${ins.codici_cds})`;
          
          // Se è sotto il target generale
          if (ins.sotto_target) {
            content += `<br><span style="color: #dc3545; font-size: 1rem;">• Target generale: ${ins.esami_inseriti}/${targetEsami} esami</span>`;
          }
          
          // Se ci sono sessioni problematiche
          if (ins.sessioni_problematiche && ins.sessioni_problematiche.length > 0) {
            content += `<br><span style="color: #ffc107; font-size: 1rem;">• Sessioni sotto minimo:</span>`;
            content += `<ul style="margin: 2px 0; padding-left: 15px;">`;
            ins.sessioni_problematiche.forEach((sessione) => {
              const nomeSessione = sessione.tipo_sessione.charAt(0).toUpperCase() + sessione.tipo_sessione.slice(1);
              content += `<li style="font-size: 1rem; color: #6c757d; margin: 1px 0;">`;
              content += `${nomeSessione}: ${sessione.esami_presenti}/${sessione.minimo_richiesto}`;
              content += `</li>`;
            });
            content += `</ul>`;
          }
          
          content += `</li>`;
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
