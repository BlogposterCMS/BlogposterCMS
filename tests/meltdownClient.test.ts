import { createMeltdownClient } from '../ui/shared/api-client/meltdownClient';
import { dispatchAppRuntimeRequest } from '../ui/shell/apps/appFrameLoaderData';
import { gunzipSync } from 'node:zlib';
import express from 'express';
import bodyParser from 'body-parser';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('meltdown client', () => {
  it('signals dispatch only after the command fence clears and removes expired queued writes', async () => {
    jest.useFakeTimers();
    try {
      let release!: (response: Response) => void;
      const fetchMock = jest.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
        .mockResolvedValue(jsonResponse({ data: 'ok' }));
      const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
      const fence = client.emit('save', {});
      const onDispatch = jest.fn();
      const expired = expect(client.emit('delete', {}, undefined, { queueTimeout: 1000, onDispatch })).rejects.toThrow('MELTDOWN_REQUEST_QUEUE_TIMEOUT');
      await jest.advanceTimersByTimeAsync(1000);
      await expired;
      expect(onDispatch).not.toHaveBeenCalled();
      const readStarted = jest.fn();
      const read = client.emit('cmsAdminApiRequest', { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'getBySlug' }, undefined,
        { queueTimeout: 30000, onDispatch: readStarted });
      expect(readStarted).not.toHaveBeenCalled();
      release(jsonResponse({ data: 'saved' }));
      await fence; await read;
      expect(readStarted).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body).eventName)).toEqual(['save', 'cmsAdminApiRequest']);
    } finally { jest.useRealTimers(); }
  });
  it('compresses a large real bridge envelope without changing auth, CSRF or snapshot content', async () => {
    const snapshot = { appName: 'designer', state: { layout: '布局 '.repeat(30000) } };
    const fetchMock = jest.fn(async (_url: unknown, init: RequestInit) => {
      expect(init.credentials).toBe('same-origin');
      expect(init.headers).toMatchObject({ 'X-Public-Token': 'admin', 'X-CSRF-Token': 'csrf',
        'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
      const compressed = Buffer.from(init.body as ArrayBuffer);
      expect(compressed.length).toBeLessThan(3000);
      const decoded = JSON.parse(gunzipSync(compressed).toString('utf8'));
      expect(decoded.payload.jwt).toBeUndefined();
      expect(decoded.payload.data).toEqual({ eventName: 'agent.publishSurfaceSnapshot', payload: snapshot });
      return jsonResponse({ data: { data: 'accepted' } });
    });
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch,
      tokenProvider: { getPublicToken: () => null, getCsrfToken: () => 'csrf' } });
    expect(await dispatchAppRuntimeRequest(client.emit, 'admin', 'designer', 'agent.publishSurfaceSnapshot', snapshot)).toBe('accepted');
  });

  it('uses the existing JSON parser decoded-body limit for compressed requests', async () => {
    const app = express();
    app.use(bodyParser.json({ limit: '32kb' }));
    const handler = jest.fn((_req, res) => res.json({ data: 'accepted' }));
    app.post('/api/meltdown', handler);
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status).json({ error: error.type }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const port = (server.address() as import('node:net').AddressInfo).port;
      const client = createMeltdownClient({ endpoint: `http://127.0.0.1:${port}/api/meltdown` });
      await expect(client.emit('dispatchAppEvent', { data: 'x'.repeat(100000) })).rejects.toThrow('entity.too.large');
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('schedules real AppLoader read envelopes concurrently without bypassing save fences', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = jest.fn(() => new Promise<Response>(resolve => pending.push(resolve)));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const emit = (resource: string, action: string) => dispatchAppRuntimeRequest(client.emit, 'admin', 'designer',
      'cmsAdminApiRequest', { moduleName: 'runtimeManager', moduleType: 'core', resource, action });
    const reads = [emit('pages', 'get'), emit('pages', 'getBySlug'), emit('navigation', 'locations'), emit('designer', 'list')];
    const save = emit('designer', 'save');
    const fresh = emit('pages', 'get');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    pending.slice(0, 4).forEach(resolve => resolve(jsonResponse({ data: { data: 'before' } })));
    expect(await Promise.all(reads)).toEqual(['before', 'before', 'before', 'before']);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    pending[4]!(jsonResponse({ data: { data: 'saved' } })); await save;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(6);
    pending[5]!(jsonResponse({ data: { data: 'fresh' } })); expect(await fresh).toBe('fresh');
  });
  const read = (resource = 'pages', action = 'getBySlug') => ({
    moduleName: 'runtimeManager', moduleType: 'core', resource, action, jwt: 'admin'
  });

  it.each([
    [['designer', 'list'], ['navigation', 'locations'], ['navigation', 'menus'], ['designer', 'getLayout']],
    [['content', 'get'], ['contentTypes', 'list'], ['media', 'listLocalFolder'], ['media', 'listForContent']],
    [['users', 'get'], ['roles', 'list'], ['permissions', 'list'], ['users', 'access']],
    [['fonts', 'listProviders'], ['fonts', 'list'], ['sitePresets', 'list'], ['auth', 'loginStrategies']]
  ])('overlaps workspace reads %j, fences mutations and fetches private data fresh', async (...actions) => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = jest.fn(() => new Promise<Response>(resolve => pending.push(resolve)));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const reads = actions.map(([resource, action]) => client.emit('cmsAdminApiRequest', read(resource, action)));
    const save = client.emit('cmsAdminApiRequest', read('designer', 'save'));
    const fresh = client.emit('cmsAdminApiRequest', read(...actions[0] as [string, string]));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    pending.slice(0, 4).forEach(resolve => resolve(jsonResponse({ data: 'before' })));
    await Promise.all(reads);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    pending[4]!(jsonResponse({ data: 'saved' })); await save;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(6);
    pending[5]!(jsonResponse({ data: 'fresh' })); expect(await fresh).toBe('fresh');
    const again = client.emit('cmsAdminApiRequest', read(...actions[0] as [string, string]));
    expect(fetchMock).toHaveBeenCalledTimes(7);
    pending[6]!(jsonResponse({ data: 'latest' })); expect(await again).toBe('latest');
  });

  it('keeps stateful summaries and unknown actions ordered despite read-like names', async () => {
    let release!: (response: Response) => void;
    const fetchMock = jest.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValue(jsonResponse({ data: 'ok' }));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const calls = [client.emit('cmsAdminApiRequest', read('analytics', 'summary')),
      client.emit('cmsAdminApiRequest', read('unknown', 'get')),
      client.emit('cmsAdminApiRequest', read('media', 'list'))];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(jsonResponse({ data: 'summary' }));
    await Promise.all(calls);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('overlaps private Settings and inventory reads while fencing settings saves and source checks', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = jest.fn(() => new Promise<Response>(resolve => pending.push(resolve)));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const reads = [client.emit('cmsAdminApiRequest', read('settings', 'get')),
      client.emit('cmsAdminApiRequest', read('modules', 'registry')),
      client.emit('cmsAdminApiRequest', read('modules', 'system')),
      client.emit('cmsAdminApiRequest', read('apps', 'list'))];
    const save = client.emit('cmsAdminApiRequest', read('settings', 'set'));
    const check = client.emit('cmsAdminApiRequest', read('modules', 'checkUpdates'));
    const fresh = client.emit('cmsAdminApiRequest', read('settings', 'get'));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    pending.slice(0, 4).forEach(resolve => resolve(jsonResponse({ data: 'before' })));
    await Promise.all(reads);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    pending[4]!(jsonResponse({ data: 'saved' })); await save;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(6);
    pending[5]!(jsonResponse({ data: 'checked' })); await check;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(7);
    pending[6]!(jsonResponse({ data: 'after' }));
    expect(await fresh).toBe('after');
    // A repeated private setting read must issue a new authorized request.
    const again = client.emit('cmsAdminApiRequest', read('settings', 'get'));
    expect(fetchMock).toHaveBeenCalledTimes(8);
    pending[7]!(jsonResponse({ data: 'latest' })); expect(await again).toBe('latest');
  });

  it('runs four known admin reads concurrently and fences saves and subsequent reads', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = jest.fn((_url: unknown, _options: any) => new Promise<Response>(resolve => pending.push(resolve)));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const before = Array.from({ length: 5 }, () => client.emit('cmsAdminApiRequest', read()));
    const save = client.emit('cmsAdminApiRequest', read('pages', 'update'));
    const after = client.emit('cmsAdminApiRequest', read());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    pending[0]!(jsonResponse({ data: 'first' }));
    await before[0];
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    pending.slice(1, 5).forEach(resolve => resolve(jsonResponse({ data: 'before' })));
    await Promise.all(before);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(JSON.parse(fetchMock.mock.calls[5]![1]!.body).payload.action).toBe('update');
    pending[5]!(jsonResponse({ data: 'saved' }));
    await save;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(7);
    pending[6]!(jsonResponse({ data: 'after' }));
    await after;
  });

  it('deduplicates presentation reads, isolates returned objects and expires after 30 seconds', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: { widgets: ['one'] } })));
      const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
      const payload = read('plainSpace', 'widgetRegistry');
      const [a, b] = await Promise.all([
        client.emit<any>('cmsAdminApiRequest', payload), client.emit<any>('cmsAdminApiRequest', payload)
      ]);
      a.widgets.push('changed');
      expect(b.widgets).toEqual(['one']);
      await client.emit('cmsAdminApiRequest', payload);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(31_001);
      await client.emit('cmsAdminApiRequest', payload);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });

  it('invalidates presentation reads on commands, retries failures and separates credentials', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: 'ok' })));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const payload = read('plainSpace', 'widgetRegistry');
    await client.emit('cmsAdminApiRequest', payload);
    await client.emit('cmsAdminApiRequest', { ...payload, jwt: 'other-user' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await client.emit('cmsAdminApiRequest', read('widgets', 'update'));
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(client.emit('cmsAdminApiRequest', payload)).rejects.toThrow('offline');
    await client.emit('cmsAdminApiRequest', payload);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('never reuses an in-flight pre-save snapshot for a post-save read', async () => {
    let release!: (response: Response) => void;
    const fetchMock = jest.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: 'new' })));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const payload = read('plainSpace', 'widgetRegistry');
    const old = client.emit('cmsAdminApiRequest', payload);
    const save = client.emit('cmsAdminApiRequest', read('widgets', 'update'));
    const fresh = client.emit('cmsAdminApiRequest', payload);
    release(jsonResponse({ data: 'old' }));
    expect(await old).toBe('old');
    await save;
    expect(await fresh).toBe('new');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('drains ordered admin requests without idle timers, including after a failure', async () => {
    jest.useFakeTimers();
    try {
      let release!: (response: Response) => void;
      const response = { ok: true, clone: () => ({ text: async () => '{"data":"ok"}' }) } as Response;
      const fetchMock = jest.fn()
        .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
        .mockRejectedValueOnce(new Error('request failed'))
        .mockResolvedValue(response);
      const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
      const completed = Promise.allSettled([
        client.emit('cmsAdminApiRequest', { action: 'save' }),
        client.emit('dispatchAppEvent'),
        client.emit('cmsAdminApiRequest', { action: 'get' })
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      release(response);
      // No clock advance: a settled response must release the next command.
      await jest.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect((await completed).map(result => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('honors explicitly configured pacing between ordered requests', async () => {
    jest.useFakeTimers();
    try {
      const response = { ok: true, clone: () => ({ text: async () => '{"data":"ok"}' }) } as Response;
      const fetchMock = jest.fn().mockResolvedValue(response);
      const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch, throttleDelay: 100 });
      const completed = Promise.all([client.emit('first'), client.emit('second')]);
      await jest.advanceTimersByTimeAsync(99);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await completed;
      await jest.runOnlyPendingTimersAsync();
    } finally {
      jest.useRealTimers();
    }
  });

  it('lets a local picker load files through the same client before the user confirms it', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: { files: ['hero.png'] } }));
    let close!: (value: unknown) => void;
    let loaded!: Promise<unknown>;
    const client = createMeltdownClient({
      fetchImpl: fetchMock as typeof fetch, throttleDelay: 0,
      customEventHandler: event => {
        if (event !== 'openMediaExplorer') return undefined;
        loaded = client.emit('cmsAdminApiRequest', { resource: 'media', action: 'listLocalFolder' });
        return new Promise(resolve => { close = resolve; });
      }
    });
    const picker = client.emit('openMediaExplorer');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(loaded).resolves.toEqual({ files: ['hero.png'] });
    close({ cancelled: true });
    await expect(picker).resolves.toEqual({ cancelled: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).eventName).toBe('cmsAdminApiRequest');
  });

  it('rejects local-handler errors without blocking later backend commands', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: 'ok' }));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch, throttleDelay: 0,
      customEventHandler: event => { if (event === 'localFailure') throw new Error('local failure'); }
    });
    await expect(client.emit('localFailure')).rejects.toThrow('local failure');
    await expect(client.emit('cmsAdminApiRequest')).resolves.toBe('ok');
  });
  it('bounds public reads at four and releases a slot after a failed request', async () => {
    const pending: Array<{ resolve: (response: Response) => void; reject: (error: Error) => void }> = [];
    const fetchMock = jest.fn(() => new Promise<Response>((resolve, reject) => pending.push({ resolve, reject })));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch });
    const requests = Array.from({ length: 5 }, () => client.emit('cmsPublicRuntimeRequest'));
    const finished = Promise.allSettled(requests);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    pending[0]!.reject(new Error('network failure'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    pending.slice(1).forEach(item => item.resolve(jsonResponse({ data: 'ok' })));
    expect((await finished).map(result => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
  });

  it('keeps commands ordered while public reads can progress independently', async () => {
    let release!: (response: Response) => void;
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: 'ok' })));
    const client = createMeltdownClient({ fetchImpl: fetchMock as typeof fetch, throttleDelay: 0 });
    const first = client.emit('cmsAdminApiRequest', { action: 'save' });
    const second = client.emit('cmsAdminApiRequest', { action: 'delete' });
    await client.emit('cmsPublicRuntimeRequest');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release(jsonResponse({ data: 'saved' }));
    await Promise.all([first, second]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).payload.action).toBe('delete');
  });
  it('sends jwt as a header and keeps it out of the event body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
    const client = createMeltdownClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      throttleDelay: 0,
      tokenProvider: {
        getPublicToken: () => 'public-token',
        getCsrfToken: () => 'csrf-token'
      }
    });

    const result = await client.emit('getPage', {
      jwt: 'explicit-token',
      moduleName: 'pagesManager'
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Public-Token']).toBe('explicit-token');
    expect(options.headers['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(options.body)).toEqual({
      eventName: 'getPage',
      payload: { moduleName: 'pagesManager' }
    });
  });

  it('falls back to the public token when payload has no jwt', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: 'ok' }));
    const client = createMeltdownClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      throttleDelay: 0,
      tokenProvider: {
        getPublicToken: () => 'public-token',
        getCsrfToken: () => null
      }
    });

    await client.emit('ensurePublicToken', { moduleName: 'auth' });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Public-Token']).toBe('public-token');
  });

  it('sends batch events to the batch endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ results: [1, 2] }));
    const client = createMeltdownClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider: {
        getPublicToken: () => null,
        getCsrfToken: () => 'csrf-token'
      }
    });

    const results = await client.emitBatch([{ eventName: 'a', payload: { x: 1 } }], 'jwt');

    expect(results).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meltdown/batch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Public-Token': 'jwt',
          'X-CSRF-Token': 'csrf-token'
        })
      })
    );
  });

  it('short-circuits custom UI events without fetching', async () => {
    const fetchMock = jest.fn();
    const client = createMeltdownClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      customEventHandler(eventName) {
        if (eventName === 'openMediaExplorer') return { shareURL: '/media/demo.png' };
        return undefined;
      }
    });

    await expect(client.emit('openMediaExplorer')).resolves.toEqual({
      shareURL: '/media/demo.png'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
