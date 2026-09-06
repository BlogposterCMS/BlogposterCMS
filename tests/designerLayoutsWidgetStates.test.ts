/** @jest-environment jsdom */
import { render } from '../ui/widgets/plainspace/admin/designerLayoutsWidget';
import { fetchDesignerLayouts } from '../ui/widgets/plainspace/admin/designerLayoutsData';

jest.mock('../ui/widgets/plainspace/admin/designerLayoutsData', () => ({
  ...jest.requireActual('../ui/widgets/plainspace/admin/designerLayoutsData'),
  fetchDesignerLayouts: jest.fn(),
  sortDesignsByRecent: (designs: unknown[]) => designs
}));

describe('design library states', () => {
  it('exposes a real design destination without requiring a popup', async () => {
    jest.mocked(fetchDesignerLayouts).mockResolvedValue([{ id: 'saved-design', title: 'Reusable shell' }]);
    const host = document.createElement('div');
    await render(host);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/studio/design/saved-design');
    expect(host.querySelector('[data-design-id="saved-design"]')).not.toBeNull();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    window.meltdownEmit = jest.fn();
  });

  it('distinguishes failed loading from an empty library and retries', async () => {
    const host = document.createElement('div');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(fetchDesignerLayouts).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    await render(host);
    expect(host.querySelector('[role="alert"]')?.getAttribute('data-error-code')).toBe('DESIGNER_LAYOUTS_LOAD_FAILED');
    expect(host.textContent).not.toContain('No Design Studio layouts');
    host.querySelector('button')!.click();
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading designs…');
    await Promise.resolve();
    expect(host.textContent).toContain('No Design Studio layouts found.');
    expect(host.querySelector('button[aria-label="Add design"]')).not.toBeNull();
    warn.mockRestore();
  });
});
