document.addEventListener("DOMContentLoaded", caricaMieiEsami);

function caricaMieiEsami() {
    fetch('/flask/api/mieiEsami')
    .then(response => response.json())
    .then(data => {
        const container = document.querySelector('.sessions-container');
        container.innerHTML = '';

        // Determina gli anni validi in base al mese corrente
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const planningYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
        const nextYear = planningYear + 1;

        // Per ogni insegnamento, crea una sezione separata
        Object.entries(data.insegnamenti).forEach(([insegnamento, sessioni]) => {
            const section = document.createElement('div');
            section.className = 'exam-section';
            
            section.innerHTML = `
                <h3>${insegnamento}</h3>
                <div class="sessions-grid">
                    <div class="session-card">
                        <h4>Sessione Anticipata (Gen/Feb ${planningYear})</h4>
                        <p>${sessioni.Anticipata || 0}/3 esami</p>
                    </div>
                    <div class="session-card">
                        <h4>Pausa Didattica (Mar/Apr ${planningYear})</h4>
                        <p>${sessioni['Pausa Didattica Primavera'] || 0}/1 esami</p>
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
                        <p>${sessioni['Pausa Didattica Autunno'] || 0}/1 esami</p>
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
    .catch(error => console.error("Errore nel caricamento degli esami:", error));
}
