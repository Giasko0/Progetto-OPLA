document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("downloadFileESSE3").addEventListener("click", function () {
    window.location.href = "/api/oh-issa/download-file-esse3";
  });

  // Gestione upload file unificato
  document.getElementById("uploadFile").addEventListener("click", function () {
    document.getElementById("fileInput").click();
  });

  document.getElementById("fileInput").addEventListener("change", function (e) {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      fetch("/api/oh-issa/upload-file", {
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

  // Gestione form date CdS
  document.getElementById("cdsSettingsForm").addEventListener("submit", function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());

    fetch("/api/oh-issa/save-cds-dates", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    })
    .then((response) => response.json())
    .then((data) => {
        if (data.status === "success") {
            alert("Date salvate con successo!");
        } else {
            alert("Errore: " + data.message);
        }
    })
    .catch((error) => {
        console.error("Error:", error);
        alert("Si è verificato un errore durante il salvataggio delle date.");
    });
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
        fetch(`/api/oh-issa/truncate-table/${table}`, {
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
