const sqlite3 = require('sqlite3');
const EventEmitter = require('node:events');
const { presentationCssRevision, validateCssPatch, patchPresentationCss } = require('../mother/modules/pagesManager/presentationCss');
const { handleBuiltInPlaceholderSqlite } = require('../mother/modules/databaseManager/placeholders/sqlitePlaceholders');
const { _internals: { setupPagesManagerEvents } } = require('../mother/modules/pagesManager');
const { _internals: { cmsAdminApiRequest } } = require('../mother/modules/runtimeManager');

function sqlDatabase() {
  const native = new sqlite3.Database(':memory:');
  return {
    native,
    run(sql, params = []) { return new Promise((resolve, reject) => native.run(sql, params, function(err) { err ? reject(err) : resolve({ changes: this.changes, lastID: this.lastID }); })); },
    get(sql, params = []) { return new Promise((resolve, reject) => native.get(sql, params, (err, result) => err ? reject(err) : resolve(result))); },
    all(sql, params = []) { return new Promise((resolve, reject) => native.all(sql, params, (err, result) => err ? reject(err) : resolve(result))); },
    exec(sql) { return new Promise((resolve, reject) => native.exec(sql, err => err ? reject(err) : resolve())); },
    close() { return new Promise((resolve, reject) => native.close(err => err ? reject(err) : resolve())); }
  };
}
const authorized = { jwt: 'fixture', moduleName: 'pagesManager', moduleType: 'core', pageId: 24,
  decodedJWT: { permissions: { pages: { update: true } } },
  presentationCss: { language: 'en', css: '.article{color:navy}', expectedRevision: presentationCssRevision(24, 'en', '.old{}') } };

test('CSS patch requires owner, permission, exact revision and only presentation fields', () => {
  expect(validateCssPatch(authorized).css).toBe('.article{color:navy}');
  for (const decodedJWT of [undefined, { permissions: { pages: { update: false } } }]) {
    expect(() => validateCssPatch({ ...authorized, decodedJWT })).toThrow('PAGE_CSS_PATCH_FORBIDDEN');
  }
  for (const extra of [{ title: 'replacement' }, { translations: [] }, { meta: {} }, { status: 'published' }]) {
    expect(() => validateCssPatch({ ...authorized, ...extra })).toThrow('PAGE_CSS_PATCH_FIELDS_FORBIDDEN');
  }
  expect(() => validateCssPatch({ ...authorized, presentationCss: { ...authorized.presentationCss, html: '<p>replacement</p>' } })).toThrow('PAGE_CSS_PATCH_FIELDS_FORBIDDEN');
  expect(() => validateCssPatch({ ...authorized, presentationCss: { ...authorized.presentationCss, expectedRevision: undefined } })).toThrow('PAGE_CSS_PATCH_REVISION_REQUIRED');
  expect(() => validateCssPatch({ ...authorized, presentationCss: { ...authorized.presentationCss, css: 'x'.repeat(262145) } })).toThrow('PAGE_CSS_PATCH_VALUE_INVALID');
});

test('native admin facade -> Pages owner -> SQLite preserves every field and other locales on CSS-only save/reload', async () => {
  const db = sqlDatabase();
  const emitter = new EventEmitter();
  setupPagesManagerEvents(emitter);
  emitter.on('dbUpdate', async (payload, callback) => {
    try { callback(null, await handleBuiltInPlaceholderSqlite(db, payload.data.rawSQL, [payload.data.params])); }
    catch (error) { callback(error); }
  });
  try {
    await handleBuiltInPlaceholderSqlite(db, 'INIT_PAGES_TABLE', []);
    await db.run(`INSERT INTO pagesManager_pages(id,title,slug,status,lane,language,meta,seo_image) VALUES (24,'Docs','docs','draft','public','en','{"designId":5}','hero.png')`);
    for (const [language, title, html, css] of [['en', 'English', '<p>EN body</p>', '.old{}'], ['de', 'Deutsch', '<p>DE body</p>', '.de{}']]) {
      await db.run('INSERT INTO pagesManager_page_translations(page_id,language,title,html,css,seo_title,meta_desc) VALUES (24,?,?,?,?,?,?)', [language, title, html, css, 'SEO '+language, 'Description '+language]);
    }
    const beforePage = await db.get('SELECT * FROM pagesManager_pages WHERE id=24');
    const before = await db.all('SELECT * FROM pagesManager_page_translations ORDER BY language');
    const request = (permissions = authorized.decodedJWT.permissions) => cmsAdminApiRequest(emitter, 'fixture', {
      jwt: 'fixture', moduleName: 'runtimeManager', moduleType: 'core', decodedJWT: { permissions },
      resource: 'pages', action: 'update', params: { pageId: 24, presentationCss: authorized.presentationCss }
    });
    await expect(request({ pages: { update: false } })).rejects.toThrow('Forbidden');
    expect(await db.all('SELECT * FROM pagesManager_page_translations ORDER BY language')).toEqual(before);
    const response = await request();
    expect(response.data.revision).toBe(presentationCssRevision(24, 'en', '.article{color:navy}'));
    expect(await db.get('SELECT * FROM pagesManager_pages WHERE id=24')).toEqual(beforePage);
    const after = await db.all('SELECT * FROM pagesManager_page_translations ORDER BY language');
    expect(after).toEqual(before.map(row => row.language === 'en' ? { ...row, css: '.article{color:navy}' } : row));
    await expect(request()).rejects.toMatchObject({ code: 'PAGE_CSS_PATCH_VERSION_CONFLICT' });
    expect(await db.all('SELECT * FROM pagesManager_page_translations ORDER BY language')).toEqual(after);
    const missing = { ...authorized.presentationCss, language: 'fr', expectedRevision: presentationCssRevision(24, 'fr', '') };
    await expect(patchPresentationCss(db, 'sqlite', { pageId: 24, ...missing })).rejects.toMatchObject({ code: 'PAGE_CSS_PATCH_TRANSLATION_NOT_FOUND' });
  } finally { await db.close(); }
});

test.each(['postgres', 'mongo'])('%s rejects an intervening writer at the atomic update boundary', async dialect => {
  const p = { pageId: '507f1f77bcf86cd799439011', language: 'en', css: '.new{}', expectedRevision: presentationCssRevision('507f1f77bcf86cd799439011', 'en', '.old{}') };
  const query = jest.fn().mockResolvedValueOnce({ rows: [{ css: '.old{}' }] }).mockResolvedValueOnce({ rowCount: 0 });
  const collection = { findOne: jest.fn().mockResolvedValue({ css: '.old{}' }), updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }) };
  await expect(patchPresentationCss({ query, collection: () => collection }, dialect, p)).rejects.toMatchObject({ code: 'PAGE_CSS_PATCH_VERSION_CONFLICT' });
  if (dialect === 'postgres') expect(query.mock.calls[1][0]).toContain("COALESCE(css,'')=$4");
  else expect(collection.updateOne.mock.calls[0][1]).toEqual({ $set: { css: '.new{}' } });
});

test('native Pages patch reports a mirror failure without hiding the already-saved CSS', async () => {
  const db = sqlDatabase(); const emitter = new EventEmitter(); setupPagesManagerEvents(emitter);
  emitter.on('dbUpdate', async (p, cb) => { try { cb(null, await handleBuiltInPlaceholderSqlite(db, p.data.rawSQL, [p.data.params])); } catch (err) { cb(err); } });
  emitter.on('dbSelect', async (p, cb) => { try { cb(null, await handleBuiltInPlaceholderSqlite(db, p.data.rawSQL, [p.data[0], p.data[1], p.data[2]])); } catch (err) { cb(err); } });
  emitter.on('getContentEntryBySource', (_p, cb) => cb(null, { id: 22, language: 'en', content: { html: '<p>Canonical</p>', css: '.old{}' } }));
  emitter.on('updateContentEntry', (_p, cb) => cb(new Error('fixture mirror unavailable')));
  try {
    await handleBuiltInPlaceholderSqlite(db, 'INIT_PAGES_TABLE', []);
    await db.run("INSERT INTO pagesManager_pages(id,title,slug,status,lane,language,meta) VALUES (24,'Docs','docs','draft','public','en','{}')");
    await db.run("INSERT INTO pagesManager_page_translations(page_id,language,title,html,css) VALUES (24,'en','Docs','<p>Body</p>','.old{}')");
    const request = () => cmsAdminApiRequest(emitter, 'fixture', { jwt: 'fixture', moduleName: 'runtimeManager', moduleType: 'core',
      decodedJWT: authorized.decodedJWT, resource: 'pages', action: 'update', params: { pageId: 24, presentationCss: authorized.presentationCss } });
    await expect(request()).rejects.toThrow('PAGE_CSS_PATCH_MIRROR_FAILED');
    expect(await db.get('SELECT html,css FROM pagesManager_page_translations WHERE page_id=24')).toEqual({ html: '<p>Body</p>', css: authorized.presentationCss.css });
    await expect(request()).rejects.toMatchObject({ code: 'PAGE_CSS_PATCH_VERSION_CONFLICT' });
  } finally { await db.close(); }
});
