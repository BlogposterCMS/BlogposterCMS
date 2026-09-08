import { normalizeKitComponents, componentSupported, componentCssValue, COMPONENT_STYLE_PROPERTIES, COMPONENT_STATES } from './componentDefinitions.js';
import enhanceSelects, { destroyCustomSelects } from '../controls/customSelectCore.js';
import { createFormField, createFormChoice, createFormSwitch } from '../forms/formField.js';
import { createTabSystem } from '../navigation/tabs.js';
import { bpPopover } from '../overlays/popover.js';
import { normalizeMediaUrl, normalizeLinkUrl } from '../../widgets/plainspace/public/basicwidgets/publicWidgetHelpers.js';
const sheetUrl = '/assets/css/ui-kit-components.css';
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const declarations = (styles = {}) => Object.entries(styles)
    .filter(([key]) => COMPONENT_STYLE_PROPERTIES.has(key))
    .map(([key, value]) => `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}:${componentCssValue(value)}`).join(';');
function stylesheet() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheetUrl;
    return link;
}
/** One renderer for saved widget instances and kit previews; data never becomes HTML or code. */
class KitElement extends HTMLElement {
    component;
    previewTheme;
    preview = false;
    dispose = null;
    connectedCallback() {
        if (this.dispose || !this.component)
            return;
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        const scope = document.createElement('div');
        scope.className = 'bp-ui-kit-surface';
        const surface = document.createElement('div');
        surface.className = 'app-scope';
        scope.append(surface);
        const styles = document.createElement('style');
        root.replaceChildren(stylesheet(), styles, scope);
        const c = this.component, p = c.props || {};
        const label = text(p.label, c.name);
        let overlay;
        let control = surface;
        const changed = (value) => { this.dispatchEvent(new CustomEvent('bp:ui-kit-change', { bubbles: true, composed: true, detail: { componentId: c.id, value } })); };
        const button = (name) => {
            const node = document.createElement('button');
            node.type = 'button';
            node.className = 'button primary';
            node.textContent = name;
            return node;
        };
        const options = Array.isArray(p.options) ? p.options.slice(0, 100) : [];
        if (!componentSupported(c)) {
            surface.dataset.errorCode = 'UI_KIT_COMPONENT_RENDERER_MISSING';
            surface.textContent = `${c.name}: unsupported type ${c.type}`;
        }
        else if (c.type === 'button') {
            if (p.href) {
                const link = document.createElement('a');
                link.className = 'button primary';
                link.textContent = label;
                const href = normalizeLinkUrl(p.href);
                if (href)
                    link.href = href;
                else
                    link.dataset.errorCode = 'UI_KIT_COMPONENT_UNSAFE_URL';
                if (this.preview || p.disabled === true)
                    link.addEventListener('click', event => event.preventDefault());
                if (p.disabled === true) {
                    link.setAttribute('aria-disabled', 'true');
                    link.tabIndex = -1;
                }
                control = link;
            }
            else
                control = button(label);
            if (p.variant === 'secondary') {
                control.classList.remove('primary');
                control.classList.add('secondary');
            }
            surface.append(control);
        }
        else if (['input', 'textarea', 'select', 'multiselect'].includes(c.type)) {
            const field = document.createElement(c.type === 'textarea' ? 'textarea' : ['select', 'multiselect'].includes(c.type) ? 'select' : 'input');
            if (field instanceof HTMLInputElement)
                field.type = ['text', 'email', 'number', 'password', 'search', 'tel', 'url', 'date', 'time', 'range', 'color'].includes(p.inputType) ? p.inputType : 'text';
            if (field instanceof HTMLSelectElement) {
                field.multiple = c.type === 'multiselect';
                field.dataset.enhance = 'dropdown';
                field.dataset.placeholder = text(p.placeholder, 'Choose options');
                field.dataset.floatingOptions = 'true';
                options.forEach(entry => {
                    const option = document.createElement('option');
                    option.value = typeof entry === 'string' ? entry : text(entry?.value);
                    option.textContent = typeof entry === 'string' ? entry : text(entry?.label, option.value);
                    option.disabled = entry?.disabled === true;
                    option.selected = Array.isArray(p.value) ? p.value.includes(option.value) : p.value === option.value;
                    field.append(option);
                });
            }
            else {
                field.placeholder = text(p.placeholder);
                field.value = text(p.value);
            }
            field.disabled = p.disabled === true;
            field.addEventListener('change', () => changed(field instanceof HTMLSelectElement && field.multiple ? Array.from(field.selectedOptions, entry => entry.value) : field.value));
            surface.append(createFormField(label, field, { required: p.required === true, hint: text(p.hint), error: text(p.error) }));
            control = field;
        }
        else if (['checkbox', 'radio', 'switch'].includes(c.type)) {
            const entries = c.type === 'radio' && options.length ? options : [{ label, value: text(p.value) }];
            entries.forEach((entry, index) => {
                const field = document.createElement('input');
                field.type = c.type === 'radio' ? 'radio' : 'checkbox';
                field.name = 'choice';
                field.value = typeof entry === 'string' ? entry : text(entry.value);
                field.disabled = p.disabled === true;
                field.dataset.kitControl = 'true';
                field.checked = c.type === 'radio' ? p.value === field.value : p.checked === true;
                if (c.type === 'switch')
                    field.setAttribute('role', 'switch');
                field.addEventListener('change', () => changed(c.type === 'radio' ? field.value : field.checked));
                surface.append((c.type === 'switch' ? createFormSwitch : createFormChoice)(typeof entry === 'string' ? entry : text(entry.label, label), field));
                if (!index)
                    control = field;
            });
            if (c.type === 'radio') {
                surface.setAttribute('role', 'radiogroup');
                surface.setAttribute('aria-label', label);
            }
        }
        else if (c.type === 'tabs') {
            const tabsHost = document.createElement('div');
            surface.append(tabsHost);
            tabsHost.setAttribute('aria-label', label);
            const tabs = createTabSystem(surface, tabsHost, { onSelect: changed });
            (Array.isArray(p.tabs) ? p.tabs.slice(0, 32) : [{ label: 'Tab', content: '' }]).forEach(entry => { tabs.addTab(text(entry.label, 'Tab')).textContent = text(entry.content); });
            tabs.select(Number(p.selectedIndex) || 0);
            control = tabsHost;
        }
        else if (c.type === 'popover' || c.type === 'tooltip') {
            const trigger = button(label);
            surface.append(trigger);
            control = trigger;
            const open = () => {
                if (overlay || p.disabled === true)
                    return;
                if (!document.head.querySelector('[data-ui-kit-styles]')) {
                    const link = stylesheet();
                    link.dataset.uiKitStyles = 'true';
                    document.head.append(link);
                }
                overlay = bpPopover.open(trigger, { content: text(p.content), role: c.type === 'tooltip' ? 'tooltip' : 'dialog', ariaLabel: label, onClose: () => { overlay = undefined; } });
                const layer = overlay.panel.parentElement;
                layer.classList.add('bp-ui-kit-surface');
                // Portals retain the originating kit's palette, including explicit preview mode.
                const computed = getComputedStyle(surface);
                Array.from(computed).filter(key => key.startsWith('--')).forEach(key => layer.style.setProperty(key, computed.getPropertyValue(key)));
                overlay.panel.style.cssText += declarations(c.parts?.panel);
            };
            if (c.type === 'tooltip') {
                trigger.addEventListener('pointerenter', open);
                trigger.addEventListener('focus', open);
                trigger.addEventListener('pointerleave', () => { if (root.activeElement !== trigger)
                    overlay?.close(); });
                trigger.addEventListener('blur', () => overlay?.close());
            }
            else
                trigger.addEventListener('click', () => overlay ? overlay.close() : open());
        }
        else if (c.type === 'image') {
            const img = document.createElement('img');
            img.alt = text(p.alt, label);
            const src = normalizeMediaUrl(p.src);
            if (src)
                img.src = src;
            else
                img.dataset.errorCode = 'UI_KIT_COMPONENT_UNSAFE_URL';
            surface.append(img);
            control = img;
        }
        else {
            control = document.createElement(c.type === 'separator' ? 'hr' : 'span');
            control.textContent = c.type === 'text' ? text(p.text, label) : '';
            surface.append(control);
        }
        control.dataset.kitControl = 'true';
        if (control instanceof HTMLButtonElement)
            control.disabled = p.disabled === true;
        enhanceSelects(root);
        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        const updateStyles = () => {
            const theme = this.previewTheme || document.documentElement.dataset.theme;
            const dark = theme === 'dark' || (!['dark', 'light'].includes(theme || '') && media?.matches);
            const selector = ':host .bp-ui-kit-surface [data-kit-control],:host .bp-ui-kit-surface .custom-select .display';
            styles.textContent = `${selector}{${declarations({ ...c.styles, ...(dark ? c.darkStyles : {}) })}}`;
            COMPONENT_STATES.forEach(state => {
                const suffix = state === 'placeholder' ? '::placeholder' : state === 'focus' ? ':focus-visible' : `:${state}`;
                styles.textContent += `${selector.split(',').map(part => part + suffix).join(',')}{${declarations({ ...c.states?.[state], ...(dark ? c.darkStates?.[state] : {}) })}}`;
            });
            const parts = { label: '.form-field__label', option: '.custom-select .option', panel: '[role=tabpanel]', tab: '[role=tab]', track: '.form-switch__track' };
            Object.entries(parts).forEach(([name, target]) => { styles.textContent += `:host .bp-ui-kit-surface ${target}{${declarations(c.parts?.[name])}}`; });
            overlay?.close();
        };
        updateStyles();
        const observer = new MutationObserver(updateStyles);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        media?.addEventListener('change', updateStyles);
        this.dispose = () => { observer.disconnect(); media?.removeEventListener('change', updateStyles); overlay?.close(); destroyCustomSelects(root); };
    }
    disconnectedCallback() { this.dispose?.(); this.dispose = null; }
}
if (!customElements.get('bp-kit-component'))
    customElements.define('bp-kit-component', KitElement);
export function renderKitComponent(host, definition, options = {}) {
    const element = document.createElement('bp-kit-component');
    element.component = normalizeKitComponents([definition])[0];
    element.previewTheme = options.theme;
    element.preview = options.preview === true;
    host.replaceChildren(element);
}
