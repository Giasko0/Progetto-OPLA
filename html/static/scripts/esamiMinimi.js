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
        const isMultiple = data.insegnamenti_sotto_minimo.length > 1;
        
        let content = `<div style="font-size: 0.9rem; line-height: 1.4;">`;
        
        if (isMultiple) {
          content += `<p style="margin: 0; color: var(--color-text-light); font-size: 0.85rem;">Clicca per espandere i dettagli:</p>`;
        }
        
        data.insegnamenti_sotto_minimo.forEach((ins, index) => {
          if (index > 0) content += `<div style="margin-top: 8px;"></div>`;
          
          if (isMultiple) {
            // Header collassabile per più insegnamenti
            content += `<div class="collapse-toggle" style="cursor: pointer; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px; border-left: 3px solid var(--color-blue); margin-top: 8px; user-select: none;">`;
            content += `<span class="collapse-icon material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 8px; color: var(--color-text-light);">keyboard_arrow_right</span>`;
            content += `<strong style="color: var(--color-text); font-size: 0.9rem;">${ins.titolo}</strong>`; 
            content += `</div>`;
            
            // Contenuto collassabile
            content += `<div class="collapse-content" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; padding: 0 12px;">`;
          } else {
            // Header fisso per singolo insegnamento
            content += `<div style="padding: 8px; background: var(--color-bg-secondary); border-radius: 4px; border-left: 3px solid var(--color-blue); margin-bottom: 8px;">`;
            content += `<strong style="color: var(--color-text); font-size: 0.9rem;">${ins.titolo}</strong>`;
            content += `</div>`;
          }
          
          content += `<div style="padding: 8px 0;">`;
          content += `<div style="font-size: 0.8rem; color: var(--color-text-light); margin-bottom: 6px;">${ins.codici_cds}</div>`;
          
          // Se è sotto il target generale
          if (ins.sotto_target) {
            content += `<div style="color: var(--color-error); font-size: 0.85rem; margin-bottom: 4px; padding: 4px 8px; background: var(--alert-target-bg); border-radius: 3px;">`;
            content += `📊 Target generale: ${ins.esami_inseriti}/${targetEsami} esami`;
            content += `</div>`;
          }
          
          // Se ci sono sessioni problematiche
          if (ins.sessioni_problematiche && ins.sessioni_problematiche.length > 0) {
            content += `<div style="color: var(--color-warning); font-size: 0.85rem; padding: 4px 8px; background: var(--alert-session-bg); border-radius: 3px;">`;
            
            ins.sessioni_problematiche.forEach((sessione) => {
              const nomeSessione = sessione.tipo_sessione.charAt(0).toUpperCase() + sessione.tipo_sessione.slice(1);
              
              // Controllo speciale per insegnamenti annuali in anticipata
              if (ins.semestre === 3 && sessione.tipo_sessione === 'anticipata' && sessione.minimo_richiesto === 0) {
                content += `⚠️ ${nomeSessione}: ${sessione.esami_presenti} appelli presenti<br>`;
                content += `<span style="margin-left: 12px; font-size: 0.8rem; color: var(--color-error);">• Gli insegnamenti annuali non devono avere appelli in anticipata</span><br>`;
              } else {
                content += `⚠️ ${nomeSessione}: ${sessione.esami_presenti}/${sessione.minimo_richiesto}<br>`;
              }
            });
            
            content += `</div>`;
          }
          
          content += `</div>`;
          
          if (isMultiple) {
            content += `</div>`;
          }
        });
        
        content += `</div>`;

        // Mostra l'avviso nella sidebar
        window.showMessage(content, "Avviso appelli minimi", "info", { html: true });
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
