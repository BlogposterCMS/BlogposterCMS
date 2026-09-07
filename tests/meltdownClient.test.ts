import { createMeltdownClient } from '../ui/shared/api-client/meltdownClient';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('meltdown client', () => {
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
