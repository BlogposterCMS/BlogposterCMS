/**
 * @jest-environment jsdom
 */

import {
  adminLaneAuthPayload,
  laneAuthPayload,
  normalizeDataList,
  normalizeLayoutResponse,
  resolveRuntimeWidgetLane,
  unwrapData
} from '../ui/runtime/main/runtimePageDataHelpers';

describe('runtimePageDataHelpers', () => {
  beforeEach(() => {
    window.ADMIN_TOKEN = 'admin-token';
    window.PUBLIC_TOKEN = 'public-token';
  });

  afterEach(() => {
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
  });

  it('builds lane-scoped auth payloads', () => {
    expect(laneAuthPayload('admin')).toEqual({ jwt: 'admin-token' });
    expect(laneAuthPayload('public')).toEqual({ jwt: 'public-token' });
    expect(adminLaneAuthPayload('admin')).toEqual({ jwt: 'admin-token' });
    expect(adminLaneAuthPayload('public')).toEqual({});
  });

  it('normalizes layout and data response shapes', () => {
    expect(normalizeLayoutResponse({ layout: [{ id: 'hero' }] })).toEqual([{ id: 'hero' }]);
    expect(normalizeLayoutResponse({ data: [{ id: 'ignored' }] })).toEqual([]);
    expect(normalizeLayoutResponse(null)).toEqual([]);

    expect(normalizeDataList([{ id: 'direct' }])).toEqual([{ id: 'direct' }]);
    expect(normalizeDataList({ data: [{ id: 'wrapped' }] })).toEqual([{ id: 'wrapped' }]);
    expect(normalizeDataList({ data: 'nope' })).toEqual([]);
  });

  it('unwraps data payloads without changing bare values', () => {
    expect(unwrapData({ data: { id: 'page-1' } })).toEqual({ id: 'page-1' });
    expect(unwrapData({ id: 'page-1' })).toEqual({ id: 'page-1' });
    expect(unwrapData(null)).toBeNull();
  });

  it('resolves widget lanes without allowing admin widgets on public pages', () => {
    const warn = jest.fn();

    expect(resolveRuntimeWidgetLane('admin', { widgetLane: 'admin' }, warn)).toBe('admin');
    expect(resolveRuntimeWidgetLane('admin', { widgetLane: 'public' }, warn)).toBe('public');
    expect(resolveRuntimeWidgetLane('public', {}, warn)).toBe('public');
    expect(resolveRuntimeWidgetLane('public', { widgetLane: 'admin' }, warn)).toBe('public');
    expect(warn).toHaveBeenCalledWith(
      '[Renderer] widgetLane="admin" on public page => forcing "public"'
    );
  });
});
