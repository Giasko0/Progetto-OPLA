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
    link.innerHTML = `${username} &#x21E6;`;
  } else {
    link.href = "/flask/login";
    link.innerHTML = `Login &#x21E8;`;
  }

  navlinksDiv.appendChild(link);
});