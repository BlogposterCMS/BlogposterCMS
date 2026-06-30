/**
 * @jest-environment jsdom
 */

import {
  buildPageLanePayload,
  errorMessage,
  fetchPageStats,
  fetchPagesByLane,
  summarizePageStats,
  toPages
} from '../ui/widgets/plainspace/admin/defaultwidgets/pageStatsData';

describe('pageStatsData', () => {
  it('normalizes page list responses defensively', () => {
    expect(toPages([{ id: 'a' }, null, 'bad'])).toEqual([{ id: 'a' }]);
    expect(toPages({ data: [{ status: 'published' }, 42] })).toEqual([{ status: 'published' }]);
    expect(toPages({ data: 'bad' })).toEqual([]);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('builds lane payloads and summarizes public/admin pages', () => {
    expect(buildPageLanePayload('admin-token', 'public')).toEqual({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'byLane',
      params: { lane: 'public' }
    });

    expect(summarizePageStats(
      [{ status: 'published' }, { status: 'draft' }, { status: 'archived' }],
      [{ status: 'published' }, {}]
    )).toEqual({
      total: 5,
      published: 1,
      draft: 1,
      adminCount: 2
    });
  });

  it('fetches pages by lane through the Pages Manager contract', async () => {
    const emit = jest.fn(async (_eventName, payload) => (
      payload.params.lane === 'admin'
        ? { data: [{ status: 'draft' }] }
        : { data: [] }
    ));

    await expect(fetchPagesByLane(emit, 'admin-token', 'admin'))
      .resolves.toEqual([{ status: 'draft' }]);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'byLane',
      params: { lane: 'admin' }
    });
  });

  it('fetches and summarizes page statistics', async () => {
    const emit = jest.fn(async (_eventName, payload) => (
      payload.params.lane === 'public'
        ? { data: [{ status: 'published' }, { status: 'draft' }] }
        : { data: [{ status: 'draft' }] }
    ));

    await expect(fetchPageStats(emit, 'admin-token')).resolves.toEqual({
      total: 3,
      published: 1,
      draft: 1,
      adminCount: 1
    });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchPageStats(undefined as never, 'admin-token'))
      .rejects.toThrow('PLAINSPACE_PAGE_STATS_EMITTER_UNAVAILABLE');
  });
});
