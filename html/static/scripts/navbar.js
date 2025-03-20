document.addEventListener('DOMContentLoaded', function() {
  // Trova il div con id 'navbar'
  const navbarContainer = document.getElementById('navbar');
  
  if (navbarContainer) {
    // Determina lo stato attuale per l'aria-label
    const isDarkMode = document.documentElement.classList.contains('dark');
    const darkModeLabel = isDarkMode ? 'Passa alla modalità chiara' : 'Passa alla modalità scura';
    const darkModeIcon = isDarkMode ? 'light_mode' : 'dark_mode';
    const logoPath = isDarkMode ? "static/imgs/logo-dark.png" : "static/imgs/logo.png";
    
    // Struttura html della navbar
    const navbarHTML = `
      <div class="navbar">
        <a href="index.html"><img src="${logoPath}" alt="Logo" class="logo" id="navLogo"></a>
        <button class="hamburger-menu" aria-label="Menu di navigazione">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="navlinks">
          <a href="index.html">Home</a>
          <a href="mieiEsami.html">I miei esami</a>
          <!-- Il link di login/logout e altri link verranno aggiunti qui dinamicamente -->
        </div>
        <span id="darkModeButton" class="material-symbols-outlined" onclick="toggleDarkMode()" aria-label="${darkModeLabel}">${darkModeIcon}</span>
      </div>
    `;
    
    // Inserisci la navbar nel container
    navbarContainer.innerHTML = navbarHTML;
    
    // Recupera il container dei link della navbar e il pulsante hamburger
    const navlinksDiv = document.querySelector('.navlinks');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    
    // Aggiungi event listener al pulsante hamburger
    hamburgerMenu.addEventListener('click', function() {
      navlinksDiv.classList.toggle('open');
    });
    
    // Verifica se l'utente è un admin per aggiungere il pulsante OH-ISSA
    const isAdmin = getCookie('admin') === 'true';
    
    // Se l'utente è un admin, aggiungi il pulsante OH-ISSA
    if (isAdmin) {
      const ohIssaLink = document.createElement('a');
      ohIssaLink.href = "/oh-issa/index.html";
      ohIssaLink.innerHTML = "OH-ISSA <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>admin_panel_settings</span>";
      navlinksDiv.appendChild(ohIssaLink);
    }
    
    // Utilizziamo il sistema di cache per controllare l'autenticazione
    getUserData()
      .then(data => {
        const link = document.createElement('a');
        link.className = 'nav-link';
        
        if (data.authenticated && data.user_data) {
          // Utente autenticato
          link.href = "/api/logout";
          link.innerHTML = `${data.user_data.nome} ${data.user_data.cognome} - Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>`;
        } else {
          // Utente non autenticato
          link.href = "login.html";
          link.innerHTML = "Accedi <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>login</span>";
        }
        
        navlinksDiv.appendChild(link);
      })
      .catch(error => {
        console.error('Errore nel controllo dell\'autenticazione:', error);
        // Fallback al vecchio sistema
        const username = getCookie('username');
        const link = document.createElement('a');
        link.className = 'nav-link';
        
        if (username) {
          link.href = "/api/logout";
          link.innerHTML = "Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>";
        } else {
          link.href = "login.html";
          link.innerHTML = "Accedi <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>login</span>";
        }
        
        navlinksDiv.appendChild(link);
      });
      
    // Chiudi il menu quando si clicca su un link (solo su mobile)
    const navLinks = navlinksDiv.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          navlinksDiv.classList.remove('open');
        }
      });
    });
  }
});
