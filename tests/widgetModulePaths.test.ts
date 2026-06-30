import { resolveWidgetModuleUrl } from '../ui/widgets/rendering/widgetModulePaths';

const BASE = 'https://example.test/admin/home';

describe('resolveWidgetModuleUrl', () => {
  it('allows canonical bundled PlainSpace widgets', () => {
    expect(resolveWidgetModuleUrl('/ui/widgets/plainspace/admin/widgetListWidget.js', BASE))
      .toBe('/ui/widgets/plainspace/admin/widgetListWidget.js');
  });

  it('blocks retired bundled PlainSpace widget paths', () => {
    const retiredWidgetUrl = ['/plainspace', 'widgets/admin/defaultwidgets/contentSummaryWidget.js?v=1#root'].join('/');
    expect(
      resolveWidgetModuleUrl(
        retiredWidgetUrl,
        BASE
      )
    ).toBeNull();
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
