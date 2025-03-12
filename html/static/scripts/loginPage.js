// Script di supporto per la pagina di login

document.addEventListener('DOMContentLoaded', function() {
  // Verifica se l'utente è già autenticato usando la funzione con cache
  getUserData().then(data => {
    if (data.authenticated) {
      // Se già autenticato, reindirizza alla home
      window.location.href = 'index.html';
    }
  });
  
  // Gestione degli eventi del form di login se necessario
  const loginForm = document.querySelector('form');
  if (loginForm) {
    loginForm.addEventListener('submit', function(event) {   
      // Assicuriamoci di invalidare la cache quando facciamo un nuovo login
      if (typeof clearAuthCache === 'function') {
        clearAuthCache();
      }
    });
  }
});
