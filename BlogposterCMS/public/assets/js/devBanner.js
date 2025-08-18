(function() {
  if (document.getElementById('dev-mode-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'dev-mode-banner';
  banner.className = 'dev-mode-banner';
  banner.textContent = 'Development mode';
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(banner);
  });
})();
