import {
  buildInitialPageDataRequest,
  pageDataCacheKey,
  sanitizePageData,
  unwrapMeltdownResult
} from '../ui/shell/data/pageDataLoaderData';

describe('pageDataLoaderData', () => {
  it('unwraps meltdown data containers and sanitizes requested fields', () => {
    expect(unwrapMeltdownResult({ data: { id: 1, title: 'Home' } })).toEqual({ id: 1, title: 'Home' });
    expect(unwrapMeltdownResult({ data: null, ok: true })).toEqual({ data: null, ok: true });
    expect(unwrapMeltdownResult(undefined)).toBeNull();
    expect(sanitizePageData({ id: 1, title: 'Home', secret: true }, ['id', 'title'])).toEqual({
      id: 1,
      title: 'Home'
    });
    expect(sanitizePageData({ id: 1 })).toEqual({ id: 1 });
    expect(sanitizePageData('bad')).toBeNull();
  });

  it('builds stable cache keys', () => {
    expect(pageDataCacheKey('cmsAdminApiRequest', { params: { pageId: 1 } }))
      .toBe('cmsAdminApiRequest:{"params":{"pageId":1}}');
    expect(pageDataCacheKey('cmsAdminApiRequest')).toBe('cmsAdminApiRequest:{}');
  });

  it('builds the initial admin page data request payload', () => {
    const request = buildInitialPageDataRequest('page-1');

    expect(request.eventName).toBe('cmsAdminApiRequest');
    expect(request.payload).toEqual({
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'get',
      params: { pageId: 'page-1' }
    });
    expect(request.fields).toContain('html');
    expect(request.fields).toContain('is_content');
  });
});
