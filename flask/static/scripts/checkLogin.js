function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  const navlinksDiv = document.querySelector('.navlinks');
  const username = getCookie('username');

  const link = document.createElement('a');
  if (username) {
    link.href = "/flask/logout";
    link.innerHTML = "Esci <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>logout</span>";
  } else {
    link.href = "/flask/login";
    link.innerHTML = "Accedi <span class='material-symbols-outlined icon' style='vertical-align: text-bottom;'>login</span>";
  }
  navlinksDiv.appendChild(link);
});