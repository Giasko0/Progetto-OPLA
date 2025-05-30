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
        <li><a href="/oh-issa/gestioneDate.html">Gestione Date</a></li>
        <li><a href="/oh-issa/gestioneUtenti.html">Gestione Utenti</a></li>
        <li><a href="/oh-issa/calendarioEsami.html">Calendario Esami</a></li>
        <li id="loginLogoutItem" class="nav-right">
          <!-- Il link di login/logout verrà aggiunto qui dinamicamente -->
        </li>
        <li class="divider"></li>
        <li class="system-link"><a href="/">OPLÀ</a></li>
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
    
    // Verifica se l'utente è un admin usando getUserData
    getUserData()
      .then((data) => {
        const isAdmin = data.authenticated && data.user_data && data.user_data.permessi_admin;
        
        if (isAdmin) {
          // Utente admin autenticato, mostra il link di logout
          const logoutLink = document.createElement('a');
          logoutLink.href = "/api/logout";
          logoutLink.id = 'logoutBtn';
          logoutLink.innerHTML = 'Logout';
          loginLogoutItem.appendChild(logoutLink);
        } else {
          // Utente non admin, mostra il link di login
          const loginLink = document.createElement('a');
          loginLink.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
          loginLink.innerHTML = 'Login';
          loginLogoutItem.appendChild(loginLink);
        }
      })
      .catch((error) => {
        console.error("Errore nel controllo dell'autenticazione:", error);
        // In caso di errore, mostra il link di login
        const loginLink = document.createElement('a');
        loginLink.href = '/login.html';
        loginLink.innerHTML = 'Login';
        loginLogoutItem.appendChild(loginLink);
      });
    
    // Chiudi il menu quando si clicca su un link (solo su mobile)
    const navLinks = navbarNav.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          navbarNav.classList.remove('open');
        }
      });
    });
    
    // Imposta active status sui link della navbar
    setActiveNavLink();
  }
});

// Funzione per impostare lo stato active sulla navbar admin
function setActiveNavLink() {
  // Ottieni il path corrente
  const currentPath = window.location.pathname;
  const currentPage = currentPath.split('/').pop() || 'index.html';
  
  // Trova tutti i link nella navbar
  const navLinks = document.querySelectorAll('.navbar-nav a');
  
  // Rimuovi prima la classe active da tutti i link
  navLinks.forEach(link => {
    link.parentElement.classList.remove('active');
  });
  
  // Imposta la classe active sul link corrispondente
  navLinks.forEach(link => {
    const linkHref = link.getAttribute('href');
    
    if (linkHref) {
      const linkPage = linkHref.split('/').pop();
      
      // Verifica il caso speciale della dashboard
      if ((linkHref === '/oh-issa/' || linkPage === 'index.html') && 
          (currentPage === 'index.html' || currentPath === '/oh-issa/' || currentPath.endsWith('/oh-issa'))) {
        link.parentElement.classList.add('active');
      }
      // Per altri link, verifica la corrispondenza diretta
      else if (linkPage === currentPage) {
        link.parentElement.classList.add('active');
      }
    }
  });
}