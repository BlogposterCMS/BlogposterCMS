const EventEmitter = require('events');
const express = require('express');
const sqlite3 = require('sqlite3');
const { setupSearchEvents, _internals: search } = require('../mother/modules/searchManager');
const { _internals: content } = require('../mother/modules/contentEngine');
const { buildPageContentEntryPayload } = require('../mother/modules/pagesManager/contentEngineAdapter');
const { _internals: runtime } = require('../mother/modules/runtimeManager');
const { handleSearchSqlite, handleSearchPostgres, handleSearchMongo } = require('../mother/modules/databaseManager/placeholders/searchPlaceholders');

const emit = (bus, event, payload) => new Promise((resolve, reject) =>
  bus.emit(event, { jwt: 'test', moduleName: 'searchManager', moduleType: 'core', ...payload },
    (error, value) => error ? reject(error) : resolve(value)));

test('page mirror and reindex retain exactly the same public tags', () => {
  const page = buildPageContentEntryPayload({ pageId: 8, title: 'Guide', slug: 'guide', meta: { tags: ['academy', '入门'], secretNote: 'private' } });
  const entry = { ...page, id: 8 };
  expect(content.buildSearchDocumentPayload('test', entry).meta).toEqual(search.contentEntryToSearchDocument(entry).meta);
  expect(search.contentEntryToSearchDocument(entry).meta).toEqual({ source: 'contentEngine', contentTypeKey: 'page', tags: ['academy', '入门'] });
});

test('public HTTP search applies exact all-tag filtering before pagination and reflects edits/unpublishing', async () => {
  const raw = new sqlite3.Database(':memory:');
  const db = Object.fromEntries(['exec', 'run', 'get', 'all'].map(method => [method,
    (...args) => new Promise((resolve, reject) => raw[method](...args, (error, rows) => error ? reject(error) : resolve(rows)))]));
  await handleSearchSqlite(db, 'INIT_SEARCH_TABLES');
  const bus = new EventEmitter(); setupSearchEvents(bus);
  for (const [event, key] of [['dbUpdate', 'data'], ['dbSelect', 'data']]) {
    bus.on(event, (payload, callback) => handleSearchSqlite(db, payload[key].rawSQL, payload[key].params)
      .then(value => callback(null, value), callback));
  }
  const index = (id, tags, status = 'published', language = 'en') => emit(bus, 'indexSearchDocument', {
    entryId: id, title: 'Guide ' + id, url: '/docs/' + id, contentTypeKey: 'page',
    meta: { tags }, status, visibility: status === 'published' ? 'public' : 'private', language
  });
  await index('match', ['academy', 'how-to']);
  await index('substring', ['academy-extra', 'how-to']);
  await index('one-tag', ['academy']);
  await index('draft', ['academy', 'how-to'], 'draft');
  await index('chinese', ['入门'], 'published', 'zh');
  const app = express(); runtime.registerPublicRuntimeRoutes(app, bus, 'test');
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/public/search`;
  const query = async params => { const response = await fetch(base + '?' + new URLSearchParams(params)); return { status: response.status, ...await response.json() }; };
  try {
    const filtered = await query({ tag: 'Academy,how-to', lang: 'en', limit: '1', status: 'draft' });
    expect(filtered.results.map(row => row.sourceId)).toEqual(['match']);
    expect(filtered.results[0].meta.tags).toEqual(['academy', 'how-to']);
    expect((await query({ tag: 'academy,how-to', offset: '1' })).results).toEqual([]);
    expect((await query({ tag: '入门', lang: 'zh' })).results.map(row => row.sourceId)).toEqual(['chinese']);
    expect((await query({ tag: '入门', lang: 'en' })).results).toEqual([]);
    expect((await query({ tag: '<script>' })).status).toBe(400);
    expect((await query({ tag: '<script>' })).error.code).toBe('CONTENT_TAGS_INVALID');
    await index('match', []);
    expect((await query({ tag: 'academy,how-to' })).results).toEqual([]);
    await index('match', ['academy', 'how-to']);
    await index('match', ['academy', 'how-to'], 'draft');
    expect((await query({ tag: 'academy,how-to' })).results).toEqual([]);
    expect((await query({ q: '入门', lang: 'zh' })).results).toHaveLength(1);
    const multilingual = {entryId:'shared',title:'English guide',url:'/docs/shared',language:'en',status:'published',visibility:'public',meta:{tags:['docs']},
      localizedDocuments:[{title:'English guide',body:'Sign in',language:'en'},{title:'登录指南',body:'准备工作区',language:'zh'}]};
    await emit(bus, 'indexSearchDocument', multilingual);
    expect((await query({tag:'docs',q:'准备',lang:'zh'})).results.map(row=>row.entryId)).toEqual(['shared']);
    expect((await query({tag:'docs',q:'准备',lang:'en'})).results).toEqual([]);
    await emit(bus, 'indexSearchDocument', {...multilingual,status:'draft'});
    expect((await query({tag:'docs',lang:'zh'})).results).toEqual([]);
    await emit(bus, 'indexSearchDocument', multilingual);
    await emit(bus, 'indexSearchDocument', {...multilingual,localizedDocuments:[multilingual.localizedDocuments[0]]});
    expect((await query({tag:'docs',lang:'zh'})).results).toEqual([]);
    expect((await query({tag:'docs',lang:'en'})).results).toHaveLength(1);
    await emit(bus, 'removeSearchDocument', {entryId:'shared'});
    expect((await query({tag:'docs'})).results).toEqual([]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => raw.close(resolve));
  }
});

test('Postgres binds tags as JSON and Mongo uses all-tag membership before pagination', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  await handleSearchPostgres(client, 'SEARCH_DOCUMENTS', { tags: ['academy', 'how-to'], limit: 1, offset: 2 });
  const [sql, values] = client.query.mock.calls[0];
  expect(sql).toContain('meta @> $1::jsonb');
  expect(sql.indexOf('meta @>')).toBeLessThan(sql.indexOf('LIMIT'));
  expect(values).toEqual(['{"tags":["academy","how-to"]}', 1, 2]);
  const cursor = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue([]) };
  const collection = { find: jest.fn().mockReturnValue(cursor) };
  await handleSearchMongo({ collection: () => collection }, 'SEARCH_DOCUMENTS', { tags: ['academy', 'how-to'], limit: 1 });
  expect(collection.find).toHaveBeenCalledWith({ 'meta.tags': { $all: ['academy', 'how-to'] } });
  expect(cursor.limit).toHaveBeenCalledWith(1);
});
