let selectedAnno = null;
let hasProgData = false;

document.addEventListener('DOMContentLoaded', function() {
  initializeAnnoSelector();
  
  const downloadButton = document.getElementById('downloadButton');
  downloadButton.addEventListener('click', function() {
    if (!selectedAnno) {
      showMessage('error', 'Seleziona prima un anno accademico');
      return;
    }
    window.location.href = `/api/oh-issa/download-file-esse3?anno=${selectedAnno}`;
  });

  const downloadEasyAcademyButton = document.getElementById('downloadEasyAcademyButton');
  downloadEasyAcademyButton.addEventListener('click', function() {
    if (!selectedAnno) {
      showMessage('error', 'Seleziona prima un anno accademico');
      return;
    }
    const includeDetails = document.getElementById('eaExportToggle').checked;
    window.location.href = `/api/oh-issa/download-file-easyacademy?anno=${selectedAnno}&details=${includeDetails}`;
  });

  // Gestione caricamento file UGOV
  document.getElementById('uploadFileButton').addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });

  // Gestione selezione file e invio automatico
  document.getElementById('fileInput').addEventListener('change', function(e) {
    const fileInput = this;
    const fileName = fileInput.files[0] ? fileInput.files[0].name : 'Nessun file selezionato';
    document.getElementById('selectedFileName').textContent = fileName;
    
    if (fileInput.files.length) {
      // Mostra messaggio di caricamento
      showMessage('info', 'Caricamento in corso...');
      
      // Crea un FormData e carica il file
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      
      // Invia richiesta al server
      fetch('/api/oh-issa/upload-file-ugov', {
        method: 'POST',
        body: formData
      })
        .then(response => response.json())
        .then(data => {
          if (data.status === 'success') {
            showMessage('success', data.message, data.details);
            // Ricarica la lista degli anni e ricontrolla lo stato
            initializeAnnoSelector();
          } else {
            showMessage('error', data.message);
          }
        })
        .catch(error => {
          showMessage('error', `Errore durante l'import: ${error.message}`);
        });
    }
  });
});

function initializeAnnoSelector() {
  fetch('/api/get-anni-accademici')
    .then(response => response.json())
    .then(years => {
      const select = document.getElementById('annoSelect');
      const currentValue = select.value; // Salva la selezione corrente
      select.innerHTML = '<option value="">Nuovo anno accademico</option>';
      
      years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}/${year + 1}`;
        select.appendChild(option);
      });

      // Ripristina la selezione precedente o seleziona l'anno più recente
      if (currentValue && years.includes(parseInt(currentValue))) {
        select.value = currentValue;
        selectedAnno = parseInt(currentValue);
        checkProgrammazioneDidattica(selectedAnno);
      } else if (years.length > 0) {
        select.value = years[0];
        selectedAnno = years[0];
        checkProgrammazioneDidattica(years[0]);
      }
    })
    .catch(error => {
      showMessage('error', 'Errore nel caricamento degli anni accademici');
      console.error('Error:', error);
    });

  // Gestione cambio anno accademico
  document.getElementById('annoSelect').addEventListener('change', function() {
    selectedAnno = this.value ? parseInt(this.value) : null;
    if (selectedAnno) {
      checkProgrammazioneDidattica(selectedAnno);
    } else {
      updateStatus('loading', 'Importa dati per nuovo anno accademico');
      updateButtonStates(false);
    }
  });
}

function checkProgrammazioneDidattica(anno) {
  if (!anno) return;
  
  updateStatus('loading', 'Carica programmazione didattica');
  
  fetch(`/api/oh-issa/check-programmazione-didattica?anno=${anno}`)
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        updateStatus('not-loaded', 'Errore nella verifica');
        updateButtonStates(false);
      } else {
        hasProgData = data.has_programmazione;
        if (hasProgData) {
          updateStatus('loaded', `Programmazione didattica caricata (${data.count} insegnamenti)`);
        } else {
          updateStatus('not-loaded', 'Programmazione didattica non caricata');
        }
        updateButtonStates(hasProgData);
      }
    })
    .catch(error => {
      updateStatus('not-loaded', 'Errore nella verifica');
      updateButtonStates(false);
      console.error('Error:', error);
    });
}

function updateStatus(type, text) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  indicator.className = `status-indicator ${type}`;
  statusText.textContent = text;
}

function updateButtonStates(hasData) {
  const uploadBtn = document.getElementById('uploadFileButton');
  const downloadBtn = document.getElementById('downloadButton');
  const downloadEABtn = document.getElementById('downloadEasyAcademyButton');
  
  if (hasData) {
    uploadBtn.classList.add('loaded');
    uploadBtn.textContent = 'Aggiorna File UGOV';
    
    // Abilita i pulsanti di download
    downloadBtn.disabled = false;
    downloadEABtn.disabled = false;
    downloadBtn.classList.remove('disabled');
    downloadEABtn.classList.remove('disabled');
  } else {
    uploadBtn.classList.remove('loaded');
    uploadBtn.textContent = 'Seleziona e Carica File';
    
    // Disabilita i pulsanti di download se non ci sono dati
    downloadBtn.disabled = true;
    downloadEABtn.disabled = true;
    downloadBtn.classList.add('disabled');
    downloadEABtn.classList.add('disabled');
  }
}

function showMessage(type, text, details) {
  const messagesDiv = document.getElementById('responseMessages');
  messagesDiv.innerHTML = '';

  const messageDiv = document.createElement('div');
  messageDiv.className = `alert alert-${type === 'success' ? 'success' : type === 'info' ? 'info' : 'danger'}`;
  messageDiv.textContent = text;

  if (details) {
    const detailsPre = document.createElement('pre');
    detailsPre.className = 'alert-details';
    detailsPre.textContent = details;
    messageDiv.appendChild(detailsPre);
  }

  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollIntoView({ behavior: 'smooth' });
}