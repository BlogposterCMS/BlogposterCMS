import { emitRuntimeAdmin } from '../api-client/runtimeFacade.js';
import { ownPagePresentation, pageLayoutMeta } from '../layout/pagePresentation.js';
import { articleTitle, readArticlePage, saveContentPageDraft, type ArticlePage } from './articleData.js';

export const DOCUMENT_MODE_WARNING = 'The page will stop using this design. Its layout and widgets will not appear in the document editor. Only the separately saved page content is kept. The design remains in the Design Studio library.';

export function pageDesignEditorUrl(pageId: string | number, designId: string, language?: string, adminBase = '/admin'): string {
  const query = new URLSearchParams({ contentPageId: String(pageId) });
  if (language) query.set('contentLang', language);
  return `${adminBase}/studio/design/${encodeURIComponent(designId)}?${query}`;
}

/** Use the existing design and page authorities. Article HTML/media remain separate and unchanged. */
export async function ensureContentDesign(base: ArticlePage): Promise<string> {
  if (!window.meltdownEmit) throw new Error('ARTICLE_RUNTIME_UNAVAILABLE');
  const current = await readArticlePage(base.id!, base.contentLanguage);
  const own = ownPagePresentation(current);
  if (own?.designId) return own.designId;
  if (own) throw new Error('PAGE_LEGACY_LAYOUT_UNSUPPORTED: Change this legacy layout in page settings first.');
  const saved = await emitRuntimeAdmin<{ id?: string | number }>(window.meltdownEmit, window.ADMIN_TOKEN, 'designer', 'save', {
    design: { title: articleTitle(current) || 'Page design', isDraft: true }, layout: {
      type: 'leaf', nodeId: 'page-content', workarea: true, isDynamicHost: true,
      section: { id: 'page-content', title: 'Page content' }, settings: { mode: 'stack', minHeight: '320px' }
    }, widgets: []
  });
  if (saved?.id == null) throw new Error('PAGE_DESIGN_CREATE_FAILED');
  const latest = await readArticlePage(base.id!, base.contentLanguage);
  if (ownPagePresentation(latest)) throw new Error('PAGE_CONTENT_CHANGED: Design saved in the library but not attached; reopen the page.');
  await saveContentPageDraft({ ...latest, meta: pageLayoutMeta(latest, 'composed', String(saved.id), articleTitle(latest)) });
  return String(saved.id);
}

export async function useDocumentEditor(pageId: string, expectedDesignId: string, language?: string): Promise<ArticlePage> {
  const page = await readArticlePage(pageId, language);
  if (ownPagePresentation(page)?.designId !== expectedDesignId) throw new Error('PAGE_CONTENT_CHANGED: This page no longer uses the selected design.');
  const next = { ...page, meta: pageLayoutMeta(page, 'main') };
  await saveContentPageDraft(next);
  return next;
}

/** Returning from a document modal in Studio reuses that same saved design. */
export async function reuseContentDesign(page: ArticlePage, designId: string): Promise<void> {
  const current = await readArticlePage(page.id!, page.contentLanguage);
  if (ownPagePresentation(current)) throw new Error('PAGE_CONTENT_CHANGED: Reopen the page before changing its design.');
  await saveContentPageDraft({ ...current, meta: pageLayoutMeta(current, 'composed', designId) });
}
