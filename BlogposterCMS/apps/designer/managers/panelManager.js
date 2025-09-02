export function showBuilderPanel(panelClass) {
  const container = document.getElementById('builderPanel');
  if (!container) return null;
  container.querySelectorAll('.builder-panel').forEach(p => {
    p.style.display = p.classList.contains(panelClass) ? '' : 'none';
  });
  container.classList.remove('hidden');
  return container.querySelector(`.${panelClass}`);
}

export function hideBuilderPanel() {
  const container = document.getElementById('builderPanel');
  if (container) container.classList.add('hidden');
}

export function initBuilderPanel() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.addEventListener('click', e => {
      if (e.target.closest('.drag-widget-icon[data-widget-id="textBox"]')) {
        showBuilderPanel('text-panel');
      }
    });
  }
  const container = document.getElementById('builderPanel');
  if (container) {
    container.addEventListener('click', e => {
      if (e.target.closest('.collapse-btn')) hideBuilderPanel();
    });
  }
}
