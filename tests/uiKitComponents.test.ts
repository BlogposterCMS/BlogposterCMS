/** @jest-environment jsdom */
import { normalizeKitComponents, resolveKitComponent, componentWidgetPreset, componentCssValue } from '../ui/shared/design-system/componentDefinitions';
import { renderKitComponent } from '../ui/shared/design-system/componentRenderer';
import { normalizePresetPackage } from '../mother/modules/sitePresets/sitePresetsService';
import defaultKit from '../presets/site-preset-default/preset.json';
import { render as renderWidget } from '../ui/widgets/plainspace/public/basicwidgets/uiKitComponentWidget';

afterEach(() => { document.body.replaceChildren(); document.documentElement.removeAttribute('data-theme'); });
const mount = (definition: any, options = {}) => {
  const host = document.createElement('div'); document.body.append(host); renderKitComponent(host, definition, options);
  return host.querySelector('bp-kit-component')!.shadowRoot!;
};

test('public widget consumes persisted metadata without enhancing unrelated page controls', async () => {
  document.body.innerHTML = '<select id="unrelated"><option>Native page field</option></select>';
  const host = document.createElement('div'); document.body.append(host);
  const component = resolveKitComponent([defaultKit], defaultKit.id, 'primary', { label: 'Saved label' });
  renderWidget(host, { instanceMetadata: { settings: { component: JSON.parse(JSON.stringify(component)) } } });
  await Promise.resolve();
  expect(host.querySelector('bp-kit-component')!.shadowRoot!.querySelector('button')!.textContent).toBe('Saved label');
  expect(document.querySelector('#unrelated')?.hasAttribute('data-custom-select-enhanced')).toBe(false);
});

test('installed kit keeps component definitions through domain normalization and compact insertion', () => {
  const kit = normalizePresetPackage(defaultKit);
  const instance = resolveKitComponent([kit], kit.id, 'secondary', { label: 'Back' });
  expect(instance.props).toEqual({ label: 'Back', variant: 'secondary' });
  expect(kit.components.find((c: any) => c.id === 'secondary').props.label).toBe('Cancel');
  expect(componentWidgetPreset(instance, kit.id)).toMatchObject({ widgetId: 'uiKitComponent', settings: { sourcePresetId: kit.id, component: instance } });
  expect(() => resolveKitComponent([kit], kit.id, 'missing')).toThrow('UI_KIT_COMPONENT_NOT_FOUND');
});

test('unknown types survive round trips but cannot execute; style and identity boundaries fail closed', () => {
  const custom = { id: 'future', name: 'Future', type: 'future-widget', props: { text: 'kept' } };
  expect(normalizeKitComponents([custom])[0]).toEqual(custom);
  expect(mount(custom).querySelector('[data-error-code]')?.getAttribute('data-error-code')).toBe('UI_KIT_COMPONENT_RENDERER_MISSING');
  expect(() => resolveKitComponent([{ id: 'kit', components: [custom] }], 'kit', 'future')).toThrow('UI_KIT_COMPONENT_RENDERER_MISSING');
  expect(() => normalizeKitComponents([custom, custom])).toThrow('UI_KIT_COMPONENT_DUPLICATE_ID');
  expect(() => normalizeKitComponents([{ ...custom, props: { onclick: 'alert(1)' } }])).toThrow('UI_KIT_COMPONENT_EXECUTABLE_FIELD');
  expect(() => normalizeKitComponents([{ ...custom, styles: { background: 'url(https://example.com)' } }])).toThrow('UI_KIT_COMPONENT_STYLE_VALUE');
  expect(() => normalizeKitComponents([{ ...custom, styles: { color: 'red;display:none' } }])).toThrow('UI_KIT_COMPONENT_STYLE_VALUE');
  expect(() => normalizeKitComponents([{ ...custom, styles: { background: 'image-set("https://example.com/x")' } }])).toThrow('UI_KIT_COMPONENT_STYLE_VALUE');
  expect(() => normalizeKitComponents([{ ...custom, props: { options: [null] } }])).toThrow('UI_KIT_COMPONENT_PROPS_INVALID');
  expect(componentCssValue('constructor')).toBe('constructor');
});

test.each(defaultKit.components.map(component => [component.id, component]))('renders bundled component %s using the shared runtime', (_id, component) => {
  const root = mount(component);
  expect(root.querySelector('[data-error-code]')).toBeNull();
  expect(root.textContent).not.toContain('unsupported type');
});

test('multiple selection toggles without closing and emits structured values', () => {
  const root = mount({ id: 'multi', name: 'Topics', type: 'multiselect', props: { options: ['One', 'Two'] } });
  const change = jest.fn(); root.host.addEventListener('bp:ui-kit-change', change);
  (root.querySelector('.display') as HTMLButtonElement).click();
  (root.querySelectorAll('.option')[0] as HTMLButtonElement).click();
  (root.querySelectorAll('.option')[1] as HTMLButtonElement).click();
  expect(Array.from(root.querySelector('select')!.selectedOptions, option => option.value)).toEqual(['One', 'Two']);
  expect(root.querySelector('.display')?.getAttribute('aria-expanded')).toBe('true');
  expect(change.mock.calls.at(-1)?.[0].detail).toEqual({ componentId: 'multi', value: ['One', 'Two'] });
  root.querySelector('.option')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(root.querySelector('.display')?.getAttribute('aria-expanded')).toBe('false');
});

test('tooltip uses shared overlay with description semantics and cleans up on disconnect', () => {
  const root = mount({ id: 'help', name: 'Help', type: 'tooltip', props: { content: '<script>plain text</script>' } });
  const trigger = root.querySelector('button')!; trigger.focus();
  const tooltip = document.querySelector('[role=tooltip]')!;
  expect(tooltip.textContent).toBe('<script>plain text</script>');
  expect(tooltip.querySelector('script')).toBeNull();
  expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
  expect(root.getElementById(tooltip.id)?.textContent).toBe(tooltip.textContent);
  expect(trigger.hasAttribute('aria-expanded')).toBe(false);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(trigger.hasAttribute('aria-describedby')).toBe(false);
  trigger.blur(); trigger.focus();
  root.host.remove();
  expect(trigger.hasAttribute('aria-describedby')).toBe(false);
});

test('explicit dark preview applies overrides while preserving safe palette references', () => {
  const root = mount({ id: 'button', name: 'Buy', type: 'button', styles: { color: 'primary' }, darkStyles: { color: 'accent' }, states: { hover: { borderRadius: '8px' } } }, { theme: 'dark' });
  expect(root.querySelector('style')!.textContent).toContain('color:var(--bp-color-default-5)');
  expect(root.querySelector('style')!.textContent).toContain(':hover{border-radius:8px}');
});

test('disabled link buttons cannot navigate', () => {
  const root = mount({ id: 'disabled', name: 'Disabled link', type: 'button', props: { href: '/shop', disabled: true } });
  const link = root.querySelector('a')!;
  expect(link.getAttribute('aria-disabled')).toBe('true');
  expect(link.tabIndex).toBe(-1);
  expect(link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(false);
});
