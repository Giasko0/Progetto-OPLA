document.addEventListener("DOMContentLoaded", function () {
  // Trova il div con id 'footer'
  const footer = document.getElementById("footer");

  if (footer) {
    // Struttura html del footer
    footer.innerHTML = `
      <div class="footer-content">
        <div class="footer-section">
          <p>&copy; ${new Date().getFullYear()} Università degli Studi di Perugia</p>
          <p>Dipartimento di Matematica e Informatica</p>
        </div>
        <div class="footer-section">
          <p>OPLÀ - Portale Online per Prenotare Laboratori e Aule</p>
          <p>Versione 1.3</p>
        </div>
        <div class="footer-section">
          <p>Stai riscontrando problemi?</p>
          <p>Invia un'email a <a class="email-link" href="mailto:opla.dmi.unipg@gmail.com">opla.dmi.unipg@gmail.com</a></p>
        </div>
      </div>
    `;
  }
});
