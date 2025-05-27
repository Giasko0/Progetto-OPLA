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

    // Gestore chiusura elementi
    document.addEventListener("click", handleCloseClicks);

    // Esponi funzioni a livello globale
    window.showMessage = showMessage;
    window.clearNotifications = () =>
      clearContainer("notificationsContainer", true);
    window.clearAlerts = () => clearContainer("alertsContainer", false);
    window.toggleSidebar = toggleSidebar;
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

  // Mostra un messaggio nella sidebar
  // Gli argomenti sono messaggio, titolo, tipo e opzioni (se è html e tempo di timeout)
  function showMessage(
    message,
    title = "",
    type = "notification",
    options = {}
  ) {
    const defaultOptions = {
      html: false,
      timeout: type === "notification" ? 5000 : 0,
    };

    const settings = { ...defaultOptions, ...options };

    // Determina il container e la classe in base al tipo
    let containerId, itemClass, isNotification, borderColor;

    switch (type) {
      case "error":
        containerId = "alertsContainer";
        itemClass = "alert-item";
        isNotification = false;
        borderColor = "var(--color-error)";
        break;
      case "warning":
        containerId = "alertsContainer";
        itemClass = "alert-item";
        isNotification = false;
        borderColor = "var(--color-warning)";
        break;
      case "notification":
      default:
        containerId = "notificationsContainer";
        itemClass = "notification-item";
        isNotification = true;
        borderColor = "var(--color-blue)";
        break;
    }

    // Ottieni il container
    const container = document.getElementById(containerId);
    if (!container) return null;

    // Crea l'elemento
    const item = document.createElement("div");
    item.className = itemClass;
    item.style.borderLeftColor = borderColor;

    // Crea contenuto
    let content = "";
    if (title) content += `<strong>${title}</strong><br>`;
    content += settings.html ? message : `<p>${message}</p>`;
    content += `<span class="${
      isNotification ? "notification" : "alert"
    }-close material-symbols-outlined" aria-label="Chiudi">close</span>`;
    item.innerHTML = content;

    container.appendChild(item);

    // Aggiorna conteggio
    if (isNotification) {
      notificationCount++;
    } else {
      alertCount++;
    }
    updateBadge();

    openSidebar();

    // Per le notifiche, aggiungi la barra di progresso e timeout
    if (isNotification && settings.timeout > 0) {
      const progressBar = document.createElement("div");
      progressBar.className = "notification-progress";
      progressBar.style.animation = `shrinkWidth ${
        settings.timeout / 1000
      }s linear forwards`;
      item.appendChild(progressBar);

      // Rimuovi dopo timeout
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
