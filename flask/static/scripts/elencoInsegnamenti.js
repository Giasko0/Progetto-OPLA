document.addEventListener("DOMContentLoaded", () => {
  // Function to get a cookie by name
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return null;
  }

  // Ottieni informazioni sull'utente autenticato
  fetch('/flask/api/check-auth')
    .then(response => response.json())
    .then(data => {
      if (!data.authenticated) {
        console.error("L'utente non sembra essere loggato");
        return;
      }

      const username = data.username;

      // Send a GET request to the server with the username
      fetch(
        `/flask/api/ottieniInsegnamenti?username=${encodeURIComponent(username)}`
      )
        .then((response) => {
          if (!response.ok) {
            throw new Error("Il server non risponde :(");
          }
          return response.json();
        })
        .then((insegnamenti) => {
          const select = document.getElementById("insegnamento");
          if (!select) {
            console.error('Non riesco a trovare la select con id "insegnamento"');
            return;
          }

          if (insegnamenti.length === 1) {
            select.value = insegnamenti[0];
          }

          // Populate the select with the array of insegnamenti
          insegnamenti.forEach((insegnamento) => {
            const option = document.createElement("option");
            option.value = insegnamento;
            option.textContent = insegnamento;
            select.appendChild(option);
          });
        })
        .catch((error) => {
          console.error("Errore nel caricamento degli insegnamenti:", error);
        });
    })
    .catch(error => {
      console.error("Errore nel controllo dell'autenticazione:", error);
      // Fallback al metodo vecchio
      const username = getCookie("username");

      if (!username) {
        console.error("L'utente non sembra essere loggato");
        return;
      }

      // Send a GET request to the server with the username
      fetch(
        `/flask/api/ottieniInsegnamenti?username=${encodeURIComponent(username)}`
      )
        .then((response) => {
          if (!response.ok) {
            throw new Error("Il server non risponde :(");
          }
          return response.json();
        })
        .then((insegnamenti) => {
          const select = document.getElementById("insegnamento");
          if (!select) {
            console.error('Non riesco a trovare la select con id "insegnamento"');
            return;
          }

          if (insegnamenti.length === 1) {
            select.value = insegnamenti[0];
          }

          // Populate the select with the array of insegnamenti
          insegnamenti.forEach((insegnamento) => {
            const option = document.createElement("option");
            option.value = insegnamento;
            option.textContent = insegnamento;
            select.appendChild(option);
          });
        })
        .catch((error) => {
          console.error("Errore fetch insegnamenti:", error);
        });
    });
});
