import { designUpdatedAt, designUrl, fetchDesignerLayouts, sortDesignsByRecent } from './designerLayoutsData.js';
export async function render(el) {
    const meltdownEmit = window.meltdownEmit;
    const jwt = window.ADMIN_TOKEN;
    if (!el)
        return;
    let designs = [];
    try {
        if (typeof meltdownEmit !== 'function')
            throw new Error('meltdownEmit unavailable');
        designs = await fetchDesignerLayouts(meltdownEmit, jwt);
    }
    catch (err) {
        console.warn('[DesignerLayoutsWidget] failed to list designs', err);
    }
    const card = document.createElement('div');
    card.className = 'layout-gallery-card designer-layouts-card';
    const titleBar = document.createElement('div');
    titleBar.className = 'layout-gallery-title-bar';
    const title = document.createElement('div');
    title.className = 'layout-gallery-title';
    title.textContent = 'Design Studio';
    const addBtn = document.createElement('img');
    addBtn.src = '/assets/icons/plus.svg';
    addBtn.alt = 'Add design';
    addBtn.title = 'Create a new design in Design Studio';
    addBtn.className = 'icon add-layout-btn';
    addBtn.addEventListener('click', () => {
        window.open('/admin/studio/design', '_blank', 'noopener');
    });
    titleBar.appendChild(title);
    titleBar.appendChild(addBtn);
    card.appendChild(titleBar);
    const list = document.createElement('div');
    list.className = 'layout-gallery designer-layouts-list';
    if (!designs.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No Design Studio layouts found.';
        list.appendChild(empty);
    }
    else {
        sortDesignsByRecent(designs)
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
            const updated = designUpdatedAt(design);
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
                window.open(designUrl(design), '_blank', 'noopener');
            });
            actions.appendChild(openBtn);
            item.appendChild(actions);
            item.addEventListener('click', () => {
                window.open(designUrl(design), '_blank', 'noopener');
            });
            list.appendChild(item);
        });
    }
    card.appendChild(list);
    el.replaceChildren(card);
}
