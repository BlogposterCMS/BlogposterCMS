import { createMeltdownClient } from '../ui/shared/api-client/meltdownClient';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('meltdown client', () => {
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
