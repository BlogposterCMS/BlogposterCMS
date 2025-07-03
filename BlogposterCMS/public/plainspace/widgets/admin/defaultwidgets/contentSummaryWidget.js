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

  const list = document.createElement('ul');
  list.className = 'layout-gallery';

  if (templates.length) {
    templates.forEach(t => {
      const li = document.createElement('li');
      li.className = 'layout-gallery-item';

      const img = document.createElement('img');
      img.className = 'layout-gallery-preview';
      img.alt = `${t.name} preview`;
      img.src = t.previewPath || '/assets/icons/file.svg';

      const span = document.createElement('span');
      span.className = 'layout-gallery-name';
      span.textContent = t.name;

      li.appendChild(img);
      li.appendChild(span);
      list.appendChild(li);
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

