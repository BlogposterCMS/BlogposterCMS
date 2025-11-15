export async function render(el) {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;

  let designs = [];
  try {
    const res = await meltdownEmit('designer.listDesigns', {
      jwt,
      moduleName: 'designer',
      moduleType: 'community'
    });
    designs = Array.isArray(res?.designs) ? res.designs : [];
  } catch (err) {
    console.warn('[DesignerLayoutsWidget] failed to list designs', err);
  }

  const card = document.createElement('div');
  card.className = 'layout-gallery-card designer-layouts-card';

  const titleBar = document.createElement('div');
  titleBar.className = 'layout-gallery-title-bar';

  const title = document.createElement('div');
  title.className = 'layout-gallery-title';
  title.textContent = 'Designer Layouts';

  const addBtn = document.createElement('img');
  addBtn.src = '/assets/icons/plus.svg';
  addBtn.alt = 'Add designer layout';
  addBtn.title = 'Create a new layout in the designer';
  addBtn.className = 'icon add-layout-btn';
  addBtn.addEventListener('click', () => {
    window.open('/admin/app/designer', '_blank', 'noopener');
  });

  titleBar.appendChild(title);
  titleBar.appendChild(addBtn);
  card.appendChild(titleBar);

  const list = document.createElement('div');
  list.className = 'layout-gallery designer-layouts-list';

  if (!designs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No designer layouts found.';
    list.appendChild(empty);
  } else {
    designs
      .slice()
      .sort((a, b) => {
        const tsA = new Date(a.updated_at || a.created_at || 0).getTime();
        const tsB = new Date(b.updated_at || b.created_at || 0).getTime();
        return tsB - tsA;
      })
      .forEach(design => {
        const item = document.createElement('div');
        item.className = 'layout-gallery-item designer-layout-item';

        const img = document.createElement('img');
        img.className = 'layout-gallery-preview';
        img.alt = `${design.title || 'Untitled'} preview`;
        img.src = design.thumbnail || '/assets/icons/file.svg';
        item.appendChild(img);

        const textWrap = document.createElement('div');
        textWrap.className = 'layout-gallery-details';

        const name = document.createElement('span');
        name.className = 'layout-gallery-name';
        name.textContent = design.title || 'Untitled layout';
        textWrap.appendChild(name);

        const meta = document.createElement('span');
        meta.className = 'layout-gallery-meta';
        const updated = design.updated_at || design.created_at;
        meta.textContent = updated
          ? `Updated ${new Date(updated).toLocaleString()}`
          : 'No update information';
        textWrap.appendChild(meta);

        item.appendChild(textWrap);

        const actions = document.createElement('div');
        actions.className = 'layout-gallery-actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'button small';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', ev => {
          ev.stopPropagation();
          if (design.id) {
            window.open(`/admin/app/designer/${encodeURIComponent(design.id)}`, '_blank', 'noopener');
          } else {
            window.open('/admin/app/designer', '_blank', 'noopener');
          }
        });
        actions.appendChild(openBtn);

        item.appendChild(actions);

        item.addEventListener('click', () => {
          if (design.id) {
            window.open(`/admin/app/designer/${encodeURIComponent(design.id)}`, '_blank', 'noopener');
          } else {
            window.open('/admin/app/designer', '_blank', 'noopener');
          }
        });

        list.appendChild(item);
      });
  }

  card.appendChild(list);
  el.replaceChildren(card);
}
