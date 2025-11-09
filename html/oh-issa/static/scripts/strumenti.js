document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('ricalcolaSovrapposizioniBtn');
  const resultDiv = document.getElementById('ricalcolaResult');
  if (btn) {
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      btn.textContent = "Ricalcolo in corso...";
      resultDiv.textContent = "";
      try {
        const response = await fetch('/api/oh-issa/ricalcola-sovrapposizioni', { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.status === 'success') {
          resultDiv.innerHTML = `<span style="color:green;">${data.message}</span>`;
        } else {
          resultDiv.innerHTML = `<span style="color:red;">${data.message || 'Errore durante il ricalcolo.'}</span>`;
        }
      } catch (e) {
        resultDiv.innerHTML = `<span style="color:red;">Errore di rete o server.</span>`;
      }
      btn.disabled = false;
      btn.textContent = "Ricalcola Sovrapposizioni Esami";
    });
  }
});
