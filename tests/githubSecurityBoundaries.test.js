'use strict';

const express = require('express');
const { identifier, literal, columnType } = require('../mother/modules/databaseManager/helpers/postgresSql');
const { handleBuiltInPlaceholderPostgres } = require('../mother/modules/databaseManager/placeholders/postgresPlaceholders');
const { htmlText } = require('../mother/utils/htmlText');
const { mountSecurityMiddleware, mountRequestLimits } = require('../mother/server/http/securityMiddleware');
const { handleBuiltInPlaceholderSqlite } = require('../mother/modules/databaseManager/placeholders/sqlitePlaceholders');
const { patchPresentationCss, presentationCssRevision } = require('../mother/modules/pagesManager/presentationCss');

test('DDL escapes quote/backslash delimiters and rejects injected types before executing', async () => {
  expect(identifier('cms"; DROP SCHEMA public;--')).toBe('"cms""; DROP SCHEMA public;--"');
  expect(literal("abc\\'; DROP ROLE cms;--")).toBe("E'abc\\\\''; DROP ROLE cms;--'");
  expect(() => identifier('bad\0name')).toThrow('DB_SQL_IDENTIFIER_INVALID');
  expect(columnType('VARCHAR(16)')).toBe('VARCHAR(16)');
  const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  await expect(handleBuiltInPlaceholderPostgres(client, 'ADD_USER_FIELD', {
    fieldName: 'color', fieldType: 'TEXT; DROP TABLE users;--'
  })).rejects.toThrow('DB_SQL_COLUMN_TYPE_INVALID');
  expect(client.query).not.toHaveBeenCalled();
  await handleBuiltInPlaceholderPostgres(client, 'ADD_USER_FIELD', { fieldName: 'ui_color', fieldType: 'VARCHAR(16)' });
  expect(client.query.mock.calls[0][0]).toContain('"ui_color" VARCHAR(16)');
  const sqlite = { run: jest.fn(), all: jest.fn().mockResolvedValue([]) };
  await expect(handleBuiltInPlaceholderSqlite(sqlite, 'ADD_USER_FIELD', {
    fieldName: 'color', fieldType: 'TEXT; DROP TABLE users;--'
  })).rejects.toThrow('DB_SQL_COLUMN_TYPE_INVALID');
  expect(sqlite.run.mock.calls).toEqual([['PRAGMA foreign_keys = ON;']]);
  await handleBuiltInPlaceholderSqlite(sqlite, 'ADD_USER_FIELD', { fieldName: 'ui_color', fieldType: 'VARCHAR(16)' });
  expect(sqlite.run).toHaveBeenCalledWith('ALTER TABLE usermanagement_users ADD COLUMN "ui_color" VARCHAR(16);');
});

test('malicious CSS and IDs remain parameter values; optimistic version control still succeeds', async () => {
  const pageId = "1'; DROP TABLE pages;--";
  const css = "'}; DROP TABLE pages;--";
  const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ css: '.old{}' }] }).mockResolvedValueOnce({ rowCount: 1 }) };
  await patchPresentationCss(db, 'postgres', { pageId, language: 'en', css,
    expectedRevision: presentationCssRevision(pageId, 'en', '.old{}') });
  for (const [sql] of db.query.mock.calls) {
    expect(sql).not.toContain(pageId); expect(sql).not.toContain(css);
  }
  expect(db.query.mock.calls[1][1]).toEqual([css, pageId, 'en', '.old{}']);
});

test('HTML text extraction handles malformed tags, entities and non-text script/style bodies', () => {
  expect(htmlText('<p>Hello <strong>world</strong> &amp; friends</p><script>secret()</script><style>.secret{}</style>')).toBe('Hello world & friends');
  expect(htmlText('<script src=x>secret()')).toBe('');
  expect(htmlText('<p title=">">你好</p><img src=x onerror=evil()> next')).toBe('你好 next');
});

test('aggregate limiter rejects excess static/API work before body parsing; normal requests still work', async () => {
  const original = process.env.HTTP_RATE_LIMIT_MAX;
  process.env.HTTP_RATE_LIMIT_MAX = '2';
  const app = express();
  mountRequestLimits(app);
  app.get('/asset.js', (_req, res) => res.type('js').send('/* okay */'));
  mountSecurityMiddleware(app, { isProduction: false });
  app.post('/api', (req, res) => res.json(req.body));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    expect((await fetch(`${base}/asset.js`)).status).toBe(200);
    const normal = await fetch(`${base}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"okay":true}' });
    expect(await normal.json()).toEqual({ okay: true });
    const blocked = await fetch(`${base}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'invalid-json' });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'HTTP_RATE_LIMIT_EXCEEDED' });
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (original === undefined) delete process.env.HTTP_RATE_LIMIT_MAX; else process.env.HTTP_RATE_LIMIT_MAX = original;
  }
});
