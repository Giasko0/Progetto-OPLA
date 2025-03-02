document.addEventListener("DOMContentLoaded", () => {
  mieiEsamiTabella();
  mieiEsamiSessioni();
});

function mieiEsamiTabella() {
  fetch("/flask/api/mieiEsami")
    .then((response) => response.json())
    .then((data) => {
      const insegnamenti = Object.keys(data.insegnamenti);
      const container = document.getElementById("tabelleInsegnamenti");
      container.innerHTML = ""; // Pulisci il contenitore

      insegnamenti.forEach((insegnamento) => {
        const esamiInsegnamento = data.esami.filter(
          (esame) => esame.insegnamento === insegnamento
        );

        if (esamiInsegnamento.length > 0) {
          // Crea sezione per l'insegnamento
          const section = document.createElement("div");
          section.className = "section";

          // Aggiungi titolo insegnamento
          const title = document.createElement("h3");
          title.textContent = insegnamento;
          section.appendChild(title);

          // Crea tabella
          const table = document.createElement("table");
          table.id = `tabella-${insegnamento.replace(/\s+/g, "-")}`;

          // Aggiungi intestazione
          table.innerHTML = `
            <thead>
                <tr>
                    <th onclick="sortTable('${table.id}', 0)">Docente</th>
                    <th onclick="sortTable('${table.id}', 1)">Insegnamento</th>
                    <th onclick="sortTable('${table.id}', 2)">Aula</th>
                    <th onclick="sortTable('${table.id}', 3)">Data</th>
                </tr>
            </thead>
            <tbody></tbody>
          `;

          // Popola tabella
          const tbody = table.querySelector("tbody");
          esamiInsegnamento.forEach((esame) => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = esame.docente;
            row.insertCell(1).textContent = esame.insegnamento;
            row.insertCell(2).textContent = esame.aula;
            row.insertCell(3).textContent = esame.dataora;
          });

          section.appendChild(table);
          container.appendChild(section);
        }
      });
    })
    .catch((error) => console.error("Errore:", error));
}

function mieiEsamiSessioni() {
  fetch("/flask/api/mieiEsami")
    .then((response) => response.json())
    .then((data) => {
      const container = document.querySelector(".sessions-container");
      container.innerHTML = "";

      // Determina gli anni validi in base al mese corrente
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const planningYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
      const nextYear = planningYear + 1;

      // Per ogni insegnamento, crea una sezione separata
      Object.entries(data.insegnamenti).forEach(([insegnamento, sessioni]) => {
        const section = document.createElement("div");
        section.className = "exam-section";

        section.innerHTML = `
          <h3>${insegnamento}</h3>
          <div class="sessions-grid">
              <div class="session-card">
                  <h4>Sessione Anticipata (Gen/Feb ${planningYear})</h4>
                  <p>${sessioni.Anticipata || 0}/3 esami</p>
              </div>
              <div class="session-card">
                  <h4>Pausa Didattica (Mar/Apr ${planningYear})</h4>
                  <p>${sessioni["Pausa Didattica Primavera"] || 0}/1 esami</p>
              </div>
              <div class="session-card">
                  <h4>Sessione Estiva (Giu/Lug ${planningYear})</h4>
                  <p>${sessioni.Estiva || 0}/3 esami</p>
              </div>
              <div class="session-card">
                  <h4>Sessione Autunnale (Set ${planningYear})</h4>
                  <p>${sessioni.Autunnale || 0}/2 esami</p>
              </div>
              <div class="session-card">
                  <h4>Pausa Didattica (Nov ${planningYear})</h4>
                  <p>${sessioni["Pausa Didattica Autunno"] || 0}/1 esami</p>
              </div>
              <div class="session-card">
                  <h4>Sessione Invernale (Gen/Feb ${nextYear})</h4>
                  <p>${sessioni.Invernale || 0}/3 esami</p>
              </div>
          </div>
        `;
        container.appendChild(section);
      });
    })
    .catch((error) => console.error("Errore:", error));
}

// Ordinamento tabella
function sortTable(tableId, colIndex) {
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
    const aValue = a.cells[colIndex].textContent.trim().toLowerCase();
    const bValue = b.cells[colIndex].textContent.trim().toLowerCase();

    return direction === "asc"
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
  });

  // Ricostruisce la tabella con le righe ordinate
  rows.forEach((row) => tbody.appendChild(row));
}

// Espone funzioni necessarie per l'HTML
window.sortTable = sortTable;