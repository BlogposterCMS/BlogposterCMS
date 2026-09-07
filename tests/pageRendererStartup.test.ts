/** @jest-environment jsdom */
import { renderRuntimePage } from '../ui/runtime/main/pageRenderer';
import { fetchRuntimePageBySlug, loadRuntimeGlobalLayout } from '../ui/runtime/main/runtimePageData';
import { renderAdminRuntimeGrid } from '../ui/runtime/main/runtimeAdminGrid';
import { renderPublicRuntimePageContent } from '../ui/runtime/main/runtimePageComposition';

jest.mock('../ui/runtime/main/widgetRuntimeGateway', () => ({ renderAdminSettingsSurface: jest.fn().mockResolvedValue(false) }));
jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: { alert: jest.fn() } }));
jest.mock('../ui/runtime/main/runtimePageShell', () => ({
  ensureGlobalStyle: jest.fn(), ensureLayout: jest.fn(),
  resolveRuntimeShellConfig: (page: any) => page.meta || {}
}));
jest.mock('../ui/runtime/main/runtimeShellPartials', () => ({ hydrateRuntimeShellPartials: jest.fn() }));
jest.mock('../ui/runtime/main/runtimeGlobalBackground.js', () => ({ applyRuntimeGlobalBackground: jest.fn() }));
jest.mock('../ui/runtime/main/runtimeAdminNavigation', () => ({ bindAdminContentNavigation: jest.fn() }));
jest.mock('../ui/runtime/main/runtimePageComposition', () => ({ renderPublicRuntimePageContent: jest.fn() }));
jest.mock('../ui/runtime/main/runtimeAdminGrid', () => ({ renderAdminRuntimeGrid: jest.fn() }));
jest.mock('../ui/runtime/main/runtimePageData', () => ({
  fetchRuntimePageBySlug: jest.fn(),
  fetchRuntimeWidgetRegistry: jest.fn().mockResolvedValue([]),
  loadRuntimeGlobalLayout: jest.fn(),
  initializeRuntimeDesignDefaults: jest.fn(),
  resolveRuntimeWidgetLane: (lane: string) => lane
}));

describe('shared runtime startup layout reads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<main id="content"></main>';
    window.meltdownEmit = jest.fn();
    jest.mocked(loadRuntimeGlobalLayout).mockResolvedValue([{ id: 'global-slot' }]);
  });

  it.each(['full', 'content-only'] as const)('skips unused global slots for fixed admin pages during %s rendering', async mode => {
    jest.mocked(fetchRuntimePageBySlug).mockResolvedValue({ id: 'analytics', meta: { dashboardLayout: 'fixed' } });
    await renderRuntimePage({ lane: 'admin', slug: 'analytics', debug: false }, mode);
    expect(loadRuntimeGlobalLayout).not.toHaveBeenCalled();
    expect(renderAdminRuntimeGrid).toHaveBeenCalledWith(expect.objectContaining({ globalLayout: [] }));
  });

  it.each(['admin', 'public'] as const)('retains inherited global slots for the %s runtime', async lane => {
    jest.mocked(fetchRuntimePageBySlug).mockResolvedValue({ id: 'home', meta: {} });
    await renderRuntimePage({ lane, slug: 'home', debug: false });
    expect(loadRuntimeGlobalLayout).toHaveBeenCalledWith(window.meltdownEmit, lane);
    const render = lane === 'admin' ? renderAdminRuntimeGrid : renderPublicRuntimePageContent;
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ globalLayout: [{ id: 'global-slot' }] }));
  });

  it('does not apply the admin optimization to a public page with fixed metadata', async () => {
    jest.mocked(fetchRuntimePageBySlug).mockResolvedValue({ id: 'site', meta: { dashboardLayout: 'fixed' } });
    await renderRuntimePage({ lane: 'public', slug: 'site', debug: false });
    expect(loadRuntimeGlobalLayout).toHaveBeenCalledTimes(1);
  });
});
