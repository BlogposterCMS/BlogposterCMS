import { readArticlePage, pageContentKind, createPageDesign } from './articleData.js';
import { ownPagePresentation } from '../layout/pagePresentation.js';
import { openPopover } from '../overlays/popover.js';
import { openArticle } from './articleLoader.js';
import { bpDialog } from '../dialogs/bpDialog.js';
import { pageDesignEditorUrl } from './pageEditorMode.js';

/** Read the actual page before routing; list rows may omit HTML or inherit a design. */
export function bindPageContentAction(anchor: HTMLAnchorElement, pageId: string | number, adminBase: string, onSaved?: () => void | Promise<void>) {
  let busy = false;
  anchor.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    busy = true; anchor.setAttribute('aria-busy', 'true');
    void (async () => {
      const page = await readArticlePage(pageId);
      const kind = pageContentKind(page);
      if (kind === 'article') { await openArticle(pageId, onSaved); return; }
      if (kind === 'design') {
        const id = ownPagePresentation(page)?.designId;
        if (!id) throw new Error('PAGE_LEGACY_LAYOUT_UNSUPPORTED: This legacy template has no Design Studio document.');
        window.location.assign(pageDesignEditorUrl(pageId, id, page.contentLanguage, adminBase)); return;
      }
      if (kind === 'html') { const { openHtmlContentEditor } = await import('./htmlContentEditor.js'); await openHtmlContentEditor(pageId, onSaved); return; }
      const menu = document.createElement('div'); menu.className = 'bp-popover__menu';
      const popover = openPopover(anchor, { content: menu, role: 'menu', ariaLabel: 'Choose page content', placement: 'bottom-end' });
      const add = (label: string, action: () => Promise<void>) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'bp-popover__item'; button.setAttribute('role', 'menuitem'); button.textContent = label;
        button.addEventListener('click', () => {
          if (busy) return;
          busy = true; popover.close();
          void action().catch(error => bpDialog.alert(error instanceof Error ? error.message : 'PAGE_CONTENT_OPEN_FAILED')).finally(() => { busy = false; });
        }); menu.append(button);
      };
      add('Create design', async () => { const id = await createPageDesign(page); window.location.assign(`${adminBase}/studio/design/${encodeURIComponent(id)}`); });
      add('Article only', () => openArticle(pageId, onSaved));
    })().catch(error => bpDialog.alert(error instanceof Error ? error.message : 'PAGE_CONTENT_OPEN_FAILED')).finally(() => { busy = false; anchor.removeAttribute('aria-busy'); });
  });
}
