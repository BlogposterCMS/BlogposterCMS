import { normalizeContentTags } from '../../../../../shared/content/contentTags.js';
import { presentationMeta } from '../../../../../shared/layout/pagePresentation.js';

interface TaggedPage { meta?: unknown }

/** Legacy malformed labels must not make the existing page list inaccessible. */
export function pageTags(page: TaggedPage): string[] {
  try { return normalizeContentTags(presentationMeta(page).tags); }
  catch { return []; }
}

export function matchesPageTags(page: TaggedPage, tags: string[]): boolean {
  const saved = pageTags(page);
  return tags.every(tag => saved.includes(tag));
}

/** This filters the already-authorized Pages list; it performs no new reads. */
export function createPageTagFilter(changed: () => void) {
  const label = document.createElement('label');
  label.className = 'page-manager__search';
  const caption = document.createElement('span'); caption.textContent = 'Filter by tag';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Filter by tag');
  label.append(caption, select);
  let selected = '';
  select.addEventListener('change', () => { selected = select.value; changed(); });
  return { element: label, value: () => selected,
    set(value: unknown) {
      const tags = normalizeContentTags(value);
      if (tags.length > 1) throw new Error('PAGE_TAG_FILTER_INVALID: Select one tag.');
      selected = tags[0] || ''; select.value = selected;
    },
    refresh(pages: TaggedPage[]) {
      const tags = [...new Set(pages.flatMap(pageTags))].sort();
      if (selected && !tags.includes(selected)) tags.push(selected);
      select.replaceChildren(...['', ...tags].map(tag => {
        const option = document.createElement('option'); option.value = tag;
        option.textContent = tag || 'All tags'; return option;
      }));
      select.value = selected;
    }
  };
}
