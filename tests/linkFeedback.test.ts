/** @jest-environment jsdom */
import { mountLinkFeedback, htmlSourceLinks } from '../ui/shared/links/linkFeedback';
import { openPopover } from '../ui/shared/overlays/popover';

let mounted: ReturnType<typeof mountLinkFeedback> | undefined;
afterEach(() => { mounted?.stop(); mounted = undefined; document.body.replaceChildren(); jest.useRealTimers(); });
const draft = { target: '/guide', code: 'LINK_TARGET_DRAFT', message: 'This page is still a draft.', warning: true };

test('immediate nonblocking popover and persistent highlight share the agent snapshot without changing source HTML', async () => {
  document.body.innerHTML = '<main><a href="/guide">Guide</a></main>';
  const root = document.querySelector('main')!;
  const anchor = root.querySelector('a')!;
  anchor.getBoundingClientRect = () => ({ x: 10, y: 10, left: 10, top: 10, right: 100, bottom: 30, width: 90, height: 20, toJSON() {} });
  const original = root.innerHTML;
  const check = jest.fn().mockResolvedValue({ ...draft, warning: false, code: 'LINK_TARGET_PUBLISHED' });
  mounted = mountLinkFeedback(root, { collect: () => [{ id: 'block-1:link-0', href: anchor.getAttribute('href')!, anchor }], check });
  await mounted.refresh();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  check.mockResolvedValue(draft);
  await mounted.refresh(true);
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(draft.message);
  expect(document.querySelector('[data-bp-link-feedback]')?.children).toHaveLength(1);
  expect(mounted.read().items).toEqual([{ id: 'block-1:link-0', ...draft }]);
  // Public article/design serialization must not persist UI warning attributes.
  expect(root.innerHTML).toBe(original);
});

test('an input warning does not close the existing link dialog or move keyboard focus', async () => {
  document.body.innerHTML = '<main><button>Edit link</button></main>';
  const root = document.querySelector('main')!;
  const input = document.createElement('input'); input.value = '/guide';
  const editor = openPopover(root.querySelector('button')!, { content: input, ariaLabel: 'Edit link' });
  input.focus();
  let present = false;
  mounted = mountLinkFeedback(root, { collect: () => present ? [{ id: 'link-entry', href: input.value, anchor: input }] : [], check: async () => draft });
  present = true; await mounted.refresh(true);
  expect(editor.panel.isConnected).toBe(true);
  expect(input.isConnected).toBe(true);
  expect(document.activeElement).toBe(input);
  expect(editor.panel.querySelector('[data-bp-link-hint]')?.textContent).toBe(draft.message);
  editor.close();
});

test('a corrected target discards an older in-flight result and clearing links clears feedback', async () => {
  document.body.innerHTML = '<main><a href="/guide">Guide</a></main>';
  const root = document.querySelector('main')!; const anchor = root.querySelector('a')!;
  let href = '', finish!: (value: typeof draft) => void;
  const deferred = new Promise<typeof draft>(resolve => { finish = resolve; });
  const check = jest.fn(url => url === '/old' ? deferred : Promise.resolve({ ...draft, target: '/new', code: 'LINK_TARGET_PUBLISHED', warning: false }));
  mounted = mountLinkFeedback(root, { collect: () => href ? [{ id: 'link', href, anchor }] : [], check });
  href = '/old'; const old = mounted.refresh(true);
  href = '/new'; await mounted.refresh(true);
  finish(draft); await old;
  expect(mounted.read().items[0].code).toBe('LINK_TARGET_PUBLISHED');
  href = ''; await mounted.refresh();
  expect(mounted.read().items).toEqual([]);
});

test('HTML source feedback reads links without executing or rewriting attached content', () => {
  const input = document.createElement('textarea');
  input.value = '<a href="/guide?lang=en">Guide</a><img src="/media/original.png"><script>bad()</script>';
  const before = input.value;
  expect(htmlSourceLinks(input)).toEqual([{ id: 'html-link-0', href: '/guide?lang=en', anchor: input }]);
  expect(input.value).toBe(before);
});
