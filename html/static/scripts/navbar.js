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
      <div class="navbar">
        <a href="index.html"><img src="static/imgs/logo.png" alt="Logo" class="logo"></a>
        <div class="navlinks">
          <a href="index.html">Home</a>
          <a href="mieiEsami.html">I miei esami</a>
          <!-- Il link di login/logout verrà aggiunto qui dinamicamente -->
        </div>
        <!-- Pulsante dark mode commentato per consistenza con i file originali -->
        <!--<span id="darkModeButton" class="material-symbols-outlined" onclick="darkMode()">dark_mode</span>-->
      </div>
    `;
    
    // Inserisci la navbar nel container
    navbarContainer.innerHTML = navbarHTML;
    
    // Recupera il container dei link della navbar
    const navlinksDiv = document.querySelector('.navlinks');
    
    // Controlliamo se l'utente è autenticato attraverso una chiamata API
    fetch('/api/check-auth')
      .then(response => response.json())
      .then(data => {
        const link = document.createElement('a');
        
        if (data.authenticated) {
          link.href = "/flask/logout";
          link.innerHTML = `${data.username} - Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>`;
        } else {
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
        
        if (username) {
          link.href = "/flask/logout";
          link.innerHTML = "Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>";
        } else {
          link.href = "login.html";
          link.innerHTML = "Accedi <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>login</span>";
        }
        
        navlinksDiv.appendChild(link);
      });
  }
});
