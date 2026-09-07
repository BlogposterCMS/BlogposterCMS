/** @jest-environment jsdom */
import { pageLayoutMode, pageLayoutMeta, pagePresentationFromList, resolvePagePresentation } from '../ui/shared/layout/pagePresentation';
import { loadSiteMainDesign, saveSiteMainDesign } from '../ui/shared/layout/siteMainDesign';

test('new pages use the site main design regardless of their parent and without copying it', async () => {
  const parent = { id: 'docs', meta: { designId: 'docs-design' } };
  const page = { id: 'article', parent_id: 'docs', meta: {} };
  const readParent = jest.fn().mockResolvedValue(parent);
  expect(pageLayoutMode(page)).toBe('main');
  const result = await resolvePagePresentation(page, readParent, { mainDesignId: 'site' });
  expect(result).toMatchObject({ designId: 'site', source: 'site' });
  expect(readParent).not.toHaveBeenCalled();
  expect(pagePresentationFromList(page, [parent, page], 'site')).toEqual(result);
  expect(page.meta).toEqual({});
});

test('all three page modes resolve to an explicit outer/inner composition', async () => {
  const resolve = (meta: Record<string, unknown>, mainDesignId = 'site') => resolvePagePresentation(
    { id: 'page', meta }, jest.fn(), { mainDesignId }
  );
  expect(await resolve(pageLayoutMeta({}, 'main'))).toMatchObject({ designId: 'site' });
  expect(await resolve(pageLayoutMeta({}, 'composed', 'article'))).toMatchObject({
    designId: 'site', contentDesignId: 'article', contentLayoutRef: 'layout:article@v1'
  });
  expect(await resolve(pageLayoutMeta({}, 'design', 'article'))).toMatchObject({ designId: 'article', inherited: false });
  expect((await resolve(pageLayoutMeta({}, 'composed', 'site')))?.contentDesignId).toBeUndefined();
  expect(await resolve(pageLayoutMeta({}, 'composed', 'article'), '')).toMatchObject({ designId: 'article' });
  expect(await resolvePagePresentation({ lane: 'admin' }, jest.fn(), { mainDesignId: 'site' })).toBeNull();
});

test('site selection uses the existing Settings facade and rejects invalid ids before transport', async () => {
  const emit = jest.fn().mockResolvedValue({ resource: 'settings', action: 'public', data: { SITE_MAIN_DESIGN_ID: 'site' } });
  window.meltdownEmit = emit;
  expect(await loadSiteMainDesign()).toBe('site');
  await saveSiteMainDesign('site');
  expect(emit).toHaveBeenLastCalledWith('cmsAdminApiRequest', expect.objectContaining({
    resource: 'settings', action: 'set', params: { key: 'SITE_MAIN_DESIGN_ID', value: 'site' }
  }));
  await expect(saveSiteMainDesign('../../private')).rejects.toThrow('PAGE_MAIN_DESIGN_INVALID');
  expect(emit).toHaveBeenCalledTimes(2);
});
