import {
  createDropdown,
  populateInsegnamentiDropdown,
  loadDateValide,
  formatDateForInput,
  isDateValid,
  updateSessioniDropdown,
  handleDropdownButtonClick,
  setupDropdownClickListeners,
  setupGlobalClickListeners,
  setupCloseHandlers
} from "./calendarUtils.js";

document.addEventListener("DOMContentLoaded", function () {
  window.preloadUserData();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const startYear = currentMonth < 8 ? currentYear : currentYear + 1;
  const dateRange = {
      start: `${startYear}-01-01`,
      end: `${startYear + 1}-04-30`,
      today: today.toISOString().split('T')[0]
  };

  var calendarEl = document.getElementById("calendar");
  let userData = null;
  let currentUsername = null;
  let isAdmin = false;
  let dateValide = [];
  let eventsCache = [];
  let lastFetchTime = 0;
  let disabledDates = new Set();
  let dropdowns = { insegnamenti: null, sessioni: null };
  let calendar = null;
  let miniFormEl = null;
  let tempEvents = {};

  window.forceCalendarRefresh = function () {
    eventsCache = [];
    lastFetchTime = 0;
    if (calendar) calendar.refetchEvents();
  };

  const updateDateValideState = (newDates) => {
    dateValide = newDates;
  };

  function createAulaFields(aule) {
    let html = '';
    for (let i = 0; i < aule.length; i++) {
      html += `
        <div class="aula-field-container" data-index="${i}">
          <select class="aula-select form-input" data-index="${i}">
            <option value="" disabled ${!aule[i] ? 'selected' : ''}>Seleziona aula</option>
            <option value="Aula A" ${aule[i] === 'Aula A' ? 'selected' : ''}>Aula A</option>
            <option value="Aula B" ${aule[i] === 'Aula B' ? 'selected' : ''}>Aula B</option>
            <option value="Aula C" ${aule[i] === 'Aula C' ? 'selected' : ''}>Aula C</option>
            <option value="Aula Magna" ${aule[i] === 'Aula Magna' ? 'selected' : ''}>Aula Magna</option>
            <option value="Laboratorio 1" ${aule[i] === 'Laboratorio 1' ? 'selected' : ''}>Laboratorio 1</option>
            <option value="Laboratorio 2" ${aule[i] === 'Laboratorio 2' ? 'selected' : ''}>Laboratorio 2</option>
          </select>
          <div class="aula-buttons">
            ${i === 0 && aule.length < 4 ? '<button type="button" class="add-aula-btn form-button"><span class="material-symbols-outlined">add</span></button>' : ''}
            ${i > 0 ? '<button type="button" class="remove-aula-btn form-button danger"><span class="material-symbols-outlined">remove</span></button>' : ''}
          </div>
        </div>
      `;
    }
    return html;
  }

  function setupAulaListeners(dateStr) {
    const container = miniFormEl.querySelector('#aulaContainer');
    
    container.addEventListener('change', function(e) {
      if (e.target.classList.contains('aula-select')) {
        updateTempEventAule(dateStr);
      }
    });

    container.addEventListener('click', function(e) {
      if (e.target.closest('.add-aula-btn')) {
        addAulaField(dateStr);
      } else if (e.target.closest('.remove-aula-btn')) {
        removeAulaField(e.target.closest('.aula-field-container'), dateStr);
      }
    });
  }

  function addAulaField(dateStr) {
    const container = miniFormEl.querySelector('#aulaContainer');
    const currentFields = container.querySelectorAll('.aula-field-container');
    
    if (currentFields.length >= 4) return;

    const newIndex = currentFields.length;
    const newFieldHtml = `
      <div class="aula-field-container" data-index="${newIndex}">
        <select class="aula-select form-input" data-index="${newIndex}">
          <option value="" disabled selected>Seleziona aula</option>
          <option value="Aula A">Aula A</option>
          <option value="Aula B">Aula B</option>
          <option value="Aula C">Aula C</option>
          <option value="Aula Magna">Aula Magna</option>
          <option value="Laboratorio 1">Laboratorio 1</option>
          <option value="Laboratorio 2">Laboratorio 2</option>
        </select>
        <div class="aula-buttons">
          <button type="button" class="remove-aula-btn form-button danger"><span class="material-symbols-outlined">remove</span></button>
        </div>
      </div>
    `;

    if (newIndex === 3) {
      const firstAddBtn = container.querySelector('.add-aula-btn');
      if (firstAddBtn) firstAddBtn.remove();
    }

    container.insertAdjacentHTML('beforeend', newFieldHtml);
    updateTempEventAule(dateStr);
  }

  function removeAulaField(fieldContainer, dateStr) {
    const container = miniFormEl.querySelector('#aulaContainer');
    const currentFields = container.querySelectorAll('.aula-field-container');
    
    if (currentFields.length <= 1) return;

    fieldContainer.remove();
    
    const remainingFields = container.querySelectorAll('.aula-field-container');
    remainingFields.forEach((field, index) => {
      field.dataset.index = index;
      const select = field.querySelector('.aula-select');
      select.dataset.index = index;
      
      const buttonsDiv = field.querySelector('.aula-buttons');
      buttonsDiv.innerHTML = '';
      if (index === 0 && remainingFields.length < 4) {
        buttonsDiv.innerHTML += '<button type="button" class="add-aula-btn form-button"><span class="material-symbols-outlined">add</span></button>';
      }
      if (index > 0) {
        buttonsDiv.innerHTML += '<button type="button" class="remove-aula-btn form-button danger"><span class="material-symbols-outlined">remove</span></button>';
      }
    });

    updateTempEventAule(dateStr);
  }

  function updateTempEventAule(dateStr) {
    const aulaSelects = miniFormEl.querySelectorAll('.aula-select');
    const aule = Array.from(aulaSelects).map(select => select.value).filter(value => value);
    
    if (tempEvents[dateStr]) {
      tempEvents[dateStr].aule = aule;
      
      const ev = calendar.getEventById(tempEvents[dateStr].id);
      if (ev) {
        ev.setExtendedProp('aule', aule);
        calendar.getEventById(tempEvents[dateStr].id).remove();
        calendar.addEvent({
          id: tempEvents[dateStr].id,
          title: 'Nuovo esame',
          start: dateStr,
          allDay: true,
          backgroundColor: 'var(--color-light-blue)',
          textColor: 'var(--color-bg)',
          borderColor: 'var(--color-light-blue)',
          editable: false,
          extendedProps: {
            isTemporary: true,
            data: dateStr,
            ora: '00:00',
            aule: aule,
            docenteUsername: currentUsername
          }
        });
      }
    }
    updateTempExamsSection();
  }

  function aggiornaDateDisabilitate() {
    disabledDates.clear();
    const tempDates = Object.keys(tempEvents);
    if (tempDates.length === 0) return;
    const start = calendar.view.activeStart;
    const end = calendar.view.activeEnd;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dStr = formatDateForInput(d);
      let disable = false;
      for (const temp of tempDates) {
        if (temp === dStr) continue;
        const tempTime = new Date(temp).getTime();
        const dTime = d.getTime();
        const diffDays = Math.abs((tempTime - dTime) / (1000 * 3600 * 24));
        if (diffDays < 14) {
          disable = true;
          break;
        }
      }
      if (disable) disabledDates.add(dStr);
    }
  }

  function updateTempExamsSection() {
    const tempExamsSection = document.getElementById('tempExamsSection');
    const tempExamsList = document.getElementById('tempExamsList');
    
    if (!tempExamsSection || !tempExamsList) return;

    const tempDates = Object.keys(tempEvents);
    
    if (tempDates.length === 0) {
      tempExamsSection.style.display = 'none';
      return;
    }

    tempExamsSection.style.display = 'block';
    tempExamsList.innerHTML = '';

    tempDates.forEach(dateStr => {
      const temp = tempEvents[dateStr];
      const aule = temp.aule || [];
      const aulaText = aule.length > 0 ? aule.join(', ') : 'Nessuna aula selezionata';
      
      const examDiv = document.createElement('div');
      examDiv.className = 'temp-exam-item';
      examDiv.innerHTML = `
        <div class="temp-exam-info">
          <strong>Data:</strong> ${dateStr}<br>
          <strong>Aule:</strong> ${aulaText}
        </div>
        <button type="button" class="remove-temp-exam form-button danger" data-date="${dateStr}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      `;
      
      tempExamsList.appendChild(examDiv);
    });

    tempExamsList.removeEventListener('click', handleTempExamRemove);
    tempExamsList.addEventListener('click', handleTempExamRemove);
  }

  function handleTempExamRemove(e) {
    if (e.target.closest('.remove-temp-exam')) {
      const dateStr = e.target.closest('.remove-temp-exam').dataset.date;
      if (tempEvents[dateStr]) {
        const evId = tempEvents[dateStr].id;
        if (calendar.getEventById(evId)) calendar.getEventById(evId).remove();
        delete tempEvents[dateStr];
        aggiornaDateDisabilitate();
        calendar.render();
        updateTempExamsSection();
      }
    }
  }

  function showMiniFormBubble(info, dateStr) {
    if (miniFormEl) {
      miniFormEl.remove();
      miniFormEl = null;
    }
    miniFormEl = document.createElement('div');
    miniFormEl.className = 'mini-form-bubble';
    const temp = tempEvents[dateStr] || {};
    const aule = temp.aule || [''];
    
    miniFormEl.innerHTML = `
      <div class="mini-form-arrow"></div>
      <form id="miniForm">
        <label for="miniFormDate">Data:</label>
        <input type="text" id="miniFormDate" name="data" value="${dateStr}" readonly class="form-input"><br>
        <label>Aule:</label>
        <div id="aulaContainer">
          ${createAulaFields(aule)}
        </div>
        <div class="mini-form-actions">
          <button type="button" id="miniFormDelete" class="form-button danger">Elimina</button>
        </div>
      </form>
    `;
    document.body.appendChild(miniFormEl);

    setupAulaListeners(dateStr);

    const cellElement = info.dayEl;
    const jsEvent = info.jsEvent;
    const arrow = miniFormEl.querySelector('.mini-form-arrow');

    if (!cellElement) {
      miniFormEl.style.top = (jsEvent.clientY + window.scrollY + 10) + 'px';
      miniFormEl.style.left = (jsEvent.clientX + window.scrollX + 10) + 'px';
    } else {
      const cellRect = cellElement.getBoundingClientRect();
      miniFormEl.style.left = (cellRect.right + window.scrollX + 10) + 'px';
      miniFormEl.style.top = (cellRect.top + window.scrollY + 5) + 'px';
    }

    miniFormEl.querySelector('#miniFormDelete').onclick = function() {
      miniFormEl.remove();
      miniFormEl = null;
      if (tempEvents[dateStr]) {
        const evId = tempEvents[dateStr].id;
        if (calendar.getEventById(evId)) calendar.getEventById(evId).remove();
        delete tempEvents[dateStr];
      }
      aggiornaDateDisabilitate();
      calendar.render();
      updateTempExamsSection();
    };
  }

  function deleteEsame(examId) {
    if (!examId) return;
    if (!confirm("Sei sicuro di voler eliminare questo esame?")) return;

    fetch('/api/deleteEsame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: examId }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.showMessage("Esame eliminato con successo", "Successo", "success");
          const popupOverlay = document.getElementById("popupOverlay");
          if (popupOverlay) popupOverlay.style.display = "none";
          window.forceCalendarRefresh();
        } else {
          window.showMessage(data.message || "Errore nell'eliminazione dell'esame", "Errore", "error");
        }
      })
      .catch(error => {
        console.error("Errore nella richiesta di eliminazione:", error);
        window.showMessage("Errore nella richiesta di eliminazione", "Errore", "error");
      });
  }
  window.deleteEsame = deleteEsame;
  window.updateTempExamsSection = updateTempExamsSection;

  // Inizializza calendario
  window.getUserData().then(data => {
    userData = data;
    currentUsername = data?.user_data?.username;
    isAdmin = data?.authenticated && data?.user_data?.permessi_admin;

    Promise.all([
      loadDateValide(currentUsername),
      window.InsegnamentiManager?.loadInsegnamenti(currentUsername) || Promise.resolve([])
    ])
      .then(([dateValideResponse]) => {
        dateValide = dateValideResponse;
        dropdowns.sessioni = createDropdown("sessioni");
        dropdowns.insegnamenti = createDropdown("insegnamenti");
        updateSessioniDropdown(dropdowns.sessioni, dateValide);

        calendar = new FullCalendar.Calendar(calendarEl, {
          contentHeight: 600,
          locale: "it",
          initialView: 'multiMonthList',
          duration: { months: 16 },
          initialDate: dateRange.start,
          validRange: dateRange,
          selectable: true,

          views: {
            multiMonthList: { type: 'multiMonth', buttonText: 'Lista', multiMonthMaxColumns: 1 },
            multiMonthGrid: { type: 'multiMonth', buttonText: 'Griglia', multiMonthMaxColumns: 3 },
            listaEventi: { type: 'listYear', duration: { years: 2 }, buttonText: 'Eventi' }
          },

          events: function (fetchInfo, successCallback, failureCallback) {
            const currentTime = new Date().getTime();
            if (eventsCache.length > 0 && currentTime - lastFetchTime < 300000) {
              successCallback(eventsCache.filter(ev => ev && ev.start));
              return;
            }

            let params = new URLSearchParams();
            params.append("docente", currentUsername);
            if (window.InsegnamentiManager) {
              const selected = window.InsegnamentiManager.getSelectedCodes();
              if (selected.length > 0) params.append("insegnamenti", selected.join(","));
            }

            fetch(`/api/getEsami?${params.toString()}`)
              .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
              .then(events => {
                const validEvents = (events || []).filter(ev => ev && ev.start);
                eventsCache = validEvents;
                lastFetchTime = currentTime;
                successCallback(validEvents);
              })
              .catch(error => {
                console.error("Errore caricamento esami:", error);
                failureCallback(error);
              });
          },

          headerToolbar: {
            left: "pulsanteInsegnamenti pulsanteSessioni",
            center: "multiMonthList,multiMonthGrid,listaEventi",
            right: "aggiungiEsame"
          },

          customButtons: {
            pulsanteSessioni: {
              text: "Sessioni",
              click: (e) => handleDropdownButtonClick(e, "sessioni", calendar, dropdowns)
            },
            pulsanteInsegnamenti: {
              text: "Insegnamenti",
              click: (e) => handleDropdownButtonClick(e, "insegnamenti", calendar, dropdowns, () => {
                if (window.InsegnamentiManager) {
                  populateInsegnamentiDropdown(dropdowns.insegnamenti, currentUsername);
                } else {
                  dropdowns.insegnamenti.innerHTML = "<div class='dropdown-error'>Manager non disponibile</div>";
                }
              })
            },
            aggiungiEsame: {
              text: "Importa da file",
              click: () => alert("Funzionalità di import non ancora implementata.")
            }
          },

          weekends: false,
          displayEventTime: true,
          eventDisplay: "block",
          eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },

          dateClick: function (info) {
            const selDate = info.date;
            const selDateFormatted = formatDateForInput(selDate);

            if (disabledDates.has(selDateFormatted)) {
              window.showMessage("Non puoi inserire un esame in questa data per vincoli di distanza.", "Attenzione", "notification");
              return;
            }

            if (!isAdmin && !isDateValid(selDate, dateValide).isValid) {
              window.showMessage(isDateValid(selDate, dateValide).message, "Informazione", "notification");
              return;
            }

            // Controlli distanza esami temporanei
            const tempDates = Object.keys(tempEvents);
            for (const temp of tempDates) {
              const diffDays = Math.abs((new Date(temp).getTime() - selDate.getTime()) / (1000 * 3600 * 24));
              if (diffDays < 14 || temp === selDateFormatted) {
                window.showMessage("Non puoi inserire due esami temporanei a meno di 14 giorni.", "Attenzione", "notification");
                return;
              }
            }

            if (miniFormEl) {
              miniFormEl.remove();
              miniFormEl = null;
            }

            if (!tempEvents[selDateFormatted]) {
              const tempId = 'temp-' + selDateFormatted + '-' + Date.now();
              tempEvents[selDateFormatted] = {
                id: tempId,
                data: selDateFormatted,
                aule: [''],
                docenteUsername: currentUsername
              };
              
              calendar.addEvent({
                id: tempId,
                title: 'Nuovo esame',
                start: selDateFormatted,
                allDay: true,
                backgroundColor: 'var(--color-light-blue)',
                textColor: 'var(--color-bg)',
                borderColor: 'var(--color-light-blue)',
                editable: false,
                extendedProps: {
                  isTemporary: true,
                  data: selDateFormatted,
                  aule: [''],
                  docenteUsername: currentUsername
                }
              });
              
              aggiornaDateDisabilitate();
              calendar.render();
            }

            window.EsameForm.showForm({ date: selDateFormatted }, false);
            updateTempExamsSection();
            
            setTimeout(() => showMiniFormBubble(info, selDateFormatted), 100);
          },

          eventClick: function (info) {
            const isTemporary = info.event.extendedProps.isTemporary;
            if (isTemporary) {
              const dateStr = info.event.extendedProps.data;
              if (dateStr) showMiniFormBubble({ jsEvent: info.jsEvent, dayEl: null }, dateStr);
              return;
            }

            const eventDocente = info.event.extendedProps.docente || info.event.extendedProps.docenteUsername;
            if (eventDocente !== currentUsername && !isAdmin) {
              window.showMessage("Non hai i permessi per modificare esami di un altro docente", "Permesso negato", "notification");
              return;
            }

            if (window.EsameForm) {
              fetch(`/api/getEsameById?id=${info.event.id}`)
                .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
                .then(data => {
                  if (data.success && data.esame) {
                    window.EsameForm.showForm(data.esame, true);
                  } else {
                    window.showMessage(data.message || "Esame non trovato", "Errore", "error");
                  }
                })
                .catch(error => {
                  console.error("Errore caricamento esame:", error);
                  window.showMessage("Errore nel caricamento dei dettagli dell'esame", "Errore", "error");
                });
            }
          },

          eventContent: function (arg) {
            const event = arg.event;
            const isTemporary = event.extendedProps.isTemporary;

            if (isTemporary) {
              const aule = event.extendedProps.aule || [];
              const aulaText = aule.length > 0 ? aule.join(', ') : '&nbsp;';
              return {
                html: `<div class="fc-event-main-frame">
                  <div class="fc-event-title">${event.title}</div>
                  <div class="fc-event-description">${event.extendedProps.data}</div>
                  <div class="fc-event-description">${aulaText}</div>
                </div>`
              };
            }

            const docenteNome = event.extendedProps.docenteNome || 'Docente non specificato';
            const isProvaParziale = event.extendedProps.tipo_appello === 'PP';
            const titolo = isProvaParziale ? `${event.title} (Parziale)` : event.title;

            return {
              html: `<div class="fc-event-main-frame">
                ${arg.timeText ? `<div class="fc-event-time">${arg.timeText}</div>` : ''}
                <div class="fc-event-title">${titolo}</div>
                <div class="fc-event-description">${docenteNome}</div>
              </div>`
            };
          },

          dayCellClassNames: function (arg) {
            const cellDate = new Date(arg.date.getTime());
            cellDate.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (cellDate < today) return ['fc-disabled-day'];

            if (!isAdmin) {
              const dataValida = dateValide.some(([start, end]) => {
                const startDate = new Date(start);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(end);
                endDate.setHours(23, 59, 59, 999);
                return cellDate >= startDate && cellDate <= endDate;
              });
              if (!dataValida) return ["fc-disabled-day"];
            }

            const cellDateFormatted = formatDateForInput(cellDate);
            if (disabledDates.has(cellDateFormatted)) return ["fc-disabled-day"];
            
            return [];
          }
        });

        setupDropdownClickListeners(calendar, dropdowns, currentUsername, updateDateValideState, dateRange);
        setupGlobalClickListeners(dropdowns);
        calendar.render();
        window.calendar = calendar;

        if (window.InsegnamentiManager) {
          let debounceTimer;
          window.InsegnamentiManager.onChange(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              loadDateValide(currentUsername)
                .then(newDates => {
                  dateValide = newDates;
                  updateSessioniDropdown(dropdowns.sessioni, dateValide);
                  eventsCache = [];
                  lastFetchTime = 0;
                  calendar.refetchEvents();
                });
            }, 300);
          });
        }
      })
      .catch(error => {
        console.error("Errore inizializzazione calendario:", error);
        if (calendarEl) {
          calendarEl.innerHTML = '<div class="error-message">Errore durante il caricamento del calendario.</div>';
        }
      });
  });

  setupCloseHandlers(calendar);
});
