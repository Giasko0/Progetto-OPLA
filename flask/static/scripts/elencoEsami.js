function insertEsami() {
    fetch('/flask/api/ottieniEsami')
    .then(response => response.json())
    .then(data => {
        let table = document.getElementById("corpoTabella");
        data.forEach(esame => {
            // Creazione di una nuova riga
            let row = table.insertRow(-1);

            let docente = row.insertCell(0);
            let insegnamento = row.insertCell(1);
            let aula = row.insertCell(2);
            let data = row.insertCell(3);
            
            docente.innerHTML = esame.docente;
            insegnamento.innerHTML = esame.title;
            aula.innerHTML = esame.aula;
            data.innerHTML = esame.start;
        });
    });
}    