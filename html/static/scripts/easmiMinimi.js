document.addEventListener('DOMContentLoaded', function() {
    // Controlla gli esami minimi all'avvio della pagina
    checkEsamiMinimi();

    // Funzione per verificare gli esami minimi
    function checkEsamiMinimi() {
        fetch('/api/esamiMinimi')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Errore nella richiesta API');
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success' && data.insegnamenti_sotto_minimo.length > 0) {
                    // Ci sono insegnamenti sotto il minimo
                    mostrareBannerAvviso(data.insegnamenti_sotto_minimo);
                }
            })
            .catch(error => {
                console.error('Errore nel recupero degli esami minimi:', error);
            });
    }

    // Funzione per mostrare il banner di avviso
    function mostrareBannerAvviso(insegnamenti) {
        const banner = document.getElementById('banner-esami-minimi');
        if (!banner) return;

        // Aggiorna il testo del banner con intestazione
        const messaggioElement = banner.querySelector('.banner-messaggio');
        messaggioElement.innerHTML = `Attenzione, non è stato inserito il numero minimo di esami per gli insegnamenti:`;
        
        // Crea una lista HTML per gli insegnamenti
        const listaElement = document.createElement('ul');
        listaElement.style.marginTop = '10px';
        listaElement.style.paddingLeft = '20px';
        
        // Aggiungi ogni insegnamento come elemento della lista
        insegnamenti.forEach(ins => {
            const itemElement = document.createElement('li');
            itemElement.textContent = `${ins.titolo} (${ins.codice}): ${ins.esami_inseriti}/8 esami inseriti`;
            listaElement.appendChild(itemElement);
        });
        
        // Aggiungi la lista al messaggio
        messaggioElement.appendChild(listaElement);

        // Mostra il banner
        banner.classList.remove('hidden');
    }

    // Aggiungi listener per il pulsante di chiusura del banner
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('banner-close')) {
            const banner = document.getElementById('banner-esami-minimi');
            if (banner) {
                banner.classList.add('hidden');
            }
        }
    });
});
