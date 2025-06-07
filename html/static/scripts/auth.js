// Cache per i dati dell'utente
let authCache = {
  data: null,
  timestamp: null,
  expiresIn: 5 * 60 * 1000, // 5 minuti in millisecondi
};

// Stato globale dell'utente
let currentUserData = null;

document.addEventListener("DOMContentLoaded", async function () {
  try {
    // Precarica i dati utente una sola volta
    currentUserData = await preloadUserData();
    
    // Esegui tutte le operazioni di inizializzazione con i dati già caricati
    await checkAuthAndRedirect();
    updateUIByAuth(currentUserData);
    updatePageTitle(currentUserData);

    // Configura logout
    const logoutLinks = document.querySelectorAll('a[href="/api/logout"]');
    logoutLinks.forEach((link) => {
      link.addEventListener("click", clearAuthCache);
    });
  } catch (error) {
    console.error("Errore nell'inizializzazione:", error);
  }
});

// Carica i dati dell'utente una sola volta all'avvio
async function preloadUserData() {
  if (window.preloadUserDataPromise) {
    return window.preloadUserDataPromise;
  }
  
  window.preloadUserDataPromise = fetch("/api/get_user_data")
    .then((response) => response.json())
    .then((data) => {
      authCache.data = data;
      authCache.timestamp = new Date().getTime();
      return data;
    })
    .catch((error) => {
      console.error("Errore nel precaricamento dei dati utente:", error);
      return { authenticated: false, user_data: null };
    });
  
  return window.preloadUserDataPromise;
}

// Controlla autenticazione usando i dati in cache
async function checkAuthAndRedirect() {
  const currentPage = window.location.pathname.split("/").pop();

  if (currentPage === "index.html" || currentPage === "" || currentPage === "login.html") {
    return;
  }

  const data = await getUserData();
  if (!data || !data.authenticated) {
    const currentURL = encodeURIComponent(window.location.pathname);
    window.location.href = `login.html?redirect=${currentURL}`;
  }
}

// Ottiene i dati dell'utente dalla cache o dal server
async function getUserData() {
  const now = new Date().getTime();

  if (currentUserData) {
    return currentUserData;
  }

  if (authCache.data && authCache.timestamp && now - authCache.timestamp < authCache.expiresIn) {
    return authCache.data;
  }
  
  if (window.preloadUserDataPromise) {
    return window.preloadUserDataPromise;
  }

  const response = await fetch("/api/get_user_data", {
    credentials: 'include'
  });
  const data = await response.json();
  
  authCache.data = data;
  authCache.timestamp = now;
  currentUserData = data;
  
  return data;
}

// Imposta username usando i dati in cache
function setUsernameField(fieldId) {
  if (currentUserData?.authenticated && currentUserData?.user_data) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = currentUserData.user_data.username;
    }
    return;
  }

  getUserData().then(data => {
    if (data?.authenticated && data?.user_data) {
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = data.user_data.username;
      }
    }
  });
}

// Aggiorna UI usando i dati in cache
function updateUIByAuth(data = null) {
  const updateUI = (userData) => {
    const isAuthenticated = userData?.authenticated && userData?.user_data;
    const username = isAuthenticated ? userData.user_data.username : null;

    document.querySelectorAll("[data-auth]").forEach((el) => {
      if ((el.dataset.auth === "authenticated" && isAuthenticated) ||
          (el.dataset.auth === "unauthenticated" && !isAuthenticated)) {
        el.style.display = "";
      } else {
        el.style.display = "none";
      }
    });

    document.querySelectorAll("[data-username]").forEach((el) => {
      if (isAuthenticated) {
        el.textContent = username;
      }
    });
  };

  if (data) {
    updateUI(data);
  } else {
    getUserData().then(updateUI);
  }
}

// Utility per capitalizzazione
function capitalizeWords(text) {
  if (!text) return '';
  return text.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Aggiorna titolo pagina usando i dati in cache
function updatePageTitle(data = null) {
  const updateTitle = (userData) => {
    if (userData?.authenticated && userData?.user_data) {
      const titolo = document.querySelector(".titolo, .title-primary");
      if (titolo && userData.user_data) {
        const currentPage = window.location.pathname.split("/").pop() || 
                          (window.location.pathname.endsWith('/') ? 'index.html' : '');

        let nomeFormattato = userData.user_data.username;

        if (userData.user_data.nome && userData.user_data.cognome) {
          const nome = capitalizeWords(userData.user_data.nome);
          const cognome = capitalizeWords(userData.user_data.cognome);
          nomeFormattato = `${nome} ${cognome}`;
        }

        if (currentPage === "mieiEsami.html") {
          titolo.textContent = userData.user_data.nome && userData.user_data.cognome ? 
            `Esami di ${nomeFormattato}` : "I miei esami";
        } else if (currentPage === "calendario.html") {
          titolo.textContent = `Benvenuto/a, ${nomeFormattato}!`;
        }
      }
    }
  };

  if (data) {
    updateTitle(data);
  } else {
    getUserData().then(updateTitle);
  }
}

// Pulisci cache
function clearAuthCache() {
  authCache.data = null;
  authCache.timestamp = null;
  currentUserData = null;
  window.preloadUserDataPromise = null;
}

// Gestione permessi utente
async function checkUserPermissions() {
  const data = await getUserData();
  return {
    isAuthenticated: data.authenticated,
    isAdmin: data.authenticated && data.user_data?.permessi_admin,
    username: data.user_data?.username
  };
}

// Esponi funzioni globalmente
window.getUserData = getUserData;
window.updatePageTitle = updatePageTitle;
window.preloadUserData = preloadUserData;
window.checkUserPermissions = checkUserPermissions;
