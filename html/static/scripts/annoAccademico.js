// Gestione unificata dell'anno accademico
class AnnoAccademicoManager {
  constructor() {
    this.selectedYear = null;
    this.callbacks = [];
  }

  // Funzioni per gestire i cookie
  setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  }

  getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  // Ottieni l'anno selezionato
  getSelectedAcademicYear() {
    return this.selectedYear || this.getCookie('selectedAcademicYear') || null;
  }

  // Imposta l'anno selezionato
  setSelectedAcademicYear(year) {
    this.selectedYear = year;
    window.selectedAcademicYear = year;
    this.setCookie('selectedAcademicYear', year, 365);
    
    // Chiama tutti i callback registrati
    this.callbacks.forEach(callback => {
      try {
        callback(year);
      } catch (error) {
        console.error('Errore nel callback dell\'anno accademico:', error);
      }
    });
  }

  // Inizializza l'anno dai cookie
  initSelectedAcademicYear() {
    const savedYear = this.getCookie('selectedAcademicYear');
    if (savedYear) {
      this.selectedYear = savedYear;
      window.selectedAcademicYear = savedYear;
    }
    return savedYear;
  }

  // Registra un callback per il cambio anno
  onYearChange(callback) {
    this.callbacks.push(callback);
  }

  // Crea il componente HTML completo del dropdown
  createDropdownHTML(containerId, selectId = 'annoAccademicoSelect', label = 'Anno Accademico:') {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container con ID '${containerId}' non trovato`);
      return Promise.reject(new Error(`Container ${containerId} non trovato`));
    }

    container.innerHTML = `
      <div class="anno-accademico-container">
        <label for="${selectId}">${label}</label>
        <select id="${selectId}" class="anno-accademico-select">
          <option value="">Seleziona anno</option>
        </select>
      </div>
    `;

    return this.setupDropdown(selectId);
  }

  // Setup del dropdown esistente
  async setupDropdown(selectId = 'annoAccademicoSelect') {
    const select = document.getElementById(selectId);
    if (!select) {
      console.warn(`Elemento con ID '${selectId}' non trovato`);
      return;
    }

    try {
      const response = await fetch('/api/get-anni-accademici');
      if (!response.ok) throw new Error('Errore nel caricamento degli anni accademici');
      
      const anni = await response.json();
      select.innerHTML = '<option value="">Seleziona anno</option>';
      anni.forEach(anno => {
        const option = document.createElement('option');
        option.value = String(anno);
        option.textContent = `${anno}/${anno + 1}`;
        select.appendChild(option);
      });

      // Logica di selezione automatica
      let selectedYear = this.getSelectedAcademicYear();
      if (!selectedYear) {
        const now = new Date();
        let annoCorrente = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
        if (anni.includes(annoCorrente)) {
          selectedYear = annoCorrente;
        } else if (anni.length > 0) {
          selectedYear = anni[anni.length - 1];
        }
        if (selectedYear) {
          this.setSelectedAcademicYear(selectedYear);
        }
      }
      selectedYear = String(selectedYear);

      // Rimuovi listener esistenti per evitare duplicati
      const clonedSelect = select.cloneNode(true);
      select.parentNode.replaceChild(clonedSelect, select);

      // Imposta il valore selezionato DOPO la sostituzione
      if (selectedYear && Array.from(clonedSelect.options).some(opt => opt.value === selectedYear)) {
        clonedSelect.value = selectedYear;
      }

      clonedSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        if (selectedValue) {
          this.setSelectedAcademicYear(selectedValue);
        }
      });

      return clonedSelect;

    } catch (error) {
      console.error('Errore nel setup del dropdown anno accademico:', error);
      select.innerHTML = '<option value="">Errore nel caricamento</option>';
      throw error;
    }
  }

  // Inizializza automaticamente il dropdown se esiste nel DOM
  autoInit(selectId = 'annoAccademicoSelect') {
    const select = document.getElementById(selectId);
    if (select) {
      this.setupDropdown(selectId);
    }
  }
}

// Crea istanza globale
const annoAccademico = new AnnoAccademicoManager();

// Auto-inizializzazione quando il DOM è pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    annoAccademico.initSelectedAcademicYear();
  });
} else {
  annoAccademico.initSelectedAcademicYear();
}

// Esporta solo nel namespace globale
window.AnnoAccademicoManager = annoAccademico;

export default annoAccademico;
