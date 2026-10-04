(() => {
  let saved=null;
  try { saved=localStorage.getItem('cunix-grc-theme'); } catch {}
  document.documentElement.dataset.theme = saved==='light'||saved==='dark' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();
