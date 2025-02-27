document.addEventListener("DOMContentLoaded", loadProfile);

function loadProfile() {
    fetch('/flask/api/profiloInfo')
    .then(response => response.json())
    .then(data => {
        const container = document.querySelector('.sessions-container');
        container.innerHTML = ''; // Pulisci il contenitore esistente

        // Per ogni insegnamento, crea una sezione separata
        Object.entries(data.insegnamenti).forEach(([insegnamento, sessioni]) => {
            const section = document.createElement('div');
            section.className = 'profile-section';
            
            section.innerHTML = `
                <h3>${insegnamento}</h3>
                <div class="sessions-grid">
                    <div class="session-card">
                        <h4>Sessione Invernale (Gen/Feb)</h4>
                        <p>${sessioni.Invernale}/3 esami</p>
                    </div>
                    <div class="session-card">
                        <h4>Sessione Straordinaria (Apr)</h4>
                        <p>${sessioni.Straordinaria}/1 esami</p>
                    </div>
                    <div class="session-card">
                        <h4>Sessione Estiva (Giu/Lug)</h4>
                        <p>${sessioni.Estiva}/3 esami</p>
                    </div>
                    <div class="session-card">
                        <h4>Pausa Didattica (Nov)</h4>
                        <p>${sessioni["Pausa didattica"]}/1 esami</p>
                    </div>
                </div>
            `;
            
            container.appendChild(section);
        });
    })
    .catch(error => console.error("Errore nel caricamento del profilo:", error));
}
