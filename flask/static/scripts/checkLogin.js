function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  const navlinksDiv = document.querySelector('.navlinks');
  const username = getCookie('username');

  if (username) {
    const dropdown = document.createElement('div');
    dropdown.className = 'user-dropdown';
    
    const userLink = document.createElement('a');
    userLink.href = "#";
    userLink.innerHTML = `${username}`;
    
    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'user-dropdown-content';
    
    const logoutLink = document.createElement('a');
    logoutLink.href = "/flask/logout";
    logoutLink.innerHTML = "Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>";
    
    dropdownContent.appendChild(logoutLink);
    dropdown.appendChild(userLink);
    dropdown.appendChild(dropdownContent);
    navlinksDiv.appendChild(dropdown);
  } else {
    const link = document.createElement('a');
    link.href = "/flask/login";
    link.innerHTML = "Accedi <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>login</span>";
    navlinksDiv.appendChild(link);
  }
});