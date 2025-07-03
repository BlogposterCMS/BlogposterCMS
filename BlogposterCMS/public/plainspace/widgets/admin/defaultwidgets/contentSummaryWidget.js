export async function render(el) {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;

  let templates = [];
  try {
    const res = await meltdownEmit('getLayoutTemplateNames', {
      jwt,
      moduleName: 'plainspace',
      moduleType: 'core',
      lane: 'public'
    });
    templates = Array.isArray(res?.templates) ? res.templates : [];
  } catch (err) {
    console.warn('[ContentSummaryWidget] failed to load templates', err);
  }

  el.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'layout-gallery-card';

  const titleBar = document.createElement('div');
  titleBar.className = 'layout-gallery-title-bar';

  const title = document.createElement('div');
  title.className = 'layout-gallery-title';
  title.textContent = 'Your Content';

  titleBar.appendChild(title);
  card.appendChild(titleBar);

  const list = document.createElement('div');
  list.className = 'layout-gallery';

  if (templates.length) {
    templates.forEach(t => {
      const item = document.createElement('div');
      item.className = 'layout-gallery-item';
      item.addEventListener('click', () => {
        window.location.href = `/admin/builder?layout=${encodeURIComponent(t.name)}`;
      });

      const menuBtn = document.createElement('button');
      menuBtn.className = 'layout-menu-btn';
      menuBtn.innerHTML = window.featherIcon
        ? window.featherIcon('more-horizontal')
        : '<img src="/assets/icons/more-horizontal.svg" class="icon" alt="menu" />';

      const menu = document.createElement('div');
      menu.className = 'layout-card-menu';
      menu.innerHTML = `
        <div class="menu-item open-layout">${window.featherIcon ? window.featherIcon('external-link') : '<img class="icon" src="/assets/icons/external-link.svg" alt="open" />'} Open in new tab</div>
        <div class="menu-item copy-layout">${window.featherIcon ? window.featherIcon('copy') : '<img class="icon" src="/assets/icons/copy.svg" alt="copy" />'} Copy layout</div>
        <div class="menu-item delete-layout">${window.featherIcon ? window.featherIcon('trash') : '<img class="icon" src="/assets/icons/trash.svg" alt="delete" />'} Delete</div>
      `;
      menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      document.addEventListener('click', e => {
        if (!menu.contains(e.target) && e.target !== menuBtn) menu.classList.remove('open');
      });

      menu.querySelector('.open-layout').onclick = ev => {
        ev.stopPropagation();
        window.open(`/admin/builder?layout=${encodeURIComponent(t.name)}`, '_blank');
        menu.classList.remove('open');
      };

      menu.querySelector('.copy-layout').onclick = async ev => {
        ev.stopPropagation();
        try {
          const res = await meltdownEmit('getLayoutTemplate', {
            jwt,
            moduleName: 'plainspace',
            moduleType: 'core',
            name: t.name
          });
          const layoutArr = res?.layout || [];
          const newName = prompt('Copy name:', t.name + ' copy');
          if (!newName) { menu.classList.remove('open'); return; }
          await meltdownEmit('saveLayoutTemplate', {
            jwt,
            moduleName: 'plainspace',
            moduleType: 'core',
            name: newName,
            lane: 'public',
            viewport: 'desktop',
            layout: layoutArr,
            previewPath: t.previewPath || ''
          });
          alert('Layout copied');
        } catch (err) {
          alert('Failed to copy layout: ' + err.message);
        }
        menu.classList.remove('open');
      };

      menu.querySelector('.delete-layout').onclick = async ev => {
        ev.stopPropagation();
        if (!confirm('Delete this layout?')) { menu.classList.remove('open'); return; }
        try {
          await meltdownEmit('deleteLayoutTemplate', {
            jwt,
            moduleName: 'plainspace',
            moduleType: 'core',
            name: t.name
          });
          item.remove();
        } catch (err) {
          alert('Failed to delete layout: ' + err.message);
        }
        menu.classList.remove('open');
      };

      const img = document.createElement('img');
      img.className = 'layout-gallery-preview';
      img.alt = `${t.name} preview`;
      img.src = t.previewPath || '/assets/icons/file.svg';

      const span = document.createElement('span');
      span.className = 'layout-gallery-name';
      span.textContent = t.name;

      item.appendChild(menuBtn);
      item.appendChild(menu);
      item.appendChild(img);
      item.appendChild(span);
      list.appendChild(item);
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No layouts found.';
    list.appendChild(empty);
  }

  card.appendChild(list);
  el.appendChild(card);
}

