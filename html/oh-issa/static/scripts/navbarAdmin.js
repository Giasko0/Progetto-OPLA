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
      <a class="navbar-brand" href="/oh-issa/">OH-ISSA</a>
      <button class="hamburger-menu" aria-label="Menu di navigazione">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <ul class="navbar-nav">
        <li><a href="/oh-issa/">Dashboard</a></li>
        <li><a href="/oh-issa/import-export.html">Import/Export Dati</a></li>
        <li><a href="/oh-issa/gestioneCds.html">Gestione CdS</a></li>
        <li><a href="/oh-issa/gestioneUtenti.html">Gestione Utenti</a></li>
        <li><a href="/oh-issa/calendarioEsami.html">Calendario Esami</a></li>
        <li id="loginLogoutItem" class="nav-right">
          <!-- Il link di login/logout verrà aggiunto qui dinamicamente -->
        </li>
      </ul>
    `;
    
    // Inserisci la navbar nel container
    navbarContainer.innerHTML = navbarHTML;
    
    // Recupera il container per il login/logout e il pulsante hamburger
    const loginLogoutItem = document.getElementById('loginLogoutItem');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const navbarNav = document.querySelector('.navbar-nav');
    
    // Aggiungi event listener al pulsante hamburger
    hamburgerMenu.addEventListener('click', function() {
      navbarNav.classList.toggle('open');
    });
    
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
    
    // Chiudi il menu quando si clicca su un link (solo su mobile)
    const navLinks = navbarNav.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          navbarNav.classList.remove('open');
        }
      });
    });
  }
});