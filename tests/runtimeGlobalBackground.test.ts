/** @jest-environment jsdom */
import { applyRuntimeGlobalBackground } from '../ui/runtime/main/runtimeGlobalBackground';
import { fetchRuntimePublicSettings } from '../ui/runtime/main/runtimePageData';

jest.mock('../ui/runtime/main/runtimePageData', () => ({ fetchRuntimePublicSettings: jest.fn() }));

describe('runtime background ownership', () => {
  beforeEach(() => { jest.resetAllMocks(); document.body.removeAttribute('style'); });

  it('does not request website colors for the admin shell', async () => {
    const setBackground = jest.spyOn(document.body.style, 'backgroundColor', 'set');
    await applyRuntimeGlobalBackground('admin', jest.fn());
    expect(fetchRuntimePublicSettings).not.toHaveBeenCalled();
    expect(setBackground).toHaveBeenCalledWith('var(--studio-canvas-subtle)');
    setBackground.mockRestore();
  });

  it('keeps configured public website colors', async () => {
    jest.mocked(fetchRuntimePublicSettings).mockResolvedValue({ DESIGN_STUDIO_GLOBAL_BODY_BACKGROUND: '#123456' });
    await applyRuntimeGlobalBackground('public', jest.fn());
    expect(document.body.style.backgroundColor).toBe('rgb(18, 52, 86)');
  });

  it('keeps the public fallback on invalid settings and transport errors', async () => {
    jest.mocked(fetchRuntimePublicSettings).mockResolvedValue({ DESIGN_STUDIO_GLOBAL_BODY_BACKGROUND: 'invalid' });
    await applyRuntimeGlobalBackground('public', jest.fn());
    expect(document.body.style.backgroundColor).toBe('rgb(242, 243, 247)');
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(fetchRuntimePublicSettings).mockRejectedValue(new Error('offline'));
    await applyRuntimeGlobalBackground('public', jest.fn());
    expect(warning).toHaveBeenCalledWith('[Renderer] RUNTIME_GLOBAL_BACKGROUND_LOAD_FAILED', expect.any(Error));
    expect(document.body.style.backgroundColor).toBe('rgb(242, 243, 247)');
    warning.mockRestore();
  });
});
