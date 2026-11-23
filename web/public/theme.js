try {
  document.documentElement.dataset.theme = localStorage.getItem('enigma-theme') === 'dark' ? 'dark' : 'light';
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
