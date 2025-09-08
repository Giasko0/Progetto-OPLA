// Importa esami da file Exceli
const ExamFileImporter = {
  
  // Configurazione
  config: {
    allowedExtensions: ['xlsx'],
    maxFileSize: 1024 * 1024, // 1MB, un file excel non dovrebbe essere così grande
    progressUpdateInterval: 100
  },

  // Inizializzazione del modulo
  init() {
    this.setupGlobalFunction();
  },

  // Espone la funzione principale globalmente
  setupGlobalFunction() {
    window.importExamsFromFile = () => this.showImportModal();
  },

  // Mostra il modal di importazione
  showImportModal() {
    if (!this.validateUserAccess()) return;
    
    this.createModal();
  },

  // Valida accesso utente
  validateUserAccess() {
    const username = window.currentUsername;
    if (!username) {
      window.showMessage("Devi effettuare il login per utilizzare questa funzione", "Attenzione", "warning");
      return false;
    }
    return true;
  },

  // Crea e mostra il modal
  createModal() {
    const overlay = this.createOverlay();
    const modal = this.createModalContent();
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    this.setupModalEventListeners(overlay);
  },

  // Crea l'overlay del modal
  createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'file-upload-overlay';
    return overlay;
  },

  // Crea il contenuto del modal
  createModalContent() {
    const modal = document.createElement('div');
    modal.className = 'file-upload-modal';
    
    modal.innerHTML = `
      ${this.getModalHeader()}
      ${this.getModalBody()}
    `;
    
    return modal;
  },

  // Header del modal
  getModalHeader() {
    return `
      <div class="file-upload-header">
        <h2>Importa Esami da File Excel</h2>
        <button class="file-upload-close" id="closeUploadModal">&times;</button>
      </div>
    `;
  },

  // Corpo del modal
  getModalBody() {
    return `
      <div class="file-upload-content">
        ${this.getInstructions()}
        ${this.getTemplateSection()}
        ${this.getUploadSection()}
        ${this.getProgressSection()}
        ${this.getActionButtons()}
        ${this.getResultSection()}
      </div>
    `;
  },

  // Istruzioni per l'utente
  getInstructions() {
    return `
      <div class="file-upload-instructions">
        <p>Segui questi passaggi per importare esami da file:</p>
        <ol>
          <li>Scarica il template Excel (formato XLSX) con i tuoi insegnamenti</li>
          <li>Compila il file con i dati degli esami da inserire</li>
          <li>Carica il file compilato utilizzando il pulsante o trascinandolo nell'area sottostante</li>
          <li>Consulta la scheda "Istruzioni e Legenda" del file Excel per le informazioni sui valori accettati</li>
        </ol>
      </div>
    `;
  },

  // Sezione download template
  getTemplateSection() {
    return `
      <div class="file-upload-buttons">
        <button id="downloadTemplateBtn" class="file-upload-button">
          <span class="material-symbols-outlined">download</span> Scarica Template
        </button>
      </div>
    `;
  },

  // Sezione upload file
  getUploadSection() {
    return `
      <div id="fileDropzone" class="file-upload-dropzone">
        <span class="material-symbols-outlined file-upload-icon">cloud_upload</span>
        <p>Trascina qui il file Excel (XLSX) o clicca per selezionarlo</p>
        <small>Sono supportati solo file in formato XLSX</small>
        <div id="selectedFileName" class="file-upload-selected-file"></div>
      </div>
    `;
  },

  // Sezione progress bar
  getProgressSection() {
    return `
      <div class="file-upload-progress" id="uploadProgress">
        <div class="file-upload-progress-bar" id="uploadProgressBar"></div>
      </div>
    `;
  },

  // Pulsanti azione
  getActionButtons() {
    return `
      <div class="file-upload-buttons">
        <button id="uploadFileBtn" class="file-upload-button" disabled>
          <span class="material-symbols-outlined">upload</span> Importa Esami
        </button>
        <button id="bypassCheckBox" class="file-upload-button" style="display: none;">
          <span class="material-symbols-outlined">warning</span> Bypass Controlli
        </button>
      </div>
    `;
  },

  // Sezione risultati
  getResultSection() {
    return `<div id="uploadResult" class="file-upload-result"></div>`;
  },

  // Configura gli event listeners del modal
  setupModalEventListeners(overlay) {
    const fileInput = this.createFileInput();
    document.body.appendChild(fileInput);

    // Chiusura modal
    document.getElementById('closeUploadModal').addEventListener('click', () => {
      this.closeModal(overlay, fileInput);
    });

    // Download template
    document.getElementById('downloadTemplateBtn').addEventListener('click', () => {
      this.downloadTemplate();
    });

    // Upload file
    document.getElementById('uploadFileBtn').addEventListener('click', () => {
      this.uploadFile(fileInput.files[0]);
    });

    // Setup file handlers
    this.setupFileHandlers(fileInput);

    // Setup admin bypass
    this.setupAdminBypass();
  },

  // Crea input file nascosto
  createFileInput() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx';
    fileInput.style.display = 'none';
    return fileInput;
  },

  // Chiude il modal
  closeModal(overlay, fileInput) {
    document.body.removeChild(overlay);
    document.body.removeChild(fileInput);
  },

  // Configura handlers per il file
  setupFileHandlers(fileInput) {
    const dropzone = document.getElementById('fileDropzone');
    const uploadBtn = document.getElementById('uploadFileBtn');
    const selectedFileName = document.getElementById('selectedFileName');

    // Click dropzone
    dropzone.addEventListener('click', () => fileInput.click());

    // Change file
    fileInput.addEventListener('change', () => {
      this.handleFileSelection(fileInput, selectedFileName, uploadBtn, dropzone);
    });

    // Drag & Drop
    this.setupDragAndDrop(dropzone, fileInput, selectedFileName, uploadBtn);
  },

  // Gestisce selezione file
  handleFileSelection(fileInput, selectedFileName, uploadBtn, dropzone) {
    if (fileInput.files.length > 0) {
      selectedFileName.textContent = fileInput.files[0].name;
      uploadBtn.disabled = false;
      dropzone.classList.add('file-upload-dropzone-active');
    }
  },

  // Configura drag and drop
  setupDragAndDrop(dropzone, fileInput, selectedFileName, uploadBtn) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('file-upload-dropzone-active');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('file-upload-dropzone-active');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('file-upload-dropzone-active');
      
      this.handleFileDrop(e, fileInput, selectedFileName, uploadBtn, dropzone);
    });
  },

  // Gestisce drop del file
  handleFileDrop(event, fileInput, selectedFileName, uploadBtn, dropzone) {
    if (event.dataTransfer.files.length) {
      const file = event.dataTransfer.files[0];
      
      if (this.validateFileExtension(file)) {
        fileInput.files = event.dataTransfer.files;
        selectedFileName.textContent = file.name;
        uploadBtn.disabled = false;
        dropzone.classList.add('file-upload-dropzone-active');
      }
    }
  },

  // Valida estensione file
  validateFileExtension(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (!this.config.allowedExtensions.includes(extension)) {
      window.showMessage("Formato file non valido. Carica un file Excel (.xlsx)", "Errore", "error");
      return false;
    }
    return true;
  },

  // Configura bypass per admin
  async setupAdminBypass() {
    const isAdmin = await this.checkAdminPermissions();
    const bypassButton = document.getElementById('bypassCheckBox');
    
    if (isAdmin && bypassButton) {
      bypassButton.style.display = 'inherit';
      bypassButton.addEventListener('click', () => {
        this.toggleBypass(bypassButton);
      });
    }
  },

  // Toggle bypass mode
  toggleBypass(button) {
    button.classList.toggle('active');
    button.innerHTML = button.classList.contains('active') 
      ? '<span class="material-symbols-outlined">warning</span> Bypass Attivo' 
      : '<span class="material-symbols-outlined">warning</span> Bypass Controlli';
  },

  // Verifica permessi admin
  async checkAdminPermissions() {
    try {
      const userData = await window.getUserData();
      return userData?.authenticated && userData?.user_data?.permessi_admin;
    } catch (error) {
      console.error('Errore nel controllo dei permessi:', error);
      return false;
    }
  },

  // Download template Excel
  async downloadTemplate() {
    const username = window.currentUsername;
    const anno = window.AnnoAccademicoManager?.getSelectedAcademicYear();
    
    if (!username) {
      window.showMessage("Devi effettuare il login per scaricare il template", "Attenzione", "warning");
      return;
    }

    const downloadBtn = document.getElementById('downloadTemplateBtn');
    this.setButtonLoading(downloadBtn, true);

    try {
      const response = await fetch(`/api/get-exam-template?docente=${encodeURIComponent(username)}&anno=${encodeURIComponent(anno)}`, {
        method: 'GET',
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      this.downloadBlob(blob, `template_esami_${username}.xlsx`);
      
      window.showMessage("Download del template completato", "Successo", "success");
    } catch (error) {
      console.error('Errore nel download del template:', error);
      window.showMessage("Errore nel download del template. Verifica la connessione e riprova.", "Errore", "error");
    } finally {
      this.setButtonLoading(downloadBtn, false);
    }
  },

  // Gestisce download blob
  downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.setAttribute('download', filename);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    window.URL.revokeObjectURL(url);
  },

  // Gestisce stato loading pulsante
  setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.dataset.originalText = button.innerHTML;
      button.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Generazione...';
      button.disabled = true;
    } else {
      button.innerHTML = button.dataset.originalText || button.innerHTML;
      button.disabled = false;
    }
  },

  // Upload file Excel
  async uploadFile(file) {
    if (!file) {
      window.showMessage("Nessun file selezionato", "Errore", "error");
      return;
    }

    this.initializeUpload();
    
    const formData = this.prepareFormData(file);
    const progressInterval = this.startProgressSimulation();

    try {
      const response = await fetch('/api/import-exams-from-file', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      const data = await response.json();
      this.handleUploadResponse(data);
    } catch (error) {
      clearInterval(progressInterval);
      this.handleUploadError(error);
    }
  },

  // Inizializza UI per upload
  initializeUpload() {
    const progressBar = document.getElementById('uploadProgressBar');
    const progressContainer = document.getElementById('uploadProgress');
    const uploadResult = document.getElementById('uploadResult');
    const uploadBtn = document.getElementById('uploadFileBtn');
    
    uploadBtn.disabled = true;
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    uploadResult.innerHTML = '';
  },

  // Prepara dati per il form
  prepareFormData(file) {
    const formData = new FormData();
    const bypassButton = document.getElementById('bypassCheckBox');
    const bypassChecks = bypassButton?.classList.contains('active');
    const anno = window.AnnoAccademicoManager?.getSelectedAcademicYear();
    
    formData.append('file', file);
    formData.append('anno_accademico', anno);
    
    if (bypassChecks) {
      formData.append('bypass_checks', 'true');
    }
    
    return formData;
  },

  // Simula progresso upload
  startProgressSimulation() {
    const progressBar = document.getElementById('uploadProgressBar');
    let progress = 0;
    
    return setInterval(() => {
      progress += 5;
      if (progress <= 90) {
        progressBar.style.width = `${progress}%`;
      }
    }, this.config.progressUpdateInterval);
  },

  // Gestisce risposta upload
  handleUploadResponse(data) {
    const progressBar = document.getElementById('uploadProgressBar');
    const uploadBtn = document.getElementById('uploadFileBtn');
    
    progressBar.style.width = '100%';
    
    if (data.success) {
            window.showMessage(data.message, "Importazione Completata", "success");
      
      // Ricarica gli eventi del calendario se disponibile
      if (window.forceCalendarRefresh) {
        window.forceCalendarRefresh();
      }
      
      // Ricarica anche il controllo degli esami minimi se disponibile
      if (window.checkEsamiMinimi) {
        window.checkEsamiMinimi();
      }
    } else {
      window.showMessage(data.message, "Importazione Fallita", "error");
    }
    
    this.displayDetailedErrors(data);
    uploadBtn.disabled = false;
  },

  // Gestisce errore upload
  handleUploadError(error) {
    const progressBar = document.getElementById('uploadProgressBar');
    const uploadBtn = document.getElementById('uploadFileBtn');
    
    progressBar.style.width = '100%';
    progressBar.style.backgroundColor = 'var(--color-error)';
    
    window.showMessage(`Errore nella richiesta: ${error.message}`, "Errore", "error");
    uploadBtn.disabled = false;
  },

  // Mostra errori dettagliati
  displayDetailedErrors(data) {
    if (!data.totalErrors || data.totalErrors === 0) return;

    const formatErrors = data.formatErrors || [];
    const insertionErrors = data.insertionErrors || [];
    const totalErrors = data.totalErrors || 0;

    // Se ci sono più di 5 errori, mostra solo il riepilogo
    if (totalErrors > 5) {
      this.showErrorSummary(totalErrors, formatErrors.length, insertionErrors.length);
    } else {
      // Mostra errori specifici per ogni categoria
      this.showSpecificErrors(formatErrors, "Errori di Formato", "error");
      this.showSpecificErrors(insertionErrors, "Errori di Inserimento", "warning");
    }
  },

  // Mostra errori specifici per categoria
  showSpecificErrors(errors, title, type) {
    if (!errors || errors.length === 0) return;

    errors.forEach((error, index) => {
      // Aggiungi un piccolo delay per evitare spam di notifiche
      setTimeout(() => {
        window.showMessage(error, title, type);
      }, index * 100);
    });
  },

  // Mostra riepilogo errori quando sono troppi
  showErrorSummary(totalErrors, formatErrorCount, insertionErrorCount) {
    const summaryMessage = `
      Rilevati ${totalErrors} errori totali durante l'importazione:
      • ${formatErrorCount} errori di formato/validazione
      • ${insertionErrorCount} errori di inserimento
      
      Suggerimento: Prova a importare meno esami per volta o controlla il formato del file.
    `;
    
    window.showMessage(summaryMessage, "Troppi Errori Rilevati", "warning", {
      html: true,
      timeout: 10000 // 10 secondi per il riepilogo
    });
  }
};

// Inizializzazione al caricamento DOM
document.addEventListener('DOMContentLoaded', () => {
  ExamFileImporter.init();
});