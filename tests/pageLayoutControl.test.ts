/** @jest-environment jsdom */
import { mountPageLayoutControl } from '../ui/widgets/plainspace/admin/pageEditorWidgets/pageLayoutControl';
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
jest.mock('../ui/shared/layout/siteMainDesign', () => ({ loadSiteMainDesign: jest.fn().mockResolvedValue('site') }));

test('layout control resolves ancestry and stages overrides without erasing article content', async () => {
  const page = { id: 'child', parent_id: 'docs', lane: 'public', html: '<h1>Article</h1>', meta: { inheritParentDesign: true } };
  const emit = jest.fn().mockResolvedValue({ id: 'docs', title: 'Docs', status: 'published', meta: { designId: 'shared' } });
  window.meltdownEmit = emit;
  const host = document.createElement('section'); document.body.replaceChildren(host);
  const changed = jest.fn();
  const control = mountPageLayoutControl(host, { page, designs: () => [{ id: 'shared', title: 'Documentation' }], changed });
  await settle();
  expect(control.read()).toMatchObject({ mode: 'inherit', inherited: true, sourcePageId: 'docs', designId: 'shared' });
  expect(host.textContent).toContain('Inherited from Docs');
  await control.set('none'); await settle();
  expect(control.read()).toMatchObject({ mode: 'none', inherited: false, designId: null });
  expect(page.html).toBe('<h1>Article</h1>');
  await control.set('design', 'shared'); await settle();
  expect(page.meta).toMatchObject({ designId: 'shared' });
  expect(emit.mock.calls.every(call => call[1].action === 'get')).toBe(true);
  expect(changed).toHaveBeenCalledTimes(2);
});

test('lookup errors expose retry, and an unfinished design choice survives library refresh', async () => {
  const host = document.createElement('section'); document.body.replaceChildren(host);
  window.meltdownEmit = jest.fn().mockRejectedValue(new Error('offline'));
  const control = mountPageLayoutControl(host, { page: { id: 'child', parent_id: 'docs', meta: { inheritParentDesign: true } }, designs: () => [], changed: jest.fn() });
  await settle();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('PAGE_LAYOUT_LOOKUP_FAILED');
  expect(host.querySelector('[data-layout-source] button')?.textContent).toBe('Retry');
  const mode = host.querySelector<HTMLSelectElement>('[data-layout-mode]')!;
  mode.value = 'design'; mode.dispatchEvent(new Event('change'));
  control.refresh();
  expect(control.read().requestedMode).toBe('design');
  expect(host.querySelector<HTMLSelectElement>('[data-layout-design]')?.checkValidity()).toBe(false);
});

test('content pages default to the website frame and can stage a nested page design', async () => {
  const host = document.createElement('section'); document.body.replaceChildren(host);
  const page = { id: 'article', parent_id: 'irrelevant', html: '<p>Keep body</p>', meta: {} };
  const control = mountPageLayoutControl(host, { page, designs: () => [
    { id: 'site', title: 'Website frame' }, { id: 'article', title: 'Blog article' }
  ], changed: jest.fn() });
  await settle();
  expect(control.read()).toMatchObject({ mode: 'main', mainDesignId: 'site' });
  expect(host.textContent).toContain('Website main design');
  await control.set('composed', 'article'); await settle();
  expect(control.read()).toMatchObject({ mode: 'composed', designId: 'site', contentDesignId: 'article' });
  expect(host.textContent).toContain('Blog article → Page content');
  expect(page.html).toBe('<p>Keep body</p>');
});
