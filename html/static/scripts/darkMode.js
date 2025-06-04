// Script per dark mode

// Toggles the dark mode
function toggleDarkMode() {
  document.documentElement.classList.toggle("dark");

  // Salva la preferenza
  const isDark = document.documentElement.classList.contains("dark");
  localStorage.setItem("darkTheme", isDark ? "dark" : "light");

  updateDarkModeIcon(isDark);
  updateLogo(isDark);
}

// Aggiorna l'icona e label del pulsante
function updateDarkModeIcon(isDark) {
  const icon = document.getElementById("darkModeButton");
  if (icon) {
    icon.textContent = isDark ? "light_mode" : "dark_mode";
    icon.setAttribute(
      "aria-label",
      isDark ? "Passa alla modalità chiara" : "Passa alla modalità scura"
    );
  }
}

// Aggiorna il logo in base alla modalità
function updateLogo(isDark) {
  const logo = document.getElementById("navLogo");
  if (logo) {
    logo.src = isDark ? "static/imgs/logo-dark.png" : "static/imgs/logo.png";
  }
}

// Inizializza la dark mode in base alle preferenze
document.addEventListener("DOMContentLoaded", () => {
  // Recupera preferenza salvata o usa preferenza sistema
  const savedTheme = localStorage.getItem("darkTheme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Applica tema appropriato
  const shouldBeDark =
    savedTheme === "dark" || (savedTheme === null && prefersDark);
  if (shouldBeDark) {
    document.documentElement.classList.add("dark");
  }

  updateDarkModeIcon(shouldBeDark);
  updateLogo(shouldBeDark);

  // Ascolta cambiamenti nelle preferenze di sistema (solo se non c'è preferenza esplicita)
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (localStorage.getItem("darkTheme") === null) {
        document.documentElement.classList.toggle("dark", e.matches);
        updateDarkModeIcon(e.matches);
        updateLogo(e.matches);
      }
    });
});
