// Gestione della sidebar per avvisi e notifiche
document.addEventListener("DOMContentLoaded", function () {
  // Riferimenti agli elementi DOM
  const sidebar = document.getElementById("messageSidebar");
  const content = document.querySelector(".content");
  const contentSidebar = document.querySelector(".content-sidebar");
  const toggleBtn = document.getElementById("toggleSidebarFloat");
  const toggleBtnIcon = toggleBtn.querySelector(".material-symbols-outlined");
  const closeBtn = document.getElementById("closeSidebar");
  const notificationBadge = document.getElementById("notificationBadge");

  // Contatori per avvisi e notifiche
  let alertCount = 0;
  let notificationCount = 0;

  // Inizializzazione
  initSidebar();

  // Inizializza la sidebar e configura gli event listener
  function initSidebar() {
    if (!sidebar || !toggleBtn || !closeBtn || !contentSidebar) return;

    // Imposta lo stato iniziale (chiusa)
    contentSidebar.classList.remove("sidebar-visible");
    toggleBtnIcon.textContent = "keyboard_double_arrow_left";

    // Gestori apertura/chiusura sidebar
    toggleBtn.addEventListener("click", toggleSidebar);
    closeBtn.addEventListener("click", closeSidebar);

    // Gestore chiusura elementi e collassabili
    document.addEventListener("click", handleCloseClicks);
    document.addEventListener("click", handleCollapseClicks);

    // Esponi funzioni a livello globale
    window.showMessage = showMessage;
    window.clearNotifications = () =>
      clearContainer("notificationsContainer", true);
    window.clearAlerts = () => clearContainer("alertsContainer", false);
    window.toggleSidebar = toggleSidebar;
    window.closeSidebar = closeSidebar;
  }

  // Aggiorna il badge di notifiche
  function updateBadge() {
    const total = alertCount + notificationCount;
    notificationBadge.textContent = total > 99 ? "99+" : total;
    notificationBadge.classList.toggle("has-notifications", total > 0);
  }

  // Apre/chiude la sidebar
  function toggleSidebar() {
    const isVisible = contentSidebar.classList.contains("sidebar-visible");

    if (isVisible) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // Apre la sidebar
  function openSidebar() {
    contentSidebar.classList.add("sidebar-visible");
    content.classList.add("sidebar-visible");
    // Cambia l'icona a doppia freccia verso destra quando la sidebar è aperta
    toggleBtnIcon.textContent = "keyboard_double_arrow_right";
  }

  // Chiude la sidebar
  function closeSidebar() {
    contentSidebar.classList.remove("sidebar-visible");
    content.classList.remove("sidebar-visible");
    // Cambia l'icona a doppia freccia verso sinistra quando la sidebar è chiusa
    toggleBtnIcon.textContent = "keyboard_double_arrow_left";
  }

  // Gestisce i click sui pulsanti di chiusura
  function handleCloseClicks(e) {
    // Chiusura avvisi
    if (e.target.classList.contains("alert-close")) {
      const item = e.target.closest(".alert-item");
      if (item) removeItem(item, false);
    }
    // Chiusura notifiche
    else if (e.target.classList.contains("notification-close")) {
      const item = e.target.closest(".notification-item");
      if (item) removeItem(item, true);
    }
  }

  // Gestisce i click sui pulsanti di collasso
  function handleCollapseClicks(e) {
    if (e.target.classList.contains("collapse-toggle") || e.target.closest(".collapse-toggle")) {
      const toggleElement = e.target.classList.contains("collapse-toggle") 
        ? e.target 
        : e.target.closest(".collapse-toggle");
      
      const content = toggleElement.nextElementSibling;
      const icon = toggleElement.querySelector(".collapse-icon");
      
      if (content && content.classList.contains("collapse-content")) {
        const isExpanded = content.classList.contains("expanded");
        
        if (isExpanded) {
          // Chiudi
          content.style.maxHeight = "0px";
          content.classList.remove("expanded");
          if (icon) {
            icon.textContent = "keyboard_arrow_right";
          }
        } else {
          // Apri - calcola l'altezza del contenuto
          content.style.maxHeight = content.scrollHeight + "px";
          content.classList.add("expanded");
          if (icon) {
            icon.textContent = "keyboard_arrow_down";
          }
        }
      }
    }
  }

  // Rimuove un elemento dalla sidebar
  function removeItem(item, isNotification) {
    item.remove();

    if (isNotification) {
      notificationCount = Math.max(0, notificationCount - 1);
    } else {
      alertCount = Math.max(0, alertCount - 1);
    }

    updateBadge();
  }

  // Pulisce un container
  function clearContainer(containerId, isNotification) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = "";

      if (isNotification) {
        notificationCount = 0;
      } else {
        alertCount = 0;
      }

      updateBadge();
    }
  }

  // Verifica se siamo in modalità mobile/responsive
  function isMobileView() {
    return window.innerWidth <= 768;
  }

  // Mostra un messaggio nella sidebar
  // Gli argomenti sono messaggio, titolo, tipo e opzioni (se è html e tempo di timeout)
  function showMessage(
    message,
    title = "",
    type = "notification",
    options = {}
  ) {
    // Determina il timeout di default in base al tipo
    let defaultTimeout = 0;
    switch (type) {
      case "notification":
      case "success":
        defaultTimeout = 10000; // 10 secondi per blu e verde
        break;
      case "error":
      case "warning":
        defaultTimeout = 30000; // 30 secondi per rosso e arancione
        break;
      case "info":
        defaultTimeout = 0; // Nessuna scadenza per info
        break;
    }

    const defaultOptions = {
      html: false,
      timeout: defaultTimeout,
    };

    const settings = { ...defaultOptions, ...options };

    // Determina il container e la classe in base al tipo
    let containerId, itemClass, isNotification, borderColor, pulseColor, pulseColorRgb;

    switch (type) {
      case "error":
        containerId = "notificationsContainer";
        itemClass = "alert-item";
        isNotification = false;
        borderColor = "var(--color-error)";
        pulseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-error');
        pulseColorRgb = "193,34,53";
        break;
      case "warning":
        containerId = "notificationsContainer";
        itemClass = "alert-item";
        isNotification = false;
        borderColor = "var(--color-warning)";
        pulseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-warning');
        pulseColorRgb = "255,167,38";
        break;
      case "success":
        containerId = "notificationsContainer";
        itemClass = "notification-item";
        isNotification = true;
        borderColor = "var(--color-success)";
        pulseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-success');
        pulseColorRgb = "76,175,80";
        break;
      case "info":
        containerId = "alertsContainer";
        itemClass = "alert-item";
        isNotification = false;
        borderColor = "var(--color-info)";
        pulseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-info');
        pulseColorRgb = "39,52,139";
        break;
      case "notification":
      default:
        containerId = "notificationsContainer";
        itemClass = "notification-item";
        isNotification = true;
        borderColor = "var(--color-blue)";
        pulseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-blue');
        pulseColorRgb = "39,52,139";
        break;
    }

    // Ottieni il container
    const container = document.getElementById(containerId);
    if (!container) return null;

    // Crea l'elemento
    const item = document.createElement("div");
    item.className = itemClass;
    item.style.borderLeftColor = borderColor;
    item.style.setProperty('--color-pulse', pulseColor);
    item.style.setProperty('--color-pulse-rgb', pulseColorRgb);

    // Crea contenuto
    let content = "";
    if (title) content += `<strong>${title}</strong><br>`;
    content += settings.html ? message : `<p>${message}</p>`;
    content += `<span class="${
      isNotification ? "notification" : "alert"
    }-close material-symbols-outlined" aria-label="Chiudi">close</span>`;
    item.innerHTML = content;

    // Inserisci in alto (nuovi messaggi in cima)
    if (container.firstChild) {
      container.insertBefore(item, container.firstChild);
    } else {
      container.appendChild(item);
    }

    // Applica animazione pulse-once
    item.classList.add("pulse-once");
    item.addEventListener("animationend", function handler(e) {
      if (e.animationName === "pulseBg") {
        item.classList.remove("pulse-once");
        item.removeEventListener("animationend", handler);
      }
    });

    // Aggiorna conteggio
    if (isNotification) {
      notificationCount++;
    } else {
      alertCount++;
    }

    // Limite massimo 10 tra notification-item e alert-item nel notificationsContainer
    if (containerId === "notificationsContainer") {
      const allItems = container.querySelectorAll(".notification-item, .alert-item");
      if (allItems.length > 10) {
        const last = allItems[allItems.length - 1];
        if (last) {
          // Determina se è una notifica o alert per aggiornare il conteggio
          const isNotif = last.classList.contains("notification-item");
          removeItem(last, isNotif);
        }
      }
    }

    updateBadge();

    // Apri sidebar su desktop
    // e se il form esame non è stato appena chiuso
    if (!isMobileView() && !window.formJustClosed) {
      openSidebar();
    }

    // Aggiungi timeout e barra di progresso per messaggi con timeout > 0
    if (settings.timeout > 0) {
      const progressBar = document.createElement("div");
      progressBar.className = "notification-progress";
      progressBar.style.backgroundColor = borderColor;
      progressBar.style.animation = `shrinkWidth ${settings.timeout / 1000}s linear forwards`;
      
      item.appendChild(progressBar);

      setTimeout(() => {
        if (item.parentNode) {
          item.classList.add("fading");
          item.addEventListener("animationend", () => {
            if (item.parentNode) {
              removeItem(item, isNotification);
            }
          });
        }
      }, settings.timeout);
    }

    return item;
  }
});
