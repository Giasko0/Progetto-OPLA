document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formAule");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const formData = new FormData(form);

    fetch("/flask/api/inserisciEsame", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "error") {
          showPopup(data.message);
        } else {
          // In caso di successo, ricarica la pagina (oppure aggiorna il calendario)
          window.location.reload();
        }
      })
      .catch((err) => {
        console.error(err);
        showPopup("Errore di connessione.");
      });
  });
});