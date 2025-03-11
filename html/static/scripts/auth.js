// Autenticazione utente tramite cookie

// Funzione per recuperare un cookie per nome
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Funzione per ottenere lo username dell'utente corrente
function getCurrentUsername() {
  // Prima controlla il cookie 'username'
  const username = getCookie('username');
  if (username) {
    return Promise.resolve(username);
  }
  
  // Altrimenti, prova a controllare tramite API
  return fetch('/api/check-auth')
    .then(response => {
      if (!response.ok) {
        throw new Error('Errore nella risposta del server');
      }
      return response.json();
    })
    .then(data => {
      if (data.authenticated && data.username) {
        return data.username;
      }
      return null;
    })
    .catch(error => {
      console.error('Errore nel controllo dell\'autenticazione:', error);
      return null;
    });
}

// Funzione per impostare il valore dell'username in un campo di input
function setUsernameField(fieldId) {
  getCurrentUsername()
    .then(username => {
      if (username) {
        const field = document.getElementById(fieldId);
        if (field) {
          field.value = username;
        }
      }
    });
}

// Funzione per mostrare/nascondere elementi in base all'autenticazione
function updateUIByAuth() {
  getCurrentUsername()
    .then(username => {
      const authElements = document.querySelectorAll('[data-auth]');
      authElements.forEach(el => {
        if ((el.dataset.auth === 'authenticated' && username) || 
            (el.dataset.auth === 'unauthenticated' && !username)) {
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });
      
      // Mostra il nome utente dove necessario
      const usernameElements = document.querySelectorAll('[data-username]');
      usernameElements.forEach(el => {
        if (username) {
          el.textContent = username;
        }
      });
    });
}