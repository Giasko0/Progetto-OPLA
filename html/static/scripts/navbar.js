document.addEventListener("DOMContentLoaded", function () {
  // Trova il div con id 'navbar'
  const navbarContainer = document.getElementById("navbar");

  if (navbarContainer) {
    // Determina lo stato attuale per l'aria-label
    const isDarkMode = document.documentElement.classList.contains("dark");
    const darkModeLabel = isDarkMode
      ? "Passa alla modalità chiara"
      : "Passa alla modalità scura";
    const darkModeIcon = isDarkMode ? "light_mode" : "dark_mode";
    const logoPath = isDarkMode
      ? "static/imgs/logo-dark.png"
      : "static/imgs/logo.png";

    // Struttura html della navbar
    const navbarHTML = `
      <div class="navbar">
        <a href="index.html"><img src="${logoPath}" alt="Logo" class="logo" id="navLogo"></a>
        <button class="hamburger-menu" aria-label="Menu di navigazione">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="navlinks flex-container"></div>
        <span id="darkModeButton" class="material-symbols-outlined" onclick="toggleDarkMode()" aria-label="${darkModeLabel}">${darkModeIcon}</span>
      </div>
    `;

    // Inserisci la navbar nel container
    navbarContainer.innerHTML = navbarHTML;

    // Recupera il container dei link della navbar e il pulsante hamburger
    const navlinksDiv = document.querySelector(".navlinks");
    const hamburgerMenu = document.querySelector(".hamburger-menu");

    // Aggiungi event listener al pulsante hamburger
    hamburgerMenu.addEventListener("click", function () {
      navlinksDiv.classList.toggle("open");
    });

    // Utilizziamo getUserData centralizzata per verificare i permessi admin
    window.getUserData()
      .then((data) => {
        const isAdmin = data.authenticated && data.user_data && data.user_data.permessi_admin;

        // Aggiungi i link della navbar
        const calendarLink = document.createElement("a");
        calendarLink.textContent = "Calendario";

        const examsLink = document.createElement("a");
        examsLink.textContent = "I miei esami";

        // Controlla se l'utente è autenticato
        if (data.authenticated) {
          calendarLink.href = "calendario.html";
          examsLink.href = "mieiEsami.html";
        } else {
          calendarLink.href = `login.html?redirect=${encodeURIComponent(
            "/calendario.html"
          )}`;
          examsLink.href = `login.html?redirect=${encodeURIComponent(
            "/mieiEsami.html"
          )}`;
        }

        // Inserisci i link nella navbar
        navlinksDiv.appendChild(calendarLink);
        navlinksDiv.appendChild(examsLink);

        // Aggiungi il link di login/logout
        const link = document.createElement("a");
        link.className = "nav-link";

        if (data.authenticated && data.user_data) {
          // Utente autenticato
          link.href = "/api/logout";

          // Usa la funzione capitalizeWords da auth.js per nome e cognome
          const nome = data.user_data.nome ? capitalizeWords(data.user_data.nome) : "";
          const cognome = data.user_data.cognome ? capitalizeWords(data.user_data.cognome) : "";

          if (data.user_data.nome || data.user_data.cognome) {
            link.innerHTML = `${nome} ${cognome} - Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>`;
          } else {
            link.innerHTML = `Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>`;
          }
        } else {
          // Utente non autenticato
          link.href = "login.html";
          link.innerHTML =
            "Accedi <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>login</span>";
        }

        navlinksDiv.appendChild(link);
        
        // Se l'utente è un admin, aggiungi il divisore e il pulsante OH-ISSA
        if (isAdmin) {
          // Crea il divisore verticale
          const divider = document.createElement("div");
          divider.className = "vertical-divider";
          navlinksDiv.appendChild(divider);
          
          // Crea il link OH-ISSA
          const ohIssaLink = document.createElement("a");
          ohIssaLink.href = "/oh-issa/index.html";
          ohIssaLink.className = "system-link";
          ohIssaLink.innerHTML =
            "OH-ISSA <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>admin_panel_settings</span>";
          navlinksDiv.appendChild(ohIssaLink);
        }

        // Caching dei dati in sessionStorage se l'utente è autenticato
        if (data.authenticated && data.user_data) {
          sessionStorage.setItem('userData', JSON.stringify(data.user_data));
        }

        // Imposta active status sui link della navbar dopo che sono stati aggiunti
        setActiveNavLink();

        // Chiudi il menu quando si clicca su un link (solo su mobile)
        const navLinks = navlinksDiv.querySelectorAll("a");
        navLinks.forEach((link) => {
          link.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
              navlinksDiv.classList.remove("open");
            }
          });
        });
      })
      .catch((error) => {
        console.error("Errore nel controllo dell'autenticazione:", error);
      });
  }
});

// Funzione per impostare lo stato active sulla navbar principale
function setActiveNavLink() {
  // Ottieni il path corrente
  const currentPath = window.location.pathname;
  const currentPage = currentPath.split('/').pop() || 'index.html';
  
  // Trova tutti i link nella navbar
  const navLinks = document.querySelectorAll('.navlinks a');
  
  // Rimuovi prima la classe active da tutti i link
  navLinks.forEach(link => {
    link.classList.remove('active');
  });
  
  // Imposta la classe active sul link corrispondente
  navLinks.forEach(link => {
    const linkHref = link.getAttribute('href');
    
    if (linkHref) {
      // Rimuovi parametri di query e fragment
      const linkPage = linkHref.split('?')[0].split('#')[0].split('/').pop();
      
      // Verifica il caso speciale della homepage
      if ((linkPage === 'index.html' || linkHref === '/') && 
          (currentPage === 'index.html' || currentPage === '' || currentPath === '/')) {
        link.classList.add('active');
      }
      // Per altri link, verifica la corrispondenza diretta
      else if (linkPage === currentPage) {
        link.classList.add('active');
      }
    }
  });
}
