import { designThumbnailUrl } from '../../designerLayoutsData.js';
import { openPopover } from '/ui/shared/overlays/popover.js';
import { bindPageContentAction } from '/ui/shared/article/pageContentAction.js';
/** Uses the resolved page assignment; never creates a separate design mapping. */
export function renderPageDesignPreview(host, source, designs, adminBase, pageId, compact = false, onDelete, onSaved) {
    host.replaceChildren();
    const id = source?.contentDesignId || source?.designId;
    const editorUrl = `${adminBase}/pages/edit/${encodeURIComponent(String(pageId ?? source?.sourcePage.id ?? ''))}`;
    const actions = document.createElement('div');
    actions.className = 'page-manager__actions';
    const edit = document.createElement('a');
    edit.className = 'button primary sm';
    edit.textContent = 'Edit content';
    edit.href = id ? `${adminBase}/studio/design/${encodeURIComponent(id)}` : `${editorUrl}#page-design`;
    if (pageId != null)
        bindPageContentAction(edit, pageId, adminBase, onSaved);
    if (compact) {
        edit.title = edit.textContent;
        edit.setAttribute('aria-label', edit.textContent);
        edit.className = 'icon-button';
        edit.innerHTML = '<img src="/assets/icons/brush.svg" width="18" height="18" alt="" />';
    }
    // Keep page settings beside the design action without repeating its text label.
    const settings = document.createElement('a');
    settings.className = 'icon-button';
    settings.href = editorUrl;
    settings.setAttribute('aria-label', 'Page settings');
    settings.title = 'Page settings';
    const settingsIcon = document.createElement('img');
    settingsIcon.src = '/assets/icons/settings.svg';
    settingsIcon.alt = '';
    settingsIcon.width = 18;
    settingsIcon.height = 18;
    settings.append(settingsIcon);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'icon-button';
    more.innerHTML = '<img src="/assets/icons/ellipsis-vertical.svg" width="18" height="18" alt="" />';
    more.setAttribute('aria-label', 'More page actions');
    more.addEventListener('click', () => {
        const menu = document.createElement('div');
        menu.className = 'bp-popover__menu';
        // Route to the existing draft editor, preserving its save and replace guards.
        for (const [label, hash] of [[id ? 'Change attached design' : 'Attach design', 'page-design'], ['Attach HTML file', 'page-html'], ['Import HTML', 'page-html-upload']]) {
            const link = document.createElement('a');
            link.className = 'bp-popover__item';
            link.setAttribute('role', 'menuitem');
            link.textContent = label;
            link.href = `${editorUrl}#${hash}`;
            menu.append(link);
        }
        const popover = openPopover(more, { content: menu, role: 'menu', ariaLabel: 'Page actions', placement: 'bottom-end' });
        if (onDelete) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'bp-popover__item';
            remove.setAttribute('role', 'menuitem');
            remove.textContent = 'Delete page';
            remove.addEventListener('click', () => { popover.close(); onDelete(); });
            menu.append(remove);
        }
    });
    actions.append(edit, settings, more);
    if (compact) {
        host.append(actions);
        return;
    }
    if (!id) {
        const hint = document.createElement('p');
        hint.className = 'page-manager__hint';
        hint.textContent = 'No design attached to this page.';
        host.append(hint);
        host.append(actions);
        return;
    }
    const design = designs.find(candidate => String(candidate.id) === id);
    const link = document.createElement('a');
    link.className = 'page-manager__design-preview';
    link.href = `${adminBase}/studio/design/${encodeURIComponent(id)}`;
    link.dataset.designId = id;
    const image = document.createElement('img');
    image.alt = `${design?.title || `Design ${id}`} preview`;
    const placeholder = () => {
        image.classList.add('is-placeholder');
        image.alt = 'No design preview available';
        image.src = '/assets/icons/file.svg';
    };
    image.addEventListener('error', placeholder, { once: true });
    if (design?.thumbnail)
        image.src = designThumbnailUrl(design.thumbnail);
    else
        placeholder();
    const name = document.createElement('strong');
    name.textContent = design?.title || `Design ${id}`;
    name.title = name.textContent;
    const context = document.createElement('small');
    context.textContent = source?.contentDesignId ? 'Page design' : source?.source === 'site'
        ? 'Website main design' : source?.inherited ? 'Inherited design' : 'Page design';
    link.append(image, context, name);
    host.append(link);
    host.append(actions);
}
