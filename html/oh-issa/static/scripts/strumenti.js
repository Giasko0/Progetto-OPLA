document.addEventListener('DOMContentLoaded', function() {
  // Gestione Ricalcolo Sovrapposizioni
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

  // Gestione Blocco CdS
  const cdsTableBody = document.querySelector('#cdsTable tbody');
  const annoFilter = document.getElementById('annoFilter');
  let allCdsData = [];

  if (cdsTableBody) {
    loadCdsData();

    if (annoFilter) {
      annoFilter.addEventListener('change', renderCdsTable);
    }
  }

  async function loadCdsData() {
    try {
      const response = await fetch('/api/oh-issa/get-cds-status');
      const result = await response.json();
      
      if (result.status === 'success') {
        allCdsData = result.data;
        populateAnnoFilter();
        renderCdsTable();
      } else {
        console.error('Errore caricamento CdS:', result.message);
        cdsTableBody.innerHTML = `<tr><td colspan="5" class="centered error">Errore: ${result.message}</td></tr>`;
      }
    } catch (e) {
      console.error('Errore fetch CdS:', e);
      cdsTableBody.innerHTML = `<tr><td colspan="5" class="centered error">Errore di connessione</td></tr>`;
    }
  }

  function populateAnnoFilter() {
    const anni = [...new Set(allCdsData.map(item => item.anno_accademico))].sort((a, b) => b - a);
    const currentVal = annoFilter.value;
    
    annoFilter.innerHTML = '<option value="">Tutti</option>';
    anni.forEach(anno => {
      const option = document.createElement('option');
      option.value = anno;
      option.textContent = `${anno}/${anno + 1}`;
      annoFilter.appendChild(option);
    });

    // Seleziona l'anno più recente di default se non c'è selezione
    if (!currentVal && anni.length > 0) {
      annoFilter.value = anni[0];
    } else if (currentVal) {
      annoFilter.value = currentVal;
    }
  }

  function renderCdsTable() {
    const selectedAnno = annoFilter.value;
    const filteredData = selectedAnno 
      ? allCdsData.filter(item => item.anno_accademico == selectedAnno)
      : allCdsData;

    cdsTableBody.innerHTML = '';

    if (filteredData.length === 0) {
      cdsTableBody.innerHTML = '<tr><td colspan="5" class="centered">Nessun CdS trovato</td></tr>';
      return;
    }

    filteredData.forEach(cds => {
      const tr = document.createElement('tr');
      
      const statusBadge = cds.bloccato 
        ? '<span class="status-badge blocked">BLOCCATO</span>' 
        : '<span class="status-badge active">ATTIVO</span>';

      tr.innerHTML = `
        <td>${cds.anno_accademico}/${cds.anno_accademico + 1}</td>
        <td><strong>${cds.codice}</strong></td>
        <td>${cds.nome_corso}</td>
        <td class="centered">${statusBadge}</td>
        <td class="centered">
          <label class="switch">
            <input type="checkbox" ${cds.bloccato ? 'checked' : ''} 
                   onchange="toggleCdsBlock('${cds.codice}', ${cds.anno_accademico}, this.checked)">
            <span class="slider"></span>
          </label>
        </td>
      `;
      cdsTableBody.appendChild(tr);
    });
  }

  // Esponi la funzione globalmente per l'onchange inline
  window.toggleCdsBlock = async function(codice, anno, isBlocked) {
    try {
      const response = await fetch('/api/oh-issa/toggle-cds-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codice: codice,
          anno_accademico: anno,
          bloccato: isBlocked
        })
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        // Aggiorna lo stato locale e la UI
        const index = allCdsData.findIndex(c => c.codice === codice && c.anno_accademico === anno);
        if (index !== -1) {
          allCdsData[index].bloccato = isBlocked;
          renderCdsTable(); // Rirenderizza per aggiornare il badge
        }
      } else {
        alert('Errore: ' + result.message);
        // Revert checkbox state (ricarica dati)
        loadCdsData();
      }
    } catch (e) {
      alert('Errore di connessione');
      loadCdsData();
    }
  };
});
