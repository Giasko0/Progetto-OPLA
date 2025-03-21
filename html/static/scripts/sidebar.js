/**
 * Gestione semplificata della sidebar per avvisi e notifiche
 */
document.addEventListener('DOMContentLoaded', function() {
  // Riferimenti agli elementi DOM
  const sidebar = document.getElementById('messageSidebar');
  const content = document.querySelector('.content');
  const toggleBtn = document.getElementById('toggleSidebarFloat');
  const closeBtn = document.getElementById('closeSidebar');
  const notificationBadge = document.getElementById('notificationBadge');

  // Contatori per avvisi e notifiche
  let alertCount = 0;
  let notificationCount = 0;

  // Inizializzazione
  initSidebar();

  /**
   * Inizializza la sidebar e configura gli event listener
   */
  function initSidebar() {
    if (!sidebar || !toggleBtn || !closeBtn) return;

    // Gestori apertura/chiusura sidebar
    toggleBtn.addEventListener('click', toggleSidebar);
    closeBtn.addEventListener('click', closeSidebar);

    // Gestore chiusura elementi
    document.addEventListener('click', handleCloseClicks);

    // Gestore chiusura su click esterno
    document.addEventListener('click', handleOutsideClicks);

    // Sposta gli avvisi di esami minimi nella sidebar
    setupEsamiMinimi();

    // Esponi funzioni a livello globale
    window.showAlert = showAlert;
    window.showNotification = showNotification;
    window.clearNotifications = () => clearContainer('notificationsContainer', true);
    window.clearAlerts = () => clearContainer('alertsContainer', false);
    window.toggleSidebar = toggleSidebar;
  }

  /**
   * Aggiorna il badge di notifiche
   */
  function updateBadge() {
    const total = alertCount + notificationCount;
    notificationBadge.textContent = total > 99 ? '99+' : total;
    notificationBadge.classList.toggle('has-notifications', total > 0);
  }

  /**
   * Apre/chiude la sidebar
   */
  function toggleSidebar() {
    const isVisible = sidebar.classList.contains('visible');
    
    if (isVisible) {
      closeSidebar();
    } else {
      openSidebar();
      // Reset notifiche quando si apre
      notificationCount = 0;
      updateBadge();
    }
  }

  /**
   * Apre la sidebar
   */
  function openSidebar() {
    sidebar.classList.add('visible');
    content.classList.add('sidebar-visible');
    toggleBtn.classList.add('sidebar-open');
  }

  /**
   * Chiude la sidebar
   */
  function closeSidebar() {
    sidebar.classList.remove('visible');
    content.classList.remove('sidebar-visible');
    toggleBtn.classList.remove('sidebar-open');
  }

  /**
   * Gestisce i click per chiudere avvisi e notifiche
   */
  function handleCloseClicks(e) {
    // Chiusura avvisi
    if (e.target.classList.contains('alert-close')) {
      const item = e.target.closest('.alert-item');
      if (item) removeItem(item, false);
    } 
    // Chiusura notifiche
    else if (e.target.classList.contains('notification-close')) {
      const item = e.target.closest('.notification-item');
      if (item) removeItem(item, true);
    }
  }

  /**
   * Gestisce i click fuori dalla sidebar per chiuderla
   */
  function handleOutsideClicks(e) {
    if (
      sidebar.classList.contains('visible') && 
      !sidebar.contains(e.target) && 
      !toggleBtn.contains(e.target)
    ) {
      closeSidebar();
    }
  }

  /**
   * Rimuove un elemento dalla sidebar
   * @param {HTMLElement} item - Elemento da rimuovere
   * @param {boolean} isNotification - True se è una notifica, false se è un avviso
   */
  function removeItem(item, isNotification) {
    item.remove();
    
    if (isNotification) {
      notificationCount = Math.max(0, notificationCount - 1);
    } else {
      alertCount = Math.max(0, alertCount - 1);
    }
    
    updateBadge();
  }

  /**
   * Pulisce un container
   * @param {string} containerId - ID del container
   * @param {boolean} isNotification - True se sono notifiche, false se sono avvisi
   */
  function clearContainer(containerId, isNotification) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
      
      if (isNotification) {
        notificationCount = 0;
      } else {
        alertCount = 0;
      }
      
      updateBadge();
    }
  }

  /**
   * Mostra un avviso nella sidebar
   * @param {string} message - Messaggio
   * @param {string} title - Titolo (opzionale)
   * @param {boolean} html - Se true, il contenuto è HTML
   * @returns {HTMLElement} L'elemento creato
   */
  function showAlert(message, title = '', html = false) {
    return addMessage('alertsContainer', message, title, html, false);
  }

  /**
   * Mostra una notifica temporanea nella sidebar
   * @param {string} message - Messaggio
   * @param {string} title - Titolo (opzionale)
   * @param {number} timeout - Tempo in ms prima che scompaia
   * @returns {HTMLElement} L'elemento creato
   */
  function showNotification(message, title = '', timeout = 5000) {
    const item = addMessage('notificationsContainer', message, title, false, true);
    
    if (!item) return null;
    
    // Aggiungi barra di progresso
    const progressBar = document.createElement('div');
    progressBar.className = 'notification-progress';
    
    if (timeout > 0) {
      progressBar.style.animation = `shrinkWidth ${timeout/1000}s linear forwards`;
    }
    
    item.appendChild(progressBar);
    
    // Rimuovi dopo timeout
    if (timeout > 0) {
      setTimeout(() => {
        if (item.parentNode) {
          item.classList.add('fading');
          item.addEventListener('animationend', () => {
            if (item.parentNode) {
              removeItem(item, true);
            }
          });
        }
      }, timeout);
    }
    
    return item;
  }

  /**
   * Aggiunge un messaggio alla sidebar
   * @param {string} containerId - ID del container
   * @param {string} message - Messaggio da mostrare
   * @param {string} title - Titolo (opzionale)
   * @param {boolean} html - Se true, il contenuto è HTML
   * @param {boolean} isNotification - True se è una notifica, false se è un avviso
   * @returns {HTMLElement} L'elemento creato
   */
  function addMessage(containerId, message, title, html, isNotification) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const item = document.createElement('div');
    item.className = isNotification ? 'notification-item' : 'alert-item';

    // Crea contenuto
    let content = '';
    if (title) content += `<strong>${title}</strong><br>`;
    content += html ? message : `<p>${message}</p>`;
    content += `<span class="${isNotification ? 'notification' : 'alert'}-close material-symbols-outlined" aria-label="Chiudi">close</span>`;
    item.innerHTML = content;

    // Aggiungi al container
    container.appendChild(item);

    // Aggiorna conteggio
    if (isNotification) {
      notificationCount++;
    } else {
      alertCount++;
    }
    updateBadge();

    // Apri sidebar
    openSidebar();

    return item;
  }

  /**
   * Configura la gestione degli esami minimi
   */
  function setupEsamiMinimi() {
    if (window.checkEsamiMinimi) {
      // Sovrascrivi la funzione di visualizzazione degli avvisi
      window.mostrareBannerAvviso = function(insegnamenti) {
        if (!insegnamenti || insegnamenti.length === 0) return;

        // Crea contenuto formattato per gli insegnamenti
        let content = `<strong>Insegnamenti con meno di 8 esami:</strong><ul style="margin-top:8px;margin-bottom:8px;padding-left:20px;">`;
        insegnamenti.forEach(ins => {
          content += `<li style="font-size:0.9em;margin-bottom:4px;">${ins.titolo}: ${ins.esami_inseriti}/8</li>`;
        });
        content += `</ul>`;
        
        // Mostra come avviso nella sidebar
        showAlert(content, "", true);
      };
    }

    // Nascondi il banner originale
    const banner = document.getElementById('banner-esami-minimi');
    if (banner) {
      banner.classList.add('hidden');
      banner.style.display = 'none';
    }
  }
});
