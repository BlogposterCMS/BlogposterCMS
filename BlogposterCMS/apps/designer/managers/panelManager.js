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
  const textIcon = document.querySelector('.drag-widget-icon[data-widget-id="textBox"]');
  if (textIcon) {
    textIcon.addEventListener('click', () => showBuilderPanel('text-panel'));
  }
  const container = document.getElementById('builderPanel');
  if (container) {
    container.addEventListener('click', e => {
      if (e.target.closest('.collapse-btn')) hideBuilderPanel();
    });
  }
}
