/**
 * Gestione del caricamento file (per la pagina fileUpload.html)
 */
function initFileUploadHandlers() {
    // Gestisci il form di upload U-GOV
    document.getElementById('uploadForm')?.addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(this);
        const fileInput = this.querySelector('input[type="file"]');

        if (!fileInput.files[0]) {
            showMessage('error', 'Seleziona un file da caricare');
            return;
        }

        fetch(this.action, {
            method: 'POST',
            body: formData
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    showMessage('success', data.message);
                    this.reset();
                } else {
                    showMessage('error', data.message);
                }
            })
            .catch(error => {
                console.error('Errore:', error);
                showMessage('error', `Si è verificato un errore durante l'import: ${error.message}`);
            });
    });

    // Funzione per mostrare messaggi
    function showMessage(type, message) {
        const messageDiv = document.getElementById('responseMessages');
        if (!messageDiv) return;
        
        const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';

        const alert = document.createElement('div');
        alert.className = `alert ${alertClass}`;
        alert.textContent = message;

        messageDiv.appendChild(alert);

        // Rimuovi il messaggio dopo 5 secondi
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
}

/**
 * Gestione del download file (per la pagina fileDownload.html)
 */
function initFileDownloadHandlers() {
    const downloadButton = document.getElementById('downloadButton');
    if (downloadButton) {
        downloadButton.addEventListener('click', function() {
            window.location.href = '/api/oh-issa/downloadFileESSE3';
        });
    }

    const downloadEasyAcademyButton = document.getElementById('downloadEasyAcademyButton');
    if (downloadEasyAcademyButton) {
        downloadEasyAcademyButton.addEventListener('click', function() {
            window.location.href = '/api/oh-issa/downloadFileEasyAcademy';
        });
    }
}

// Inizializza gli handler quando il DOM è pronto
document.addEventListener('DOMContentLoaded', function() {
    // Inizializza gli handler per il caricamento file
    initFileUploadHandlers();
    
    // Inizializza gli handler per il download file
    initFileDownloadHandlers();
});
