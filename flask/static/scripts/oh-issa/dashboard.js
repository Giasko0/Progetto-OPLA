document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("downloadCsv").addEventListener("click", function () {
    window.location.href = "/flask/admin/downloadCsv";
  });

  document
    .getElementById("downloadCalendar")
    .addEventListener("click", function () {
      window.location.href = "/flask/admin/downloadCalendar";
    });

  // Implementazione del caricamento del file insegnamenti
  document
    .getElementById("uploadTeachings")
    .addEventListener("click", function () {
      document.getElementById("teachingsFileInput").click();
    });

  document
    .getElementById("teachingsFileInput")
    .addEventListener("change", function (e) {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);

        fetch("/flask/admin/upload-teachings", {
          method: "POST",
          body: formData,
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.status === "success") {
              alert(data.message);
            } else {
              alert("Errore: " + data.message);
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            alert("Si è verificato un errore durante il caricamento del file.");
          });
      }
    });

  // Implementazione del caricamento del file docenti
  document
    .getElementById("uploadTeachers")
    .addEventListener("click", function () {
      document.getElementById("teachersFileInput").click();
    });

  document
    .getElementById("teachersFileInput")
    .addEventListener("change", function (e) {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);

        fetch("/flask/admin/upload-teachers", {
          method: "POST",
          body: formData,
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.status === "success") {
              alert(data.message);
            } else {
              alert("Errore: " + data.message);
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            alert("Si è verificato un errore durante il caricamento del file.");
          });
      }
    });

  document
    .getElementById("editSessions")
    .addEventListener("click", function () {
      // Implementare la logica per la modifica delle sessioni
    });

  document
    .getElementById("settingsForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      // Implementare la logica per il salvataggio delle impostazioni
    });

  // Event listener per i pulsanti di truncate
  document.querySelectorAll(".truncate-btn").forEach((button) => {
    button.addEventListener("click", function () {
      const table = this.getAttribute("data-table");
      if (
        confirm(
          `Sei sicuro di voler svuotare la tabella ${table}? Questa operazione non può essere annullata.`
        )
      ) {
        fetch(`/flask/admin/truncate-table/${table}`, {
          method: "POST",
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.status === "success") {
              alert(data.message);
            } else {
              alert("Errore: " + data.message);
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            alert("Si è verificato un errore durante l'operazione.");
          });
      }
    });
  });
});
