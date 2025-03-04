document.addEventListener("DOMContentLoaded", () => {
  // Calcola l'anno accademico corrente
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
  const anno_accademico = currentMonth >= 9 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  
  // Imposta l'anno accademico nel campo hidden
  document.getElementById('anno_accademico').value = anno_accademico;

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
  
  // Funzione per popolare il selettore degli insegnamenti con titolo visibile e codice come value
  function popolaInsegnamenti() {
    const username = document.getElementById('docente').value;
    if (username) {
      fetch('/flask/api/ottieniInsegnamenti?username=' + username)
        .then(response => response.json())
        .then(data => {
          const select = document.getElementById('insegnamento');
          // Mantieni solo l'opzione placeholder
          while (select.options.length > 1) {
            select.remove(1);
          }
          // Aggiungi le opzioni degli insegnamenti
          data.forEach(ins => {
            const option = document.createElement('option');
            option.value = ins.codice; // Usa il codice come valore
            option.textContent = ins.titolo; // Mostra il titolo come testo
            select.appendChild(option);
          });
        })
        .catch(error => console.error('Errore nel caricamento degli insegnamenti:', error));
    }
  }
  
  // Esegui funzioni di popolamento
  popolaAule();
  popolaInsegnamenti();

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
