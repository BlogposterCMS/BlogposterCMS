import { createLinkTargetChecker, createEditorLinkTargetChecker, linkTargetPath } from '../ui/shared/links/linkTargetStatus';

test('checks only local CMS paths and excludes credentials, fragments, assets and external destinations', () => {
  const base = 'https://example.test/';
  expect(linkTargetPath('/docs/start?lang=zh&token=hidden#step', base)).toBe('docs/start');
  for (const href of ['https://other.test/docs/start', 'https://user:password@example.test/docs', '#step', 'mailto:team@example.test', '/media/photo.png', '/admin/pages', '/api/internal', '/auth/sign-in', 'javascript:alert(1)']) {
    expect(linkTargetPath(href, base)).toBeNull();
  }
});

test.each([
  [null, 'LINK_TARGET_MISSING'],
  [{ id: 1, status: 'draft' }, 'LINK_TARGET_DRAFT'],
  [{ id: 1, status: 'deleted' }, 'LINK_TARGET_DELETED'],
  [{ id: 1, status: 'private' }, 'LINK_TARGET_UNAVAILABLE'],
  [{ id: 1, status: 'published', meta: { publish_at: '2999-01-01' } }, 'LINK_TARGET_SCHEDULED']
])('reports authoritative page status without mutating it: %j', async (page, code) => {
  const original = JSON.stringify(page);
  const check = createLinkTargetChecker(async () => page, 'https://example.test/');
  expect(await check('/docs/start?token=secret')).toMatchObject({ target: '/docs/start', code, warning: true });
  expect(JSON.stringify(page)).toBe(original);
});

test('a successful published result is deduplicated, expires, and failed reads are never called missing', async () => {
  let time = 1000;
  const now = jest.spyOn(Date, 'now').mockImplementation(() => time);
  const lookup = jest.fn().mockResolvedValue({ id: 2, status: 'published' });
  const check = createLinkTargetChecker(lookup, 'https://example.test/');
  try {
    const result = await Promise.all([check('/guide'), check('/guide?lang=en')]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result.every(item => !item.warning)).toBe(true);
    time += 10001; lookup.mockRejectedValueOnce(new Error('permission denied'));
    expect(await check('/guide')).toMatchObject({ code: 'LINK_TARGET_CHECK_UNAVAILABLE', warning: true });
    expect(lookup).toHaveBeenCalledTimes(2);
  } finally { now.mockRestore(); }
});

/** @jest-environment node */
test('the editor checker uses the existing permission-checked admin facade', async () => {
  const emit = jest.fn().mockResolvedValue({ resource: 'pages', action: 'getBySlug', data: { id: 7, status: 'draft' } });
  (global as any).window = { meltdownEmit: emit, ADMIN_TOKEN: 'test-only' };
  try {
    expect(await createEditorLinkTargetChecker('https://example.test/')('/guide')).toMatchObject({ code: 'LINK_TARGET_DRAFT', pageId: '7' });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({ resource: 'pages', action: 'getBySlug', jwt: 'test-only', params: { slug: 'guide', lane: 'public' } }), 5000);
    delete (global as any).window.ADMIN_TOKEN;
    expect(await createEditorLinkTargetChecker('https://example.test/')('/guide')).toMatchObject({ code: 'LINK_TARGET_DRAFT' });
  } finally { delete (global as any).window; }
});
