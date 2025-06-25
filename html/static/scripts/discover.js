// Script per gestire la sezione "Scopri OPLÀ"
document.addEventListener('DOMContentLoaded', function() {
    // Gestione della sezione collassabile
    const discoverHeader = document.querySelector('.discover-header');
    const discoverContent = document.querySelector('.discover-content');
    const discoverToggle = document.querySelector('.discover-toggle');
    
    if (discoverHeader && discoverContent && discoverToggle) {
        discoverHeader.addEventListener('click', function() {
            discoverContent.classList.toggle('expanded');
            discoverToggle.classList.toggle('collapsed');
        });
    }
    
    // Gestione del modal video
    const videoModal = document.getElementById('videoModal');
    const videoItems = document.querySelectorAll('.video-item');
    const modalVideo = document.getElementById('modalVideo');
    const modalTitle = document.getElementById('modalTitle');
    const closeModal = document.querySelector('.video-modal-close');
    
    // Apri modal quando si clicca su un video
    videoItems.forEach(item => {
        item.addEventListener('click', function() {
            const videoSrc = this.dataset.video;
            const videoTitle = this.dataset.title;
            
            modalVideo.src = videoSrc;
            modalTitle.textContent = videoTitle;
            videoModal.style.display = 'flex';
        });
    });
    
    // Chiudi modal
    if (closeModal) {
        closeModal.addEventListener('click', closeVideoModal);
    }
    
    // Chiudi modal cliccando fuori
    if (videoModal) {
        videoModal.addEventListener('click', function(e) {
            if (e.target === videoModal) {
                closeVideoModal();
            }
        });
    }
    
    // Chiudi modal con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && videoModal && videoModal.style.display === 'flex') {
            closeVideoModal();
        }
    });
    
    function closeVideoModal() {
        videoModal.style.display = 'none';
        modalVideo.pause();
        modalVideo.src = '';
    }
});