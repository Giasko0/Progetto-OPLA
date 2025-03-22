// Inizializzazione al caricamento della pagina
document.addEventListener('DOMContentLoaded', function() {
  // Controlla autenticazione e gestisce reindirizzamenti
  checkAuthAndRedirect();
  
  // Configura i link di logout per pulire la cache
  const logoutLinks = document.querySelectorAll('a[href="/api/logout"]');
  logoutLinks.forEach(link => {
    link.addEventListener('click', clearAuthCache);
  });
  
  // Aggiorna elementi UI basati sull'autenticazione
  updateUIByAuth();
});

// Controlla autenticazione e reindirizza se necessario
function checkAuthAndRedirect() {
  const currentPage = window.location.pathname.split('/').pop();
  
  // Escludi pagine pubbliche dal controllo di autenticazione
  if (currentPage === 'index.html' || currentPage === '' || currentPage === 'login.html') {
    return;
  }

  getUserData().then(data => {
    if (!data || !data.authenticated) {
      // Se non autenticato, reindirizza alla pagina di login con la pagina corrente come destinazione dopo il login
      const currentURL = encodeURIComponent(window.location.pathname);
      window.location.href = `login.html?redirect=${currentURL}`;
    }
  }).catch(error => {
    console.error('Errore nel controllo dell\'autenticazione:', error);
    window.location.href = 'login.html';
  });
}

// Cache per i dati dell'utente
let authCache = {
  data: null,
  timestamp: null,
  expiresIn: 5 * 60 * 1000 // 5 minuti in millisecondi
};

// Recupera un cookie per nome
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Ottiene i dati dell'utente con sistema di cache
function getUserData() {
  const now = new Date().getTime();
  
  if (authCache.data && authCache.timestamp && (now - authCache.timestamp < authCache.expiresIn)) {
    return Promise.resolve(authCache.data);
  }

  return fetch('/api/check-auth')
    .then(response => response.json())
    .then(data => {
      authCache.data = data;
      authCache.timestamp = new Date().getTime();
      return data;
    })
    .catch(error => {
      console.error('Errore nel recupero dei dati utente:', error);
      return { authenticated: false, user_data: null };
    });
}

// Imposta il valore dell'username in un campo di input
function setUsernameField(fieldId) {
  getUserData().then(data => {
    if (data && data.authenticated && data.user_data) {
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = data.user_data.username;
      }
    }
  }).catch(error => {
    console.error('Errore nel recupero dei dati utente:', error);
  });
}

// Aggiorna interfaccia in base all'autenticazione
function updateUIByAuth() {
  getUserData().then(data => {
    const isAuthenticated = data && data.authenticated && data.user_data;
    const username = isAuthenticated ? data.user_data.username : null;
    
    const authElements = document.querySelectorAll('[data-auth]');
    authElements.forEach(el => {
      if ((el.dataset.auth === 'authenticated' && isAuthenticated) || 
          (el.dataset.auth === 'unauthenticated' && !isAuthenticated)) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
    
    const usernameElements = document.querySelectorAll('[data-username]');
    usernameElements.forEach(el => {
      if (isAuthenticated) {
        el.textContent = username;
      }
    });
  }).catch(error => {
    console.error('Errore nel recupero dei dati utente:', error);
  });
}

// Invalida la cache
function clearAuthCache() {
  authCache.data = null;
  authCache.timestamp = null;
}

// Aggiorna i titoli delle pagine con le informazioni dell'utente (funzione centralizzata)
function updatePageTitle() {
  getUserData().then(data => {
    if (data && data.authenticated && data.user_data) {
      const userData = data.user_data;
      
      // Aggiorna il titolo della pagina con il nome dell'utente
      const titolo = document.querySelector('.titolo, .title-primary');
      if (titolo && userData) {
        const currentPage = window.location.pathname.split('/').pop();
        
        if (currentPage === 'mieiEsami.html') {
          titolo.textContent = `Esami di ${userData.nome || ''} ${userData.cognome || ''}`.trim();
          if (!userData.nome && !userData.cognome) {
            titolo.textContent = `I miei esami`;
          }
        } else if (currentPage === 'calendario.html') {
          let nomeFormattato = userData.username;
          
          if (userData.nome && userData.cognome) {
            // Capitalizza solo la prima lettera di nome e cognome
            const nome = userData.nome.charAt(0).toUpperCase() + userData.nome.slice(1).toLowerCase();
            const cognome = userData.cognome.charAt(0).toUpperCase() + userData.cognome.slice(1).toLowerCase();
            nomeFormattato = `${nome} ${cognome}`;
          }
          
          titolo.textContent = `Benvenuto/a, ${nomeFormattato}!`;
        }
      }
    }
  }).catch(error => {
    console.error('Errore nel recupero dei dati utente:', error);
  });
}

// Esporre le funzioni necessarie globalmente
window.getUserData = getUserData;
window.getCookie = getCookie;
window.updatePageTitle = updatePageTitle;