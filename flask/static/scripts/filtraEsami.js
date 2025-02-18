document.addEventListener("DOMContentLoaded", () => {
  // Funzioni per la gestione del dropdown
  window.toggleDropdown = function () {
    var menu = document.getElementById("dropdownMenu");
    menu.style.display =
      menu.style.display === "none" || menu.style.display === ""
        ? "block"
        : "none";
  };

  window.toggleCheckbox = function (id) {
    var checkbox = document.getElementById(id);
    checkbox.checked = !checkbox.checked;
  };

  // Carica tutti gli esami al caricamento della pagina
  fetch("/flask/api/filtraEsami")
    .then((response) => response.json())
    .then((events) => {
      if (window.calendar) {
        window.calendar.removeAllEvents();
        events.forEach((ev) => {
          window.calendar.addEvent(ev);
        });
      }
    })
    .catch((error) => {
      console.error("Errore nel caricamento degli esami:", error);
    });

  // Gestione del submit del form per il filtraggio
  var filterForm = document.getElementById("filterForm");
  if (filterForm) {
    filterForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var formData = new FormData(this);
      var params = new URLSearchParams();
      for (let pair of formData.entries()) {
        params.append(pair[0], pair[1]);
      }
      var url = "/flask/api/filtraEsami?" + params.toString();
      fetch(url)
        .then((response) => response.json())
        .then((events) => {
          if (window.calendar) {
            window.calendar.removeAllEvents();
            events.forEach((ev) => {
              window.calendar.addEvent(ev);
            });
          }
        })
        .catch((error) => {
          console.error("Errore nel filtrare esami:", error);
        });
    });
  }

  // Chiude il dropdown quando si clicca fuori
  window.addEventListener("click", (event) => {
    var dropdownButton = document.getElementById("dropdownButton");
    var dropdownMenu = document.getElementById("dropdownMenu");
    if (
      !dropdownButton.contains(event.target) &&
      !dropdownMenu.contains(event.target)
    ) {
      dropdownMenu.style.display = "none";
    }
  });
});
