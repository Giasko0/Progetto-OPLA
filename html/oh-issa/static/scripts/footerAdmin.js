document.addEventListener('DOMContentLoaded', function() {
  // Trova il div con id 'footer'
  const footer = document.getElementById('footer');
  
  if (footer) {
    // Struttura html del footer
    footer.innerHTML = `
      <div class="footer-content">
        <div class="footer-section">
          <p>&copy; ${new Date().getFullYear()} Università degli Studi di Perugia</p>
          <p>Dipartimento di Matematica e Informatica</p>
        </div>
        <div class="footer-section">
          <p>OH-ISSA - Online Helper per Importazione dei Sistemi Strutturati Accademici</p>
          <p>Versione 1.2.1</p>
        </div>
        <div class="footer-section">
          <p>Stai riscontrando problemi?</p>
          <p>Invia un'email a <a href="mailto:opla.dmi.unipg@gmail.com">opla.dmi.unipg@gmail.com</a></p>
        </div>
      </div>
    `;
  }
});
