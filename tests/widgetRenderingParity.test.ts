/** @jest-environment jsdom */
import { renderWidget as renderDesigner } from '../ui/designer/app/widgets/widgetRenderer.js';
import { renderWidget as renderCatalog } from '../ui/widgets/rendering/widgetRenderer';
import { renderWidget as renderPublic } from '../ui/runtime/main/runtimeWidgetRenderer';
import { loadWidgetModule } from '../ui/widgets/rendering/widgetModuleLoader';
import { registerElement } from '../ui/designer/app/editor/editor.js';
import { addHitLayer } from '../ui/designer/app/utils.js';
import { render as renderButton } from '../ui/widgets/plainspace/public/basicwidgets/buttonWidget';

jest.mock('../ui/designer/app/editor/editor.js', () => ({ registerElement: jest.fn() }));
jest.mock('../ui/designer/app/utils.js', () => ({ addHitLayer: jest.fn() }));
jest.mock('../ui/widgets/rendering/widgetModuleLoader', () => ({ loadWidgetModule: jest.fn() }));

const definition = { id: 'textBox', codeUrl: '/ui/widgets/plainspace/public/basicwidgets/textBoxWidget.js' };
const surfaces = ['Designer', 'Catalog', 'Public'] as const;

async function mount(surface: typeof surfaces[number], data: any = null) {
  const wrapper = document.createElement('div');
  wrapper.className = 'canvas-item';
  wrapper.dataset.instanceId = 'instance-1';
  wrapper.dataset.sceneId = 'hero';
  const content = document.createElement('div');
  content.className = 'canvas-item-content';
  wrapper.append(content);
  document.body.append(wrapper);
  if (surface === 'Public') await renderPublic(wrapper, definition, data);
  else if (surface === 'Designer') await renderDesigner(wrapper, definition, { 'instance-1': data });
  else await renderCatalog(wrapper, definition, { 'instance-1': data });
  return (wrapper.shadowRoot || content).querySelector('.widget-container') as HTMLElement;
}

beforeEach(() => {
  document.body.replaceChildren();
  jest.clearAllMocks();
  window.ADMIN_TOKEN = 'editor-token';
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true, value: class { replaceSync() {} }
  });
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    configurable: true, writable: true, value: []
  });
});

afterEach(() => { delete window.ADMIN_TOKEN; jest.restoreAllMocks(); });

it('produces identical button content and component styles through all three surfaces', async () => {
  (loadWidgetModule as jest.Mock).mockResolvedValue({ render: renderButton });
  const output: string[] = [];
  for (const surface of surfaces) {
    const container = await mount(surface, {
      meta: { label: 'Read more', href: '/news', variant: 'secondary', targetBlank: true }
    });
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/news');
    expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    output.push(container.innerHTML);
  }
  expect(output[1]).toBe(output[0]);
  expect(output[2]).toBe(output[0]);
});

describe.each(surfaces)('%s uses the common widget lifecycle', surface => {
  it('awaits module rendering and preserves instance overrides and credential boundaries', async () => {
    let context: any;
    (loadWidgetModule as jest.Mock).mockResolvedValue({ render: async (target: HTMLElement, ctx: any) => {
      await Promise.resolve();
      context = ctx;
      target.textContent = ctx.instanceMetadata.title;
    } });
    const container = await mount(surface, {
      metadata: '{"title":"Original","rows":2}', meta: { title: 'Override' }
    });
    expect(container.textContent).toBe('Override');
    expect(context.instanceMetadata).toEqual({ title: 'Override', rows: 2 });
    expect(context.id).toBe('instance-1');
    expect(context.jwt).toBe(surface === 'Public' ? undefined : 'editor-token');
    if (surface !== 'Catalog') expect(context.scene.sceneId).toBe('hero');
    expect(addHitLayer).toHaveBeenCalledTimes(surface === 'Designer' ? 1 : 0);
  });

  it.each(['{bad json', '[]', 'null', 42])('ignores invalid metadata %s without losing the module', async invalid => {
    const render = jest.fn();
    (loadWidgetModule as jest.Mock).mockResolvedValue({ render });
    await mount(surface, { metadata: invalid, meta: { title: 'Kept' }, html: '  ' });
    expect(render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      instanceMetadata: { title: 'Kept' }
    }));
  });

  it('sanitizes inline content identically and registers editable roots only in Studio', async () => {
    const container = await mount(surface, {
      html: '<p class="editable">Hello</p><img src="/image.png" onerror="alert(1)"><script>alert(1)</script>',
      css: '.editable { color: red; }'
    });
    expect(container.querySelector('p')?.textContent).toBe('Hello');
    expect(container.querySelector('[onerror], script')).toBeNull();
    expect(container.parentNode?.querySelector('style')?.textContent).toBeDefined();
    expect(loadWidgetModule).not.toHaveBeenCalled();
    expect(registerElement).toHaveBeenCalledTimes(surface === 'Designer' ? 1 : 0);
    if (surface === 'Designer') expect(registerElement).toHaveBeenCalledWith(container.querySelector('.editable'));
  });

  it.each([
    ['blocked', 'WIDGET_RUNTIME_BLOCKED_CODE_URL'],
    ['missing-render', 'WIDGET_RUNTIME_MISSING_RENDER'],
    ['async-failure', 'WIDGET_RUNTIME_RENDER_FAILED']
  ])('shows the same diagnostic for %s', async (failure, code) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (loadWidgetModule as jest.Mock).mockResolvedValue(failure === 'blocked' ? null :
      failure === 'missing-render' ? {} : { render: async () => { throw new Error('failed'); } });
    const container = await mount(surface);
    expect(container.querySelector('[role="alert"]')?.getAttribute('data-error-code')).toBe(code);
  });
});
