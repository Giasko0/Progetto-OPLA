// Funzione per controllare se l'utente è autenticato come admin
function checkAdminAuth(skipCheck = false) {
  // Se skipCheck è true, non fare il controllo
  if (skipCheck) return true;
  
  // Verifica se l'utente è autenticato controllando il cookie 'admin'
  const adminCookie = document.cookie.split('; ').find(row => row.startsWith('admin='));
  
  if (!adminCookie) {
    // Utente non autenticato, reindirizza alla pagina di login
    window.location.href = '/login.html';
    return false;
  }
  
  // Utente autenticato
  return true;
}

// Eseguire il controllo automaticamente quando il DOM è completamente caricato
document.addEventListener('DOMContentLoaded', function() {
  // Ottieni il nome del file corrente
  const currentPath = window.location.pathname;
  const filename = currentPath.substring(currentPath.lastIndexOf('/') + 1);
  
  // Salta il controllo solo nella pagina di login
  const isLoginPage = filename === 'login.html';
  
  // Esegui il controllo di autenticazione
  checkAdminAuth(isLoginPage);
});
