document.addEventListener("DOMContentLoaded", () => {
  // Funzione per popolare la select con le aule
  function popolaAule() {
    fetch("/flask/api/ottieniAule")
      .then((response) => response.json())
      .then((aule) => {
        const selectAula = document.getElementById("aula");
        // Imposta la prima option di default
        selectAula.innerHTML =
          '<option value="" disabled selected hidden>Scegli l\'aula</option>';
        aule.forEach((aula) => {
          let option = document.createElement("option");
          option.value = aula;
          option.textContent = aula;
          selectAula.appendChild(option);
        });
      })
      .catch((error) =>
        console.error("Errore nel recupero delle aule:", error)
      );
  }
  popolaAule();

  // Funzione per gestire le opzioni avanzate
  const pulsanteAdv = document.getElementById("buttonOpzioniAvanzate");
  pulsanteAdv.addEventListener("click", function () {
    const opzioni = document.getElementById("opzioniAvanzate");
    if (opzioni.style.display === "grid") {
      opzioni.style.display = "none";
      pulsanteAdv.innerHTML = "Opzioni avanzate &#x25BA;"; // freccia verso destra
    } else {
      opzioni.style.display = "grid";
      pulsanteAdv.innerHTML = "Opzioni avanzate &#x25BC;"; // freccia verso il basso
    }
  });

  // Funzione per inviare al server i dati del form
  const form = document.getElementById("formEsame");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const formData = new FormData(this);

    fetch("/flask/api/inserisciEsame", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "error") {
          showPopup(data.message);
        } else {
          window.location.reload();
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Si è verificato un errore durante l'inserimento dell'esame");
      });
  });
});
