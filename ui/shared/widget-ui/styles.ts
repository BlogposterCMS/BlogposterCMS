import { COMPONENT_STYLE_PROPERTIES, normalizeKitComponents } from '../design-system/componentDefinitions.js';
import { uiError } from '/ui/shared/widget-ui/model.js';

const layout = new Set(['display','flexDirection','flexWrap','alignItems','alignSelf','justifyContent','gridTemplateColumns',
  'gridColumn','gridRow','flex','flexGrow','flexShrink','margin','marginTop','marginBottom','marginLeft','marginRight',
  'overflow','overflowX','overflowY','position','top','right','bottom','left','zIndex','boxSizing','whiteSpace','overflowWrap',
  'cursor','listStyle','objectFit','textOverflow']);

/** Styles are owned by a widget's shadow root, never written to the admin or document theme. */
export function applyUiStyles(element: HTMLElement, styles: Record<string, string> = {}, preview = false): void {
  normalizeKitComponents([{ id: 'styles', name: 'Widget styles', type: 'text', styles }]);
  element.removeAttribute('style');
  for (const [key, value] of Object.entries(styles)) {
    if (!COMPONENT_STYLE_PROPERTIES.has(key) && !layout.has(key) && !/^--[a-z][a-z0-9-]{0,79}$/.test(key)) throw uiError('WIDGET_STYLE_PROPERTY_DENIED');
    const property = key.startsWith('--') ? key : key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    // Fixed page composition stays within the widget while editing a Designer canvas.
    const resolved = preview && key === 'position' && value === 'fixed' ? 'sticky' : value;
    if (key === 'zIndex' && (!/^\d{1,3}$/.test(value) || Number(value) > 100)) throw uiError('WIDGET_STYLE_LAYER_LIMIT');
    element.style.setProperty(property, resolved);
  }
}

// Component mechanics are shared; all presentation defaults remain in this local root.
export const widgetUiCss = `
:host{display:block;min-width:0;color:var(--bp-type-body-color,var(--bp-color-default-2,#20242c));font-family:var(--bp-type-body-font-family,system-ui,sans-serif);font-size:var(--bp-type-body-font-size,16px);font-weight:var(--bp-type-body-font-weight,400);line-height:var(--bp-type-body-line-height,1.5)}
*,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important}
button,input,textarea,select{font:inherit;color:inherit}button{cursor:pointer}
button:disabled{cursor:default;opacity:.5}button{border:1px solid var(--bp-ui-border,#dce0e6);border-radius:8px;padding:8px 12px;background:var(--bp-ui-surface,#fff)}
input,textarea,select,[data-ui-composer]{border:1px solid var(--bp-ui-border,#dce0e6);border-radius:8px;padding:10px 12px;background:var(--bp-ui-surface,#fff)}
[data-ui-composer]{white-space:pre-wrap;overflow-wrap:anywhere;min-height:44px;outline:none}
[data-ui-composer]:empty::before{content:attr(data-placeholder);color:var(--bp-ui-muted,#697386);pointer-events:none}
:focus-visible{outline:2px solid var(--bp-color-default-1,#3b72f6);outline-offset:2px}
.bp-popover-layer{position:fixed;inset:0;z-index:100;pointer-events:none}.bp-popover{position:fixed;pointer-events:auto}.bp-popover.is-leaving{visibility:hidden}
[data-ui-overlay]{background:var(--bp-ui-surface,#fff);color:inherit;border:1px solid var(--bp-ui-border,#dce0e6);border-radius:12px;padding:16px;box-shadow:0 12px 36px #0002;max-height:75vh;overflow:auto}
dialog{color:inherit;background:var(--bp-ui-surface,#fff);border:1px solid var(--bp-ui-border,#dce0e6);border-radius:12px;padding:20px;max-width:min(90vw,640px)}
dialog::backdrop{background:#0005}[data-ui-drawer]{margin-right:0;height:100vh;max-height:100vh;width:min(90vw,420px);border-radius:0}
[data-ui-richtext]{line-height:1.65;overflow-wrap:anywhere}[data-ui-richtext] img{max-width:100%;height:auto}
[data-ui-richtext] pre{overflow:auto;padding:12px;background:var(--bp-ui-muted-surface,#f5f6f8)}
a{color:var(--bp-type-link-color,var(--bp-color-default-1,#3b72f6));text-decoration:var(--bp-type-link-text-decoration,underline)}
[role=tablist]{display:flex;gap:8px}[role=tab][aria-selected=true]{border-color:var(--bp-color-default-1,#3b72f6)}
[data-ui-skeleton]{background:var(--bp-ui-muted-surface,#eceff3);border-radius:6px;min-height:24px;opacity:.7}
`;
