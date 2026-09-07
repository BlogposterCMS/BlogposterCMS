import { designThumbnailUrl } from '../../designerLayoutsData.js';
import type { PagePresentation } from '/ui/shared/layout/pagePresentation.js';
import type { DesignRecord } from '../../pageEditorWidgets/pageContentData.js';
import { openPopover } from '/ui/shared/overlays/popover.js';

/** Uses the resolved page assignment; never creates a separate design mapping. */
export function renderPageDesignPreview(host: HTMLElement, source: PagePresentation | null, designs: DesignRecord[], adminBase: string, pageId?: string | number): void {
  host.replaceChildren();
  const id = source?.contentDesignId || source?.designId;
  const editorUrl = `${adminBase}/pages/edit/${encodeURIComponent(String(pageId ?? source?.sourcePage.id ?? ''))}`;
  const actions = document.createElement('div');
  actions.className = 'page-manager__actions';
  const edit = document.createElement('a');
  edit.className = 'button primary sm';
  edit.textContent = id ? 'Edit design' : 'Attach design';
  edit.href = id ? `${adminBase}/studio/design/${encodeURIComponent(id)}` : `${editorUrl}#page-design`;
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'icon-button';
  more.textContent = '⋯';
  more.setAttribute('aria-label', 'More page actions');
  more.addEventListener('click', () => {
    const menu = document.createElement('div');
    menu.className = 'bp-menu';
    // Route to the existing draft editor, preserving its save and replace guards.
    for (const [label, hash] of [[id ? 'Change attached design' : 'Attach design', 'page-design'], ['Attach HTML file', 'page-html'], ['Import HTML', 'page-html-upload']] as const) {
      const link = document.createElement('a');
      link.className = 'button ghost sm';
      link.style.display = 'flex';
      link.setAttribute('role', 'menuitem');
      link.textContent = label;
      link.href = `${editorUrl}#${hash}`;
      menu.append(link);
    }
    openPopover(more, { content: menu, role: 'menu', ariaLabel: 'Page attachments', placement: 'bottom-end' });
  });
  actions.append(edit, more);
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
  if (design?.thumbnail) image.src = designThumbnailUrl(design.thumbnail);
  else placeholder();
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
