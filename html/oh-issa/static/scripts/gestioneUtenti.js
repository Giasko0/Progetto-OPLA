/**
 * Script per la gestione degli utenti
 */
document.addEventListener('DOMContentLoaded', function() {
    // Carica gli utenti quando la pagina è pronta
    loadUsers();
    
    // Inizializza i filtri di ricerca
    initFilters();
    
    // Inizializza gli eventi per il modal di conferma eliminazione
    initDeleteModal();
    initAdminModal();
});

/**
 * Carica la lista degli utenti dal server
 */
function loadUsers() {
    showLoading(true);
    
    fetch('/api/oh-issa/getUsers')
        .then(response => {
            if (!response.ok) {
                throw new Error('Errore nel caricamento degli utenti');
            }
            return response.json();
        })
        .then(users => {
            populateUsersTable(users);
            showLoading(false);
        })
        .catch(error => {
            console.error('Errore:', error);
            showMessage('error', 'Si è verificato un errore durante il caricamento degli utenti.');
            showLoading(false);
        });
}

/**
 * Popola la tabella con i dati degli utenti
 */
function populateUsersTable(users) {
    const tableBody = document.querySelector('#usersTable tbody');
    const noUsersFound = document.getElementById('noUsersFound');
    
    tableBody.innerHTML = '';
    
    if (users.length === 0) {
        noUsersFound.style.display = 'block';
        return;
    }
    
    noUsersFound.style.display = 'none';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        
        // Username
        const usernameCell = document.createElement('td');
        usernameCell.textContent = user.username;
        row.appendChild(usernameCell);
        
        // Matricola
        const matricolaCell = document.createElement('td');
        matricolaCell.textContent = user.matricola;
        row.appendChild(matricolaCell);
        
        // Nome
        const nomeCell = document.createElement('td');
        nomeCell.textContent = user.nome || '-';
        row.appendChild(nomeCell);
        
        // Cognome
        const cognomeCell = document.createElement('td');
        cognomeCell.textContent = user.cognome || '-';
        row.appendChild(cognomeCell);
        
        // Permessi Docente
        const docenteCell = document.createElement('td');
        docenteCell.className = 'centered';
        const docenteCheckbox = document.createElement('input');
        docenteCheckbox.type = 'checkbox';
        docenteCheckbox.checked = user.permessi_docente;
        docenteCheckbox.disabled = true; // I permessi docente non sono modificabili direttamente
        docenteCell.appendChild(docenteCheckbox);
        row.appendChild(docenteCell);
        
        // Permessi Admin
        const adminCell = document.createElement('td');
        adminCell.className = 'centered';
        const adminCheckbox = document.createElement('input');
        adminCheckbox.type = 'checkbox';
        adminCheckbox.checked = user.permessi_admin;
        adminCheckbox.dataset.username = user.username;
        adminCheckbox.dataset.nome = user.nome || '';
        adminCheckbox.dataset.cognome = user.cognome || '';
        adminCheckbox.addEventListener('change', function(e) {
            // Ripristina il valore originale finché non viene confermato
            e.target.checked = user.permessi_admin;
            // Mostra il modal di conferma
            showAdminConfirmation(user.username, user.nome, user.cognome, !user.permessi_admin);
        });
        adminCell.appendChild(adminCheckbox);
        row.appendChild(adminCell);
        
        // Azioni (Elimina)
        const actionsCell = document.createElement('td');
        actionsCell.className = 'actions-cell';
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn danger small';
        deleteButton.textContent = 'Elimina';
        deleteButton.dataset.username = user.username;
        deleteButton.dataset.nome = user.nome;
        deleteButton.dataset.cognome = user.cognome;
        deleteButton.addEventListener('click', showDeleteConfirmation);
        actionsCell.appendChild(deleteButton);
        row.appendChild(actionsCell);
        
        // Aggiungi la riga alla tabella
        tableBody.appendChild(row);
    });
    
    // Applica filtri correnti
    applyFilters();
}

/**
 * Inizializza i filtri di ricerca
 */
function initFilters() {
    const searchInput = document.getElementById('searchUser');
    const showOnlyAdminsCheckbox = document.getElementById('showOnlyAdmins');
    
    searchInput.addEventListener('input', applyFilters);
    showOnlyAdminsCheckbox.addEventListener('change', applyFilters);
}

/**
 * Applica i filtri alla tabella degli utenti
 */
function applyFilters() {
    const searchQuery = document.getElementById('searchUser').value.toLowerCase();
    const showOnlyAdmins = document.getElementById('showOnlyAdmins').checked;
    const rows = document.querySelectorAll('#usersTable tbody tr');
    
    let visibleCount = 0;
    
    rows.forEach(row => {
        const username = row.cells[0].textContent.toLowerCase();
        const nome = row.cells[2].textContent.toLowerCase();
        const cognome = row.cells[3].textContent.toLowerCase();
        const isAdmin = row.cells[5].querySelector('input').checked;
        
        // Applica filtro di ricerca
        const matchesSearch = username.includes(searchQuery) || 
                             nome.includes(searchQuery) || 
                             cognome.includes(searchQuery);
        
        // Applica filtri checkbox
        const matchesAdminFilter = !showOnlyAdmins || isAdmin;
        
        // Mostra/nascondi la riga in base ai filtri
        const shouldShow = matchesSearch && matchesAdminFilter;
        row.style.display = shouldShow ? '' : 'none';
        
        if (shouldShow) {
            visibleCount++;
        }
    });
    
    // Mostra messaggio se non ci sono risultati
    document.getElementById('noUsersFound').style.display = visibleCount === 0 ? 'block' : 'none';
}

/**
 * Aggiorna i permessi di admin per un utente
 */
function toggleAdminPermission(username, isAdmin) {
    fetch('/api/oh-issa/updateUserAdmin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: username,
            permessi_admin: isAdmin
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showMessage('success', `Permessi amministratore ${isAdmin ? 'concessi a' : 'rimossi da'} ${username}`);
            // Ricarica la lista per aggiornare l'interfaccia
            loadUsers();
        } else {
            showMessage('error', data.message);
        }
    })
    .catch(error => {
        console.error('Errore:', error);
        showMessage('error', 'Si è verificato un errore durante l\'aggiornamento dei permessi.');
    });
}

/**
 * Inizializza il modal per la conferma dell'eliminazione
 */
function initDeleteModal() {
    const modal = document.getElementById('deleteConfirmModal');
    const cancelButton = document.getElementById('cancelDelete');
    
    cancelButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

/**
 * Inizializza il modal per la conferma dei permessi admin
 */
function initAdminModal() {
    const modal = document.getElementById('adminConfirmModal');
    const cancelButton = document.getElementById('cancelAdmin');
    
    cancelButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

/**
 * Mostra il modal di conferma per i permessi admin
 */
function showAdminConfirmation(username, nome, cognome, isGranting) {
    const modal = document.getElementById('adminConfirmModal');
    const userInfoText = nome && cognome ? 
        `Utente: ${username} (${nome} ${cognome})` : 
        `Utente: ${username}`;
    
    document.getElementById('adminUserInfo').textContent = userInfoText;
    document.getElementById('adminActionText').textContent = isGranting ? 
        'Sei sicuro di voler concedere i permessi di amministratore?' :
        'Sei sicuro di voler revocare i permessi di amministratore?';
    
    const confirmButton = document.getElementById('confirmAdmin');
    
    // Rimuove eventuali listener esistenti
    const newConfirmButton = confirmButton.cloneNode(true);
    confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
    
    // Aggiunge il nuovo listener
    newConfirmButton.addEventListener('click', () => {
        toggleAdminPermission(username, isGranting);
        modal.style.display = 'none';
    });
    
    modal.style.display = 'flex'; // Cambiato da 'block' a 'flex' per il centramento
}

/**
 * Mostra il modal di conferma eliminazione
 */
function showDeleteConfirmation(event) {
    const button = event.target;
    const username = button.dataset.username;
    const nome = button.dataset.nome || '';
    const cognome = button.dataset.cognome || '';
    
    const userInfoText = nome && cognome ? 
        `Utente: ${username} (${nome} ${cognome})` : 
        `Utente: ${username}`;
    
    document.getElementById('deleteUserInfo').textContent = userInfoText;
    
    const confirmButton = document.getElementById('confirmDelete');
    
    // Rimuove eventuali listener esistenti
    const newConfirmButton = confirmButton.cloneNode(true);
    confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
    
    // Aggiunge il nuovo listener
    newConfirmButton.addEventListener('click', () => {
        deleteUser(username);
    });
    
    document.getElementById('deleteConfirmModal').style.display = 'flex'; // Cambiato da 'block' a 'flex'
}

/**
 * Elimina un utente
 */
function deleteUser(username) {
    fetch('/api/oh-issa/deleteUser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: username
        })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('deleteConfirmModal').style.display = 'none';
        
        if (data.status === 'success') {
            showMessage('success', `Utente ${username} eliminato con successo.`);
            loadUsers(); // Ricarica la lista degli utenti
        } else {
            showMessage('error', data.message);
        }
    })
    .catch(error => {
        console.error('Errore:', error);
        document.getElementById('deleteConfirmModal').style.display = 'none';
        showMessage('error', 'Si è verificato un errore durante l\'eliminazione dell\'utente.');
    });
}

/**
 * Mostra o nasconde l'indicatore di caricamento
 */
function showLoading(show) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = show ? 'flex' : 'none';
}

/**
 * Mostra un messaggio all'utente
 */
function showMessage(type, message) {
    const messageDiv = document.getElementById('responseMessages');
    if (!messageDiv) return;
    
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    
    const alert = document.createElement('div');
    alert.className = `alert ${alertClass}`;
    alert.textContent = message;
    
    messageDiv.appendChild(alert);
    
    // Rimuovi il messaggio dopo 5 secondi
    setTimeout(() => {
        alert.remove();
    }, 5000);
}
