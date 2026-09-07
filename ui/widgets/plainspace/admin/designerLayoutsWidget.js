import { registerWorkspaceAgent } from '../../../shared/agent/workspaceAgent.js';
import { designUpdatedAt, designThumbnailUrl, designUrl, fetchDesignerLayouts, sortDesignsByRecent } from './designerLayoutsData.js';
import { createHtmlImportControl } from './htmlImportControl.js';
export async function render(el) {
    const meltdownEmit = window.meltdownEmit;
    const jwt = window.ADMIN_TOKEN;
    if (!el)
        return;
    const loading = document.createElement('p');
    loading.className = 'empty-state';
    loading.setAttribute('role', 'status');
    loading.textContent = 'Loading designs…';
    el.replaceChildren(loading);
    let designs = [];
    try {
        if (typeof meltdownEmit !== 'function')
            throw new Error('meltdownEmit unavailable');
        designs = await fetchDesignerLayouts(meltdownEmit, jwt);
    }
    catch (err) {
        // A failed read must not look like a genuinely empty design library.
        console.warn('DESIGNER_LAYOUTS_LOAD_FAILED', err);
        const message = document.createElement('p');
        message.setAttribute('role', 'alert');
        message.dataset.errorCode = 'DESIGNER_LAYOUTS_LOAD_FAILED';
        message.textContent = 'Could not load designs. Please try again.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button secondary';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => { void render(el); });
        el.replaceChildren(message, retry);
        return;
    }
    const card = document.createElement('div');
    card.className = 'layout-gallery-card designer-layouts-card';
    const titleBar = document.createElement('div');
    titleBar.className = 'layout-gallery-title-bar';
    const title = document.createElement('div');
    title.className = 'layout-gallery-title';
    title.textContent = 'Design Studio';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.setAttribute('aria-label', 'Add design');
    addBtn.title = 'Create a new design in Design Studio';
    addBtn.className = 'icon-button add-layout-btn';
    const addIcon = document.createElement('img');
    addIcon.src = '/assets/icons/plus.svg';
    addIcon.alt = '';
    addIcon.className = 'icon';
    addBtn.appendChild(addIcon);
    addBtn.addEventListener('click', () => {
        window.open('/admin/studio/design', '_blank', 'noopener');
    });
    titleBar.appendChild(title);
    titleBar.appendChild(createHtmlImportControl());
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
            item.dataset.designId = String(design.id);
            const img = document.createElement('img');
            img.className = 'layout-gallery-preview';
            img.alt = `${design.title || 'Untitled'} preview`;
            img.src = designThumbnailUrl(design.thumbnail) || '/assets/icons/file.svg';
            const showPlaceholder = () => {
                img.classList.add('layout-gallery-preview--placeholder');
                img.alt = 'No preview available';
                img.src = '/assets/icons/file.svg';
            };
            // Missing/stale preview URLs must not leave a broken image in the card.
            img.addEventListener('error', showPlaceholder, { once: true });
            if (!design.thumbnail)
                showPlaceholder();
            item.appendChild(img);
            const textWrap = document.createElement('div');
            textWrap.className = 'layout-gallery-details';
            const name = document.createElement('span');
            name.className = 'layout-gallery-name';
            name.textContent = design.title || 'Untitled layout';
            name.title = name.textContent;
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
            // A real destination works with keyboard navigation and popup-restricted hosts.
            const openBtn = document.createElement('a');
            openBtn.href = designUrl(design);
            openBtn.className = 'button secondary sm';
            openBtn.textContent = 'Open';
            openBtn.addEventListener('click', ev => {
                ev.stopPropagation();
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
    registerWorkspaceAgent({ root: card, id: 'designs', title: 'Design library',
        read: () => ({ dirty: false, busy: false, designs: designs.map(design => ({
                id: design.id, title: design.title, updatedAt: designUpdatedAt(design), editorUrl: designUrl(design)
            })) }), actions: []
    });
}
