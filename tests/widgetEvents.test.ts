/**
 * @jest-environment jsdom
 */

import { registerWidgetEvents } from '../ui/widgets/rendering/widgetEvents';

describe('widgetEvents', () => {
  beforeEach(() => {
    window.ADMIN_TOKEN = 'admin-token';
    window.PUBLIC_TOKEN = 'public-token';
    window.meltdownEmit = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    delete window.meltdownEmit;
  });

  it('registers valid widget API events with the active token', async () => {
    await registerWidgetEvents({
      id: 'hero',
      metadata: {
        apiEvents: ['content.viewed', 'bad event', 'widget:opened']
      }
    });

    expect(window.meltdownEmit).toHaveBeenCalledWith('registerWidgetUsage', {
      jwt: 'admin-token',
      events: ['content.viewed', 'widget:opened']
    });
  });

  it('skips registration without events, emitter, or token', async () => {
    await registerWidgetEvents({ id: 'empty', metadata: {} });
    expect(window.meltdownEmit).not.toHaveBeenCalled();

    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    await registerWidgetEvents({ id: 'no-token', metadata: { apiEvents: 'content.viewed' } });
    expect(window.meltdownEmit).not.toHaveBeenCalled();

    delete window.meltdownEmit;
    await expect(
      registerWidgetEvents({ id: 'no-emitter', metadata: { apiEvents: 'content.viewed' } })
    ).resolves.toBeUndefined();
  });

  it('logs registration failures with widget context', async () => {
    const error = new Error('boom');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.meltdownEmit = jest.fn().mockRejectedValue(error);

    await registerWidgetEvents({ id: 'broken', metadata: { apiEvents: 'content.viewed' } });

    expect(warn).toHaveBeenCalledWith(
      '[Widgets] registerWidgetUsage failed for',
      'broken',
      error
    );
  });
});
