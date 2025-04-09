// Funzione per controllare se l'utente è autenticato come admin
function checkAdminAuth(skipCheck = false) {
  // Se skipCheck è true, non fare il controllo
  if (skipCheck) return true;
  
  return fetch("/api/check-auth", {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      if (!data.authenticated || !data.user_data || !data.user_data.permessi_admin) {
        // Utente non autenticato o non admin, reindirizza alla pagina di login
        window.location.href = '/login.html';
        return false;
      }
      // Utente autenticato come admin
      return true;
    })
    .catch(error => {
      console.error("Errore nel controllo dell'autenticazione admin:", error);
      window.location.href = '/login.html';
      return false;
    });
}

// Eseguo il controllo automaticamente quando il DOM è completamente caricato
document.addEventListener('DOMContentLoaded', function() {
  // Ottieni il nome del file corrente
  const currentPath = window.location.pathname;
  const filename = currentPath.substring(currentPath.lastIndexOf('/') + 1);
  
  // Salta il controllo solo nella pagina di login
  const isLoginPage = filename === 'login.html';
  
  // Esegui il controllo di autenticazione
  if (!isLoginPage) {
    checkAdminAuth(false);
  }
});
