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
    
    // Gestisci la pagina index se siamo su di essa
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (currentPage === "index.html" || currentPage === "") {
      handleIndexCTA();
    }

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
  
  window.preloadUserDataPromise = fetch("/api/get-user-data")
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
    // Reindirizza sempre al SAML, l'utente verrà poi portato alla index
    window.location.href = "/saml/login";
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

  const response = await fetch("/api/get-user-data", {
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
      const titolo = document.querySelector(".titolo");
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

// Gestione pagina di login
function handleLoginPage() {
  // Verifica se l'utente è già autenticato
  getUserData().then((data) => {
    if (data.authenticated) {
      // Se già autenticato, reindirizza alla home
      window.location.href = "index.html";
    }
  });

  // Gestione degli eventi del form di login se necessario
  const loginForm = document.querySelector("form");
  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      // Invalida la cache quando facciamo un nuovo login
      clearAuthCache();
    });
  }
}

// Gestione pulsanti CTA per la pagina index
function handleIndexCTA() {
  const loginMessage = document.getElementById("login-message");
  const buttonsContainer = document.getElementById("auth-buttons");
  const ctaButton = document.querySelector(".cta-button");

  // Controlla lo stato di autenticazione dell'utente
  getUserData()
    .then((data) => {
      if (data && data.authenticated) {
        // Se l'utente è già autenticato, mostra i pulsanti e nascondi il messaggio di login
        if (loginMessage) loginMessage.style.display = "none";
        if (buttonsContainer) buttonsContainer.style.display = "flex";
      } else {
        // Se l'utente non è autenticato, mostra il messaggio di login e nascondi i pulsanti
        if (loginMessage) loginMessage.style.display = "block";
        if (buttonsContainer) buttonsContainer.style.display = "none";

        // Configura il pulsante per andare al login
        if (ctaButton) {
          ctaButton.href = "/saml/login";
          ctaButton.textContent = "Accedi ora";
        }
      }
    })
    .catch((error) => {
      console.error("Errore nel controllo dell'autenticazione:", error);
      // In caso di errore, impostare il comportamento predefinito
      if (loginMessage) loginMessage.style.display = "block";
      if (buttonsContainer) buttonsContainer.style.display = "none";
      if (ctaButton) {
        ctaButton.href = "/saml/login";
      }
    });
}

// Esponi funzioni globalmente
window.getUserData = getUserData;
window.updatePageTitle = updatePageTitle;
window.preloadUserData = preloadUserData;
window.checkUserPermissions = checkUserPermissions;
window.clearAuthCache = clearAuthCache;
window.handleLoginPage = handleLoginPage;
window.handleIndexCTA = handleIndexCTA;
