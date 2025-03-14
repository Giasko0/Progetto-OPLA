// Autenticazione utente tramite cookie

// Cache per i dati dell'utente
let authCache = {
  data: null,
  timestamp: null,
  expiresIn: 5 * 60 * 1000 // 5 minuti in millisecondi
};

// Funzione per recuperare un cookie per nome
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Funzione centrale per ottenere i dati dell'utente (con caching)
function getUserData() {
  const now = new Date().getTime();
  
  // Se abbiamo dati in cache validi, usiamo quelli
  if (authCache.data && authCache.timestamp && (now - authCache.timestamp < authCache.expiresIn)) {
    return Promise.resolve(authCache.data);
  }

  // Altrimenti facciamo una nuova richiesta
  return fetch('/api/check-auth')
    .then(response => response.json())
    .then(data => {
      // Salviamo i dati nella cache
      authCache.data = data;
      authCache.timestamp = new Date().getTime();
      return data;
    })
    .catch(error => {
      console.error('Errore nel recupero dei dati utente:', error);
      return { authenticated: false, user_data: null };
    });
}

// Funzione per impostare il valore dell'username in un campo di input
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

// Funzione per mostrare/nascondere elementi in base all'autenticazione
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
    
    // Mostra il nome utente dove necessario
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

// Funzione per invalidare la cache (da chiamare dopo il logout)
function clearAuthCache() {
  authCache.data = null;
  authCache.timestamp = null;
}

// Funzione di invalidazione per il logout
document.addEventListener('DOMContentLoaded', function() {
  // Cerca link di logout e aggiungi event listener per pulire la cache
  const logoutLinks = document.querySelectorAll('a[href="/api/logout"]');
  logoutLinks.forEach(link => {
    link.addEventListener('click', function() {
      clearAuthCache();
    });
  });
});