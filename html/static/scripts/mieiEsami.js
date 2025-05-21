// Script per la gestione della pagina "I miei esami"

// Quando il documento è pronto
document.addEventListener("DOMContentLoaded", function () {
  // Assicuriamoci che i dati utente siano precaricati
  window.preloadUserData();
  
  // Aggiorna il titolo della pagina
  window.updatePageTitle();

  // Ottieni i dati degli esami dell'utente
  fetchAndDisplayEsami();
});

// Carica gli esami dell'utente e li visualizza
function fetchAndDisplayEsami() {
  // Ottiene i dati dell'utente tramite la funzione centralizzata
  getUserData()
    .then((data) => {
      if (data && data.authenticated && data.user_data) {
        const userData = data.user_data;

        // Carica gli esami dell'utente usando l'API
        fetch(`/api/getMieiEsamiInsegnamenti`)
          .then((response) => {
            if (!response.ok) {
              throw new Error("Errore nel caricamento degli esami");
            }
            return response.json();
          })
          .then((data) => {
            // Visualizza i dati degli esami
            const tabsHeader = document.getElementById("tabsHeader");
            const container = document.getElementById("contenitoreEsami");
            // Manteniamo il pulsante "Tutti gli appelli"
            const allExamsButton = document.getElementById("allExamsButton");
            container.innerHTML = "";

            // Manteniamo solo il pulsante "Tutti gli appelli"
            tabsHeader.innerHTML = "";
            tabsHeader.appendChild(allExamsButton);

            const insegnamenti = Object.keys(data.insegnamenti);

            // Salviamo i dati come proprietà globale per usarli nel tab "Tutti gli appelli"
            window.esamiData = data;

            // Crea i pulsanti dei tabs
            insegnamenti.forEach((insegnamento, index) => {
              const tabButton = document.createElement("button");
              tabButton.className = "tab-button";
              tabButton.textContent = insegnamento;
              // Usa un link diretto per cambiare pagina
              tabButton.onclick = function () {
                window.location.href = `?insegnamento=${encodeURIComponent(
                  insegnamento
                )}`;
              };
              tabsHeader.appendChild(tabButton);

              // Crea il contenuto del tab
              const tabContent = document.createElement("div");
              tabContent.className = "tab-content";
              tabContent.style.display = "none"; // Tutti i tab sono nascosti inizialmente
              tabContent.id = `tab-${insegnamento.replace(/\s+/g, "-")}`;

              // Aggiungi contenuto al tab
              displaySessioniEsami(data, insegnamento, tabContent);
              displayTabelleEsami(data, insegnamento, tabContent);

              container.appendChild(tabContent);
            });

            // Crea il tab per "Tutti gli appelli"
            const allExamsTab = document.createElement("div");
            allExamsTab.className = "tab-content";
            allExamsTab.id = "tab-all-exams";

            // Per default, tutti i tab sono nascosti
            allExamsTab.style.display = "none";
            displayAllExams(data, allExamsTab);
            container.appendChild(allExamsTab);

            // Leggi il parametro URL
            const urlParams = new URLSearchParams(window.location.search);
            const insegnamentoParam = urlParams.get("insegnamento");

            // Se c'è un parametro insegnamento nell'URL
            if (insegnamentoParam) {
              // Cerca il tab corrispondente
              const tabId = `tab-${insegnamentoParam.replace(/\s+/g, "-")}`;
              const tab = document.getElementById(tabId);

              if (tab) {
                // Mostra il tab richiesto
                tab.style.display = "block";

                // Attiva il pulsante corrispondente
                const buttons = document.querySelectorAll(".tab-button");
                buttons.forEach((button) => {
                  if (button.textContent === insegnamentoParam) {
                    button.classList.add("active");
                  }
                });
              } else {
                // Se non esiste, mostra "Tutti gli appelli"
                allExamsTab.style.display = "block";
                allExamsButton.classList.add("active");
              }
            } else {
              // Se non c'è parametro, mostra "Tutti gli appelli"
              allExamsTab.style.display = "block";
              allExamsButton.classList.add("active");
            }
          })
          .catch((error) => {
            console.error("Errore:", error);
            // Mostra un messaggio di errore all'utente
            document.getElementById(
              "contenitoreEsami"
            ).innerHTML = `<div class="error-message">Si è verificato un errore nel caricamento degli esami: ${error.message}</div>`;
          });
      }
    })
    .catch((error) => {
      console.error("Errore nell'ottenimento dati utente:", error);
      document.getElementById(
        "contenitoreEsami"
      ).innerHTML = `<div class="error-message">Si è verificato un errore nell'ottenimento dei dati: ${error.message}</div>`;
    });
}

function displayTabelleEsami(data, insegnamento, container) {
  const esamiInsegnamento = data.esami.filter(
    (esame) => esame.insegnamento === insegnamento
  );

  if (esamiInsegnamento.length > 0) {
    const section = document.createElement("div");
    section.className = "section";

    const table = document.createElement("table");
    table.id = `tabella-${insegnamento.replace(/\s+/g, "-")}`;
    table.className = "esami-table";

    table.innerHTML = `
      <thead class="esami-thead">
          <tr class="esami-tr">
              <th class="esami-th" onclick="sortTable('${table.id}', 0)">Tipo prova</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 1)">CDS</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 2)">Insegnamento</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 3)">Docente</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 4, 'date')">Data</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 5)">Aula</th>
              <th class="esami-th" onclick="sortTable('${table.id}', 6)">Durata (min)</th>
              <th class="esami-th">Azioni</th>
          </tr>
      </thead>
      <tbody class="esami-tbody"></tbody>
    `;

    const tbody = table.querySelector("tbody");

    esamiInsegnamento.forEach((esame) => {
      const row = tbody.insertRow();
      row.className = "esami-tr";
      let cell0 = row.insertCell(0);
      cell0.className = "esami-td";
      cell0.textContent = esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale";
      let cell1 = row.insertCell(1);
      cell1.className = "esami-td";
      cell1.textContent = esame.cds || "N/A";
      let cell2 = row.insertCell(2);
      cell2.className = "esami-td";
      cell2.textContent = esame.insegnamento;
      let cell3 = row.insertCell(3);
      cell3.className = "esami-td";
      cell3.textContent = esame.docenteNome;

      // Aggiungo il data-datetime come attributo nascosto per l'ordinamento
      const dataCell = row.insertCell(4);
      dataCell.className = "esami-td";
      dataCell.textContent = formatDateTime(esame.dataora);
      dataCell.setAttribute("data-datetime", esame.dataora);

      let cell5 = row.insertCell(5);
      cell5.className = "esami-td";
      cell5.textContent = esame.aula;
      let cell6 = row.insertCell(6);
      cell6.className = "esami-td";
      cell6.textContent = formatDurata(esame.durata_appello);
      
      // Cella Azioni con pulsante Modifica
      const actionCell = row.insertCell(7);
      actionCell.className = "esami-td esami-td-actions";
      const modifyButton = document.createElement("button");
      modifyButton.className = "invia";
      modifyButton.textContent = "Modifica";
      modifyButton.setAttribute("data-id", esame.id);
      modifyButton.onclick = function() {
        editEsame(esame.id);
      };
      actionCell.appendChild(modifyButton);
    });

    section.appendChild(table);
    container.appendChild(section);
  } else {
    // Aggiungi un messaggio se non ci sono esami per questo insegnamento
    const noExamsMsg = document.createElement("p");
    noExamsMsg.style.textAlign = "center";
    noExamsMsg.textContent = "Inserisci degli appelli d'esame per visualizzarli qui!";
    container.appendChild(noExamsMsg);
  }
}

function displaySessioniEsami(data, insegnamento, container) {
  const section = document.createElement("div");
  section.className = "exam-section";

  // Aggiungi il titolo
  const title = document.createElement("h2");
  title.textContent = insegnamento;
  section.appendChild(title);

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const planningYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
  const nextYear = planningYear + 1;

  const sessioni = data.insegnamenti[insegnamento];

  // Crea il contenitore della griglia
  const gridContainer = document.createElement("div");
  gridContainer.className = "sessions-grid";

  // Array delle sessioni da visualizzare
  const sessioniDaVisualizzare = [
    {
      nome: "Sessione Anticipata",
      periodo: `Gen/Feb ${planningYear}`,
      count: sessioni.Anticipata || 0,
      max: 3,
    },
    {
      nome: "Pausa Didattica",
      periodo: `Mar/Apr ${planningYear}`,
      count: sessioni["Pausa Didattica"] || 0,
      max: 1,
    },
    {
      nome: "Sessione Estiva",
      periodo: `Giu/Lug ${planningYear}`,
      count: sessioni.Estiva || 0,
      max: 3,
    },
    {
      nome: "Sessione Autunnale",
      periodo: `Set ${planningYear}`,
      count: sessioni.Autunnale || 0,
      max: 2,
    },
    {
      nome: "Pausa Didattica",
      periodo: `Nov ${planningYear}`,
      count: sessioni["Pausa Didattica"] || 0,
      max: 1,
    },
    {
      nome: "Sessione Invernale",
      periodo: `Gen/Feb ${nextYear}`,
      count: sessioni.Invernale || 0,
      max: 3,
    },
  ];

  // Crea le cards delle sessioni
  sessioniDaVisualizzare.forEach((sessione) => {
    const card = document.createElement("div");
    card.className = "session-card static";

    const heading = document.createElement("h4");
    heading.textContent = `${sessione.nome} (${sessione.periodo})`;

    const count = document.createElement("p");
    count.textContent = `${sessione.count}/${sessione.max} esami`;

    card.appendChild(heading);
    card.appendChild(count);
    gridContainer.appendChild(card);
  });

  section.appendChild(gridContainer);
  container.appendChild(section);
}

function displayAllExams(data, container) {
  // Aggiungi il riepilogo delle sessioni per tutti gli insegnamenti
  const sessionsSection = document.createElement("div");
  sessionsSection.className = "exam-section";

  const sessionsTitle = document.createElement("h2");
  sessionsTitle.textContent = "Riepilogo insegnamenti";
  sessionsSection.appendChild(sessionsTitle);

  // Crea una griglia per mostrare tutti gli insegnamenti (stile simile a exam-session)
  const sessionsGrid = document.createElement("div");
  sessionsGrid.className = "sessions-grid";

  // Per ogni insegnamento, crea una card simile a quelle usate in displaySessioniEsami
  const insegnamenti = Object.keys(data.insegnamenti);
  insegnamenti.forEach((insegnamento) => {
    const sessioni = data.insegnamenti[insegnamento];
    const totaleEsami = Object.values(sessioni).reduce(
      (sum, val) => sum + (val || 0),
      0
    );

    const cardElement = document.createElement("div");
    cardElement.className = "session-card";

    // Aggiungiamo una classe in base al numero di esami
    if (totaleEsami < 8) {
      cardElement.classList.add("warning-card");
    } else {
      cardElement.classList.add("success-card");
    }

    cardElement.innerHTML = `
      <h4>${insegnamento}</h4>
      <p>${totaleEsami} esami inseriti</p>
      <p class="exams-requirement">Min: 8 - Max: 13</p>
    `;

    // Aggiungi il click handler
    cardElement.addEventListener("click", () => {
      window.location.href = `?insegnamento=${encodeURIComponent(
        insegnamento
      )}`;
    });

    sessionsGrid.appendChild(cardElement);
  });

  sessionsSection.appendChild(sessionsGrid);
  container.appendChild(sessionsSection);

  // Verifica se ci sono esami
  if (data.esami.length === 0) {
    const noExamsMsg = document.createElement("p");
    noExamsMsg.style.textAlign = "center";
    noExamsMsg.textContent = "Inserisci degli appelli d'esame per visualizzarli qui!";
    container.appendChild(noExamsMsg);
    return; // Termina la funzione per non creare la tabella vuota
  }

  // Continua con la tabella dettagliata di tutti gli appelli
  const section = document.createElement("div");
  section.className = "section";

  const tableAllExams = document.createElement("table");
  tableAllExams.id = "tabella-tutti-appelli";
  tableAllExams.className = "esami-table";

  tableAllExams.innerHTML = `
    <thead class="esami-thead">
        <tr class="esami-tr">
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 0)">Tipo prova</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 1)">CDS</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 2)">Insegnamento</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 3)">Docente</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 4, 'date')">Data</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 5)">Aula</th>
            <th class="esami-th" onclick="sortTable('${tableAllExams.id}', 6)">Durata</th>
            <th class="esami-th">Azioni</th>
        </tr>
    </thead>
    <tbody class="esami-tbody"></tbody>
  `;

  const tbodyAllExams = tableAllExams.querySelector("tbody");
  // Ordina gli esami per data
  const esamiOrdinati = [...data.esami].sort((a, b) => {
    const dateA = new Date(a.dataora);
    const dateB = new Date(b.dataora);
    return dateA - dateB;
  });

  esamiOrdinati.forEach((esame) => {
    const row = tbodyAllExams.insertRow();
    row.className = "esami-tr";
    let cell0 = row.insertCell(0);
    cell0.className = "esami-td";
    cell0.textContent = esame.tipo_appello === "PP" ? "Prova parziale" : "Prova finale";
    let cell1 = row.insertCell(1);
    cell1.className = "esami-td";
    cell1.textContent = esame.cds || "N/A";
    let cell2 = row.insertCell(2);
    cell2.className = "esami-td";
    cell2.textContent = esame.insegnamento;
    let cell3 = row.insertCell(3);
    cell3.className = "esami-td";
    cell3.textContent = esame.docenteNome;

    // Aggiungo il data-datetime come attributo nascosto per l'ordinamento
    const dataCell = row.insertCell(4);
    dataCell.className = "esami-td";
    dataCell.textContent = formatDateTime(esame.dataora);
    dataCell.setAttribute("data-datetime", esame.dataora);

    let cell5 = row.insertCell(5);
    cell5.className = "esami-td";
    cell5.textContent = esame.aula;
    let cell6 = row.insertCell(6);
    cell6.className = "esami-td";
    cell6.textContent = formatDurata(esame.durata_appello);
    
    // Cella Azioni con pulsante Modifica
    const actionCell = row.insertCell(7);
    actionCell.className = "esami-td esami-td-actions";
    const modifyButton = document.createElement("button");
    modifyButton.className = "invia";
    modifyButton.textContent = "Modifica";
    modifyButton.setAttribute("data-id", esame.id);
    modifyButton.onclick = function() {
      editEsame(esame.id);
    };
    actionCell.appendChild(modifyButton);
  });

  section.appendChild(tableAllExams);
  container.appendChild(section);
}

// Ordinamento tabella migliorato per gestire correttamente le date
function sortTable(tableId, colIndex, type = "text") {
  const table = document.getElementById(tableId);
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows);
  let direction = "asc";

  // Verifica se stiamo invertendo la direzione dell'ordinamento
  if (
    table.getAttribute("data-sort-col") === colIndex.toString() &&
    table.getAttribute("data-sort-dir") === "asc"
  ) {
    direction = "desc";
  }

  // Memorizza lo stato dell'ordinamento
  table.setAttribute("data-sort-col", colIndex);
  table.setAttribute("data-sort-dir", direction);

  // Esegue l'ordinamento
  rows.sort((a, b) => {
    let aValue, bValue;

    if (type === "date") {
      // Usa il valore dell'attributo data-datetime per le date
      aValue =
        a.cells[colIndex].getAttribute("data-datetime") ||
        a.cells[colIndex].textContent.trim();
      bValue =
        b.cells[colIndex].getAttribute("data-datetime") ||
        b.cells[colIndex].textContent.trim();

      // Converti in oggetti Date per il confronto
      const dateA = new Date(aValue);
      const dateB = new Date(bValue);

      return direction === "asc" ? dateA - dateB : dateB - dateA;
    } else {
      // Per i campi di testo, usa il metodo esistente
      aValue = a.cells[colIndex].textContent.trim().toLowerCase();
      bValue = b.cells[colIndex].textContent.trim().toLowerCase();

      return direction === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
  });

  // Ricostruisce la tabella con le righe ordinate
  rows.forEach((row) => tbody.appendChild(row));
}

// Funzione per formattare data e ora
function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return "Data non disponibile";

  try {
    const date = new Date(dateTimeStr);

    if (isNaN(date.getTime())) {
      // Gestione fallback per formati di data non standard
      return dateTimeStr;
    }

    // Formattazione in stile italiano: DD/MM/YYYY, HH:MM
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // +1 perché i mesi sono 0-based
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  } catch (error) {
    console.error("Errore nella formattazione della data:", error);
    return dateTimeStr; // Restituisci la stringa originale in caso di errore
  }
}

// Funzione per formattare la durata in ore e minuti
function formatDurata(durataMinuti) {
  if (!durataMinuti) return "N/D";
  
  const durata = parseInt(durataMinuti, 10);
  if (isNaN(durata)) return durataMinuti;
  
  const ore = Math.floor(durata / 60);
  const minuti = durata % 60;
  
  if (ore === 0) {
    return `${minuti} min`;
  } else if (minuti === 0) {
    return ore === 1 ? `${ore} ora` : `${ore} ore`;
  } else {
    return `${ore} ${ore === 1 ? 'ora' : 'ore'} e ${minuti} min`;
  }
}

// Funzione per aprire il form di modifica dell'esame
function editEsame(esameId) {
  // Verificare che EsameForm esista
  if (window.EsameForm) {
    console.log("Richiesta modifica esame con ID:", esameId);
    
    // Carica i dettagli dell'esame e mostra il form
    fetch(`/api/getEsameById?id=${esameId}`)
      .then(response => {
        console.log("Risposta API getEsameById status:", response.status);
        return response.json();
      })
      .then(data => {
        console.log("Dati ricevuti da getEsameById:", data);
        if (data.success) {
          try {
            // Assicurati che InsegnamentiManager sia disponibile
            if (!window.InsegnamentiManager) {
              throw new Error("InsegnamentiManager non inizializzato");
            }

            // Mostra il form e dopo inizializza InsegnamentiManager
            window.EsameForm.showForm(data.esame, true)
              .then(() => {
                // Recupera l'username dal campo docente
                const username = document.getElementById("docente")?.value;
                if (username) {
                  // Inizializza InsegnamentiManager
                  window.InsegnamentiManager.initUI(
                    "insegnamentoBox",
                    "insegnamentoDropdown",
                    "insegnamentoOptions",
                    username
                  );
                }
              });
          } catch (err) {
            console.error("Errore nella compilazione del form:", err);
            showMessage("Errore nella compilazione del form: " + err.message, "Errore", "error");
          }
        } else {
          console.error("Errore nella risposta API:", data.message);
          showMessage(data.message, "Errore", "error");
        }
      })
      .catch(error => {
        console.error("Errore nel caricamento dei dettagli dell'esame:", error);
        showMessage("Errore nel caricamento dei dettagli dell'esame", "Errore", "error");
      });
  } else {
    console.error("EsameForm non disponibile");
    showMessage("Impossibile modificare l'esame: modulo non disponibile", "Errore", "error");
  }
}

// Funzione per eliminare un esame
function deleteEsame(examId) {
  fetch('/api/deleteEsame', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: examId }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage("Esame eliminato con successo", "Successo", "success");
        
        // Chiudi il form
        const popupOverlay = document.getElementById("popupOverlay");
        if (popupOverlay) {
          popupOverlay.style.display = "none";
        }
        
        // Ricarica la pagina per aggiornare la tabella
        setTimeout(() => {
          location.reload();
        }, 1000);
      } else {
        showMessage(data.message || "Errore nell'eliminazione dell'esame", "Errore", "error");
      }
    })
    .catch(error => {
      console.error("Errore nella richiesta di eliminazione:", error);
      showMessage("Errore nella richiesta di eliminazione", "Errore", "error");
    });
}

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;
window.editEsame = editEsame;
window.deleteEsame = deleteEsame;

// Aggiorna l'evento del pulsante "Tutti gli appelli"
document.addEventListener("DOMContentLoaded", function () {
  const allExamsButton = document.getElementById("allExamsButton");
  if (allExamsButton) {
    allExamsButton.onclick = function () {
      window.location.href = window.location.pathname;
    };
  }
});
