// Funzione per controllare se l'utente è autenticato come admin
function checkAdminAuth() {
  return fetch("/api/get-user-data", {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      if (!data.authenticated || !data.user_data || !data.user_data.permessi_admin) {
        // Utente non autenticato o non admin, reindirizza al login
        window.location.href = '/saml/login';
        return false;
      }
      // Utente autenticato come admin
      return true;
    })
    .catch(error => {
      console.error("Errore nel controllo dell'autenticazione admin:", error);
      window.location.href = '/saml/login';
      return false;
    });
}

// Eseguo il controllo automaticamente quando il DOM è completamente caricato
document.addEventListener('DOMContentLoaded', function() {
  checkAdminAuth();
});
