import { resolveWidgetModuleUrl } from '../ui/widgets/rendering/widgetModulePaths';

const BASE = 'https://example.test/admin/home';

describe('resolveWidgetModuleUrl', () => {
  it('allows canonical bundled PlainSpace widgets', () => {
    expect(resolveWidgetModuleUrl('/ui/widgets/plainspace/admin/widgetListWidget.js', BASE))
      .toBe('/ui/widgets/plainspace/admin/widgetListWidget.js');
  });

  it('normalizes legacy bundled PlainSpace widget shims to canonical UI modules', () => {
    expect(
      resolveWidgetModuleUrl(
        '/plainspace/widgets/admin/defaultwidgets/contentSummaryWidget.js?v=1#root',
        BASE
      )
    ).toBe('/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js?v=1#root');
  });

  it('allows documented community widget assets', () => {
    expect(resolveWidgetModuleUrl('/widgets/weather_tile/widget.js?v=1#root', BASE))
      .toBe('/widgets/weather_tile/widget.js?v=1#root');
  });

  it('blocks retired, remote, and broad public script paths', () => {
    expect(resolveWidgetModuleUrl('/plainspace/main/pageRenderer.js', BASE)).toBeNull();
    expect(resolveWidgetModuleUrl('/assets/js/pageRenderer.js', BASE)).toBeNull();
    expect(resolveWidgetModuleUrl('https://evil.example/widget.js', BASE)).toBeNull();
    expect(resolveWidgetModuleUrl('/widgets/weather_tile/extra.js', BASE)).toBeNull();
  });
});
