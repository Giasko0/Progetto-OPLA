document.addEventListener('DOMContentLoaded', function() {
    // Controlla gli esami minimi all'avvio della pagina
    checkEsamiMinimi();

    // Funzione per verificare gli esami minimi
    function checkEsamiMinimi() {
        fetch('/api/checkEsamiMinimi')
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
                // Usa showAlert invece di showNotification per gli errori di esami minimi
                if (window.showAlert) {
                    window.showAlert('Errore nel recupero degli esami minimi. Riprova più tardi.', 'Errore di sistema');
                }
            });
    }

    // Questa funzione sarà sovrascritta da sidebar.js per mostrare l'avviso nella sidebar
    // Manteniamo questa implementazione come fallback
    function mostrareBannerAvviso(insegnamenti) {
        const banner = document.getElementById('banner-esami-minimi');
        if (!banner) return;

        // Aggiorna il testo del banner con intestazione
        const messaggioElement = banner.querySelector('.banner-messaggio');
        messaggioElement.innerHTML = `<small>Insegnamenti con meno di 8 esami inseriti:</small>`;
        
        // Crea una lista HTML per gli insegnamenti
        const listaElement = document.createElement('ul');
        listaElement.style.marginTop = '5px';
        listaElement.style.marginBottom = '5px';
        listaElement.style.paddingLeft = '20px';
        
        // Aggiungi ogni insegnamento come elemento della lista
        insegnamenti.forEach(ins => {
            const itemElement = document.createElement('li');
            itemElement.textContent = `${ins.titolo}: ${ins.esami_inseriti}/8`;
            itemElement.style.fontSize = '0.9em';
            listaElement.appendChild(itemElement);
        });
        
        // Aggiungi la lista al messaggio
        messaggioElement.appendChild(listaElement);

        // Mostra il banner
        banner.classList.remove('hidden');
    }
    
    // Esporta la funzione per renderla accessibile da sidebar.js
    window.mostrareBannerAvviso = mostrareBannerAvviso;
    window.checkEsamiMinimi = checkEsamiMinimi;

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
