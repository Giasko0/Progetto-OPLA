// Form inserimento esame

// Mostra il form per inserimento/modifica esame
export function showEsameForm(info) {
  // Mostra il popup
  const popupOverlay = document.getElementById("popupOverlay");
  if (popupOverlay) {
    popupOverlay.style.display = "flex";
  }

  // Se abbiamo una data, impostiamola nel form
  if (info && info.dateStr) {
    const dataElement = document.getElementById("dataora");
    if (dataElement) dataElement.value = info.dateStr;
  }

  // Assicuriamoci che il dropdown esista e abbia il display corretto
  const dropdown = document.getElementById("insegnamentoDropdown");
  if (dropdown) {
    dropdown.style.display = "none"; // Reset dello stato del dropdown
  }

  // Sincronizza gli insegnamenti dal manager alla select multipla
  getUserData()
    .then(data => {
      if (data && data.authenticated && data.user_data) {
        const userData = data.user_data;
        const docField = document.getElementById("docente");
        
        if (docField) {
          docField.value = userData.username;
          
          // Inizializza la select multipla se necessario
          if (window.InsegnamentiManager) {
            // Utilizziamo un breve timeout per dare tempo al DOM di renderizzare completamente
            setTimeout(() => {
              // Rimuovi e ricrea i listener di eventi per i click sulla select multipla
              const multiSelectBox = document.getElementById("insegnamentoBox");
              const multiSelectDropdown = document.getElementById("insegnamentoDropdown");
              
              if (multiSelectBox && multiSelectDropdown) {
                // Rimuoviamo tutti gli event listener precedenti clonando l'elemento
                const newMultiSelectBox = multiSelectBox.cloneNode(true);
                multiSelectBox.parentNode.replaceChild(newMultiSelectBox, multiSelectBox);
                
                // Ricreazione evento click per aprire/chiudere il dropdown
                newMultiSelectBox.addEventListener("click", function (e) {
                  e.stopPropagation();
                  const isActive = multiSelectDropdown.style.display === "block";
                  multiSelectDropdown.style.display = isActive ? "none" : "block";
                });
              }
              
              // Assicurati che la select multipla sia inizializzata
              window.InsegnamentiManager.initMultiSelect("insegnamentoBox", "insegnamentoDropdown");
              
              // Carica e visualizza gli insegnamenti
              window.InsegnamentiManager.initFormInsegnamenti(userData.username, () => {
                // Callback vuota, l'inizializzazione è completa
              });
            }, 100); // Un breve timeout per dare tempo al browser di renderizzare il form
          }
        }
      }
    })
    .catch(error => console.error("Errore nel recupero dati utente:", error));
}

// Esporta funzioni
export default { showEsameForm };
