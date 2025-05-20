// public/assets/plainspace/admin/builderRenderer.js
export async function initBuilder(sidebarEl, contentEl, allWidgets) {
  sidebarEl.querySelector('.drag-icons').innerHTML = allWidgets.map(w => `
    <div class="drag-widget-icon" draggable="true" data-widget-id="${w.id}" title="${w.metadata.label}">
      <img src="/assets/icons/${w.id}.svg" alt="${w.metadata.label}" />
      <span>${w.metadata.label}</span>
    </div>
  `).join('');

  sidebarEl.querySelectorAll('.drag-widget-icon').forEach(icon => {
    icon.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', icon.dataset.widgetId);
    });
  });

  contentEl.innerHTML = `<div id="builderGrid" class="grid-stack builder-grid"></div>`;
  const gridEl = document.getElementById('builderGrid');
  const grid = GridStack.init({}, gridEl);

  gridEl.addEventListener('dragover',  e => { e.preventDefault(); gridEl.classList.add('drag-over'); });
  gridEl.addEventListener('dragleave', () => gridEl.classList.remove('drag-over'));
  gridEl.addEventListener('drop', async e => {
    e.preventDefault(); gridEl.classList.remove('drag-over');
    const widgetId = e.dataTransfer.getData('text/plain');
    const widgetDef = allWidgets.find(w => w.id === widgetId);
    if (!widgetDef) return;

    const [x, y, w, h] = [
      Math.floor((e.offsetX / gridEl.offsetWidth) * 12) || 0,
      Math.floor((e.offsetY / gridEl.offsetHeight) * 6) || 0,
      4, 2
    ];

    const wrapper = document.createElement('div');
    wrapper.classList.add('grid-stack-item');
    wrapper.dataset.widgetId = widgetDef.id;
    wrapper.setAttribute('gs-x', x);
    wrapper.setAttribute('gs-y', y);
    wrapper.setAttribute('gs-w', w);
    wrapper.setAttribute('gs-h', h);

    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    content.textContent = widgetDef.metadata?.label || widgetDef.id;
    wrapper.appendChild(content);
    gridEl.appendChild(wrapper);
    grid.makeWidget(wrapper);

    import(widgetDef.codeUrl).then(m => m.render?.(content))
      .catch(err => console.error('[Builder] widget import error', err));
  });

  const controls = document.createElement('div');
  controls.className = 'builder-controls-bar';
  controls.innerHTML = `
    <input id="layoutNameInput" placeholder="Layout name…" />
    <button id="saveLayoutBtn">💾 Save Layout</button>`;
  contentEl.prepend(controls);

  controls.querySelector('#saveLayoutBtn').addEventListener('click', async () => {
    const name = controls.querySelector('#layoutNameInput').value.trim();
    if (!name) { alert('Enter a name'); return; }
    const items = Array.from(gridEl.querySelectorAll('.grid-stack-item'));
    const layout = items.map(el => ({
      widgetId: el.dataset.widgetId,
      x: +el.getAttribute('gs-x'),
      y: +el.getAttribute('gs-y'),
      w: +el.getAttribute('gs-w'),
      h: +el.getAttribute('gs-h')
    }));
    try {
      await meltdownEmit('saveLayoutTemplate', {
        moduleName: 'plainspace',
        name,
        lane: 'public',
        viewport: 'desktop',
        layout
      });
      alert('Layout template saved');
    } catch (err) {
      console.error('[Builder] saveLayoutTemplate error', err);
      alert('Save failed: ' + err.message);
    }
  });
}
