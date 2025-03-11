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

  return fetch('/api/check-auth')
    .then(response => {
      if (!response.ok) {
        throw new Error('Errore nella risposta del server');
      }
      return response.json();
    })
    .then(data => {
      if (data.authenticated && data.user_data) {
        return {
          username: data.user_data.username,
          nome: data.user_data.nome,
          cognome: data.user_data.cognome
        };
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
    .then(user => {
      if (user && user.username) {
        const field = document.getElementById(fieldId);
        if (field) {
          field.value = user.username;
        }
      }
    });
}

// Funzione per mostrare/nascondere elementi in base all'autenticazione
function updateUIByAuth() {
  getCurrentUsername()
    .then(user => {
      const authElements = document.querySelectorAll('[data-auth]');
      authElements.forEach(el => {
        if ((el.dataset.auth === 'authenticated' && user && user.username) || 
            (el.dataset.auth === 'unauthenticated' && (!user || !user.username))) {
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });
      
      // Mostra il nome utente dove necessario
      const usernameElements = document.querySelectorAll('[data-username]');
      usernameElements.forEach(el => {
        if (user && user.username) {
          el.textContent = user.username;
        }
      });
    });
}