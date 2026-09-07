import { navigationSettings } from '../../../widgets/plainspace/public/basicwidgets/navigationSettings.js';
import { widgetSettings } from '../../../widgets/plainspace/public/basicwidgets/publicWidgetHelpers.js';
/** This panel edits the existing widget code.meta, exactly like the gallery inspector. */
export function createNavigationInspector(inspector, options) {
    const group = document.createElement('section');
    group.className = 'scene-inspector-group scene-navigation-settings';
    group.dataset.inspectorPanel = 'content';
    group.hidden = true;
    inspector.appendChild(group);
    let selectedId = '';
    function field(label, key, value, choices, type = 'text') {
        const wrapper = document.createElement('label');
        wrapper.className = type === 'checkbox' ? 'scene-toggle-field' : 'scene-select-field';
        const caption = document.createElement('span');
        caption.textContent = label;
        const input = choices ? document.createElement('select') : document.createElement('input');
        input.dataset.navigationField = key;
        input.id = `designer-navigation-${key}`;
        if (input instanceof HTMLSelectElement) {
            choices?.forEach(([id, title]) => input.add(new Option(title, id)));
            input.value = String(value);
        }
        else {
            input.type = type;
            if (type === 'checkbox')
                input.checked = value === true;
            else
                input.value = String(value ?? '');
            if (type === 'number') {
                input.min = key === 'fontSize' ? '11' : '0';
                input.max = key === 'fontSize' ? '28' : key === 'radius' ? '24' : '48';
            }
        }
        input.addEventListener('change', () => {
            if (options.read()?.instanceId !== selectedId)
                return;
            options.apply({ [key]: input instanceof HTMLInputElement && type === 'checkbox' ? input.checked : input.value });
        });
        wrapper.append(caption, input);
        group.appendChild(wrapper);
        return input;
    }
    function sync() {
        const selection = options.read();
        const supported = selection && ['navigationMenu', 'breadcrumb'].includes(selection.widgetId);
        group.hidden = !supported;
        if (!supported || !selection) {
            selectedId = '';
            group.replaceChildren();
            return;
        }
        selectedId = selection.instanceId;
        const raw = widgetSettings({ metadata: { defaults: selection.defaults }, instanceMetadata: selection.metadata });
        const settings = navigationSettings(selection.widgetId, raw);
        group.replaceChildren();
        const heading = document.createElement('h3');
        heading.textContent = selection.widgetId === 'breadcrumb' ? 'Breadcrumb' : 'Menu';
        group.appendChild(heading);
        if (selection.widgetId === 'navigationMenu') {
            const location = field('Menu source', 'locationKey', settings.locationKey, [[String(settings.locationKey), String(settings.locationKey)]]);
            const locationInstance = selectedId;
            // Reading the registry never changes the selection or its saved assignment.
            options.loadLocations().then(locations => {
                if (!location.isConnected || selectedId !== locationInstance)
                    return;
                for (const item of locations)
                    if (item.key && !Array.from(location.options).some(option => option.value === item.key)) {
                        location.add(new Option(item.label || item.key, item.key));
                    }
                for (const option of Array.from(location.options))
                    option.text = locations.find(item => item.key === option.value)?.label || option.text;
            }).catch(() => {
                if (!location.isConnected)
                    return;
                const warning = document.createElement('small');
                warning.setAttribute('role', 'status');
                warning.textContent = 'Menu sources unavailable. DESIGNER_NAVIGATION_LOCATIONS_FAILED';
                group.appendChild(warning);
            });
            const manage = document.createElement('a');
            manage.href = `/${String(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/gu, '')}/content/menu`;
            manage.target = '_blank';
            manage.rel = 'noopener';
            manage.textContent = 'Edit menu links ↗';
            group.appendChild(manage);
            if (Array.isArray(raw.items) && raw.items.length || Array.isArray(raw.links) && raw.links.length) {
                const useMenu = document.createElement('button');
                useMenu.type = 'button';
                useMenu.textContent = 'Replace inline links with selected menu';
                useMenu.addEventListener('click', () => options.apply({ locationKey: settings.locationKey }));
                group.appendChild(useMenu);
            }
            field('Direction', 'orientation', settings.orientation, [['horizontal', 'Horizontal'], ['vertical', 'Vertical / sidebar']]);
            field('Link style', 'appearance', settings.appearance, [['plain', 'Plain'], ['soft', 'Soft background'], ['underline', 'Underline']]);
            field('Submenus', 'submenu', settings.submenu, [['disclosure', 'Expand on click'], ['expanded', 'Always expanded']]);
            field('Levels', 'maxDepth', settings.maxDepth, [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]);
            field('Collapse on mobile', 'mobileCollapse', settings.mobileCollapse, undefined, 'checkbox');
            field('Mobile button label', 'mobileLabel', settings.mobileLabel);
            field('Corner radius', 'radius', settings.radius, undefined, 'number');
        }
        else {
            field('Source', 'source', settings.source, [['pages', 'Page hierarchy and titles'], ['path', 'URL path']]);
            field('Show start link', 'showHome', settings.showHome, undefined, 'checkbox');
            field('Start label', 'homeLabel', settings.homeLabel);
            field('Start address', 'homeHref', settings.homeHref);
            field('Separator', 'separator', settings.separator, [['/', '/'], ['›', '›'], ['→', '→'], ['·', '·']]);
            field('Preview path', 'previewPath', settings.previewPath);
            const hint = document.createElement('small');
            hint.textContent = 'Public pages use their actual hierarchy. This path is only a Studio preview.';
            group.appendChild(hint);
        }
        field('Alignment', 'alignment', settings.alignment, [['start', 'Start'], ['center', 'Center'], ['end', 'End']]);
        field('Text size', 'fontSize', settings.fontSize, undefined, 'number');
        field('Spacing', 'gap', settings.gap, undefined, 'number');
    }
    return { sync };
}
