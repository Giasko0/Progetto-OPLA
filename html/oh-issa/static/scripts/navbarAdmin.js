// Funzione per recuperare cookie
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

document.addEventListener('DOMContentLoaded', function() {
  // Trova il div con id 'navbar'
  const navbarContainer = document.getElementById('navbar');
  
  if (navbarContainer) {
    // Crea la struttura base della navbar
    const navbarHTML = `
      <a class="navbar-brand">OH-ISSA</a>
      <ul class="navbar-nav">
        <li><a href="/oh-issa/">Dashboard</a></li>
        <li><a href="/oh-issa/fileUpload.html">Carica File</a></li>
        <li><a href="/oh-issa/fileDownload.html">Scarica File</a></li>
        <li><a href="/oh-issa/gestisciCds.html">Gestisci CdS</a></li>
        <li><a href="/oh-issa/calendarioEsami.html">Calendario Esami</a></li>
        <li id="loginLogoutItem" class="nav-right">
          <!-- Il link di login/logout verrà aggiunto qui dinamicamente -->
        </li>
      </ul>
    `;
    
    // Inserisci la navbar nel container
    navbarContainer.innerHTML = navbarHTML;
    
    // Recupera il container per il login/logout
    const loginLogoutItem = document.getElementById('loginLogoutItem');
    
    // Verifica se l'utente è autenticato controllando il cookie 'admin'
    const adminCookie = getCookie('admin');
    
    if (adminCookie) {
      // Utente autenticato, mostra il link di logout
      const logoutLink = document.createElement('a');
      logoutLink.href = "/api/logout";
      logoutLink.id = 'logoutBtn';
      logoutLink.innerHTML = 'Logout';
      loginLogoutItem.appendChild(logoutLink);
    } else {
      // Utente non autenticato, mostra il link di login
      const loginLink = document.createElement('a');
      loginLink.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      loginLink.innerHTML = 'Login';
      loginLogoutItem.appendChild(loginLink);
    }
  }
});