document.addEventListener('DOMContentLoaded', function() {
  // Trova il div con id 'navbar'
  const navbarContainer = document.getElementById('navbar');
  
  if (navbarContainer) {
    // Struttura html della navbar
    const navbarHTML = `
      <div class="navbar">
        <a href="index.html"><img src="static/imgs/logo.png" alt="Logo" class="logo"></a>
        <div class="navlinks">
          <a href="index.html">Home</a>
          <a href="mieiEsami.html">I miei esami</a>
          <!-- Il link di login/logout e altri link verranno aggiunti qui dinamicamente -->
        </div>
        <!-- Pulsante dark mode commentato per consistenza con i file originali -->
        <!--<span id="darkModeButton" class="material-symbols-outlined" onclick="darkMode()">dark_mode</span>-->
      </div>
    `;
    
    // Inserisci la navbar nel container
    navbarContainer.innerHTML = navbarHTML;
    
    // Recupera il container dei link della navbar
    const navlinksDiv = document.querySelector('.navlinks');
    
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
  }
});
