import { getColorLibrarySnapshot, subscribeColorLibrary, type SavedColor } from '../colors/colorLibrary.js';
import { FONT_PACKAGE_ROLES, getActiveFontPackage, subscribeFontPackages, type FontPackage } from '../fonts/fontPackages.js';
import { normalizeMediaUrl } from './publicWidgetHelpers.js';
import { render as renderButton } from './websiteButton.js';
import { getSitePresetsSnapshot, subscribeSitePresets } from '../presets/sitePresets.js';
import { renderKitComponent } from './componentRenderer.js';
import type { KitComponent } from './componentDefinitions.js';

type Branding = { logoUrl?: string; logoDarkUrl?: string };

/** Read-only previews share the live library snapshots; they never persist another theme. */
export function mountWebsiteDesignPreview(host: HTMLElement, branding: () => Branding = () => ({}), source?: () => { colors: SavedColor[]; fontPackage: FontPackage | null; components?: KitComponent[] }): () => void {
  const render = (): void => {
    const selected = source?.();
    const library = selected ? { colors: selected.colors } : getColorLibrarySnapshot();
    const fonts = selected ? selected.fontPackage : getActiveFontPackage();
    const root = document.createElement('div');
    root.dataset.websiteDesignPreview = 'true';
    const style = document.createElement('style');
    style.textContent = `
      .website-design-row { display:grid;grid-template-columns:minmax(100px,1fr) minmax(0,2fr) minmax(0,2fr);gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--studio-border); }
      .website-design-sample { min-width:0;overflow-wrap:anywhere;padding:16px;border-radius:4px; }
      .website-design-sample img { width:100%;max-width:200px;height:64px;object-fit:contain; }
      @media(max-width:600px) { .website-design-row {grid-template-columns:minmax(0,1fr) minmax(0,1fr);} .website-design-row>span:first-child {grid-column:1/-1;} }
    `;
    const row = (name: string, sample: (dark: boolean) => HTMLElement, id = name): void => {
      const element = document.createElement('div');
      element.className = 'website-design-row';
      element.dataset.designToken = name;
      element.dataset.designTokenId = id;
      const label = document.createElement('span');
      label.textContent = name;
      element.append(label, sample(false), sample(true));
      root.appendChild(element);
    };
    const surface = (dark: boolean): HTMLElement => {
      const box = document.createElement('div');
      box.className = 'website-design-sample';
      box.dataset.previewTheme = dark ? 'dark' : 'light';
      const color = library.colors.find(entry => entry.id === 'default-3');
      box.style.background = (dark ? color?.darkValue : color?.value) || color?.value || (dark ? '#171717' : '#ffffff');
      box.style.color = dark ? '#ffffff' : '#171717';
      // Each preview column resolves the very same linked slot ids in its own theme.
      library.colors.forEach(entry => box.style.setProperty(`--bp-color-${entry.id}`, (dark ? entry.darkValue : entry.value) || entry.value));
      if (fonts) FONT_PACKAGE_ROLES.forEach(role => Object.entries(fonts.roles[role]).forEach(([property, value]) => {
        box.style.setProperty(`--bp-type-${role}-${property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value);
      }));
      return box;
    };
    row('Element', dark => {
      const label = document.createElement('strong');
      label.textContent = dark ? 'Dark' : 'Light';
      return label;
    });
    const logos = branding();
    if (logos.logoUrl !== undefined || logos.logoDarkUrl !== undefined) row('Logo', dark => {
      const box = surface(dark);
      const url = normalizeMediaUrl((dark ? logos.logoDarkUrl : logos.logoUrl) || logos.logoUrl || logos.logoDarkUrl);
      if (url) {
        const image = document.createElement('img');
        image.src = url; image.alt = 'Website logo'; box.appendChild(image);
      } else box.textContent = 'No logo selected';
      return box;
    });
    library.colors.forEach(color => row(color.name, dark => {
      const box = surface(dark);
      const value = (dark ? color.darkValue : color.value) || color.value;
      const swatch = document.createElement('span');
      swatch.style.cssText = 'display:inline-block;width:32px;height:32px;vertical-align:middle;margin-right:10px;border:1px solid #888;';
      swatch.style.background = value;
      const text = document.createElement('code'); text.textContent = value;
      box.append(swatch, text);
      return box;
    }, color.id));
    if (fonts) FONT_PACKAGE_ROLES.forEach(role => row(role, dark => {
      const box = surface(dark);
      const sample = document.createElement('span');
      sample.textContent = role === 'button' ? 'Button' : role === 'link' ? 'Example link' : 'The quick brown fox';
      const values = fonts.roles[role];
      Object.entries(values).forEach(([property, value]) => {
        sample.style.setProperty(property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value);
      });
      if (role === 'button') {
        // Render the actual widget, so its preview cannot drift from Designer/runtime.
        renderButton(sample, { instanceMetadata: { label: 'Button', href: '#' } });
        const link = sample.querySelector('a');
        link?.addEventListener('click', event => event.preventDefault());
      }
      box.appendChild(sample);
      return box;
    }));
    const kits = getSitePresetsSnapshot();
    const components = selected ? selected.components : kits.presets.find(kit => kit.id === (kits.lastAppliedId || 'site-preset-default'))?.components;
    (components || []).forEach(component => row(component.name, dark => {
      const box = surface(dark);
      try { renderKitComponent(box, component, { theme: dark ? 'dark' : 'light', preview: true }); }
      catch (error) { box.textContent = error instanceof Error ? error.message : 'UI_KIT_COMPONENT_INVALID'; }
      return box;
    }, component.id));
    host.replaceChildren(style, root);
  };
  const cleanups = [subscribeColorLibrary(render), subscribeFontPackages(render), subscribeSitePresets(render)];
  host.addEventListener('bp:branding-preview', render);
  render();
  return () => {
    cleanups.forEach(cleanup => cleanup());
    host.removeEventListener('bp:branding-preview', render);
  };
}
