/**
 * @jest-environment jsdom
 */

describe('favicon loader live preview boundary', () => {
  beforeEach(() => {
    jest.resetModules();
    document.head.innerHTML = '';
    window.history.replaceState(null, '', '/?designer-live-preview=1');
  });

  afterEach(() => {
    delete (window as any).meltdownEmit;
    window.history.replaceState(null, '', '/');
  });

  test('does not request public settings from the sandboxed preview frame', async () => {
    const emit = jest.fn();
    (window as any).meltdownEmit = emit;

    await import('../ui/shared/loaders/faviconLoader');
    await Promise.resolve();

    expect(emit).not.toHaveBeenCalled();
    expect(document.querySelector('link[rel="icon"]')).toBeNull();
  });
});
