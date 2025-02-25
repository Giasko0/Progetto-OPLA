document.addEventListener("DOMContentLoaded", loadProfile);

function loadProfile() {
    fetch('/flask/api/profiloInfo')
    .then(response => response.json())
    .then(data => {
        document.getElementById("session-invernale").textContent = data.sessioni.Invernale + "/3 esami";
        document.getElementById("session-straordinaria").textContent = data.sessioni.Straordinaria + "/1 esami";
        document.getElementById("session-estiva").textContent = data.sessioni.Estiva + "/3 esami";
        document.getElementById("session-pausa").textContent = data.sessioni["Pausa didattica"] + "/1 esami";
    })
    .catch(error => console.error("Errore nel caricamento del profilo:", error));
}
