import { configureColorLibraryClient, refreshColorLibrary } from '../../../../shared/colors/colorLibrary.js';
import { configureFontPackagesClient, refreshFontPackages } from '../../../../shared/fonts/fontPackages.js';
import { configureSitePresetsClient, refreshSitePresets } from '../../../../shared/presets/sitePresets.js';
import { mountSitePresetsPanel } from '../../../../shared/presets/sitePresetsPanel.js';
import { initStyleLibrariesPanel } from '../../../../shared/design-system/styleLibrariesPanel.js';
import { mountWebsiteDesignPreview } from '../../../../shared/design-system/websiteDesignPreview.js';
/** Settings is another editor of the existing website libraries, never a second owner. */
export async function mountWebsiteDesignSettings(options) {
    const { root, overview, theme, components, presets, emit, jwt } = options;
    // Adapt only the host palette; the shared controls keep their established styling.
    for (const [name, token] of Object.entries({ ink: 'text', text: 'text', 'ink-soft': 'text-muted', surface: 'surface-solid', 'surface-soft': 'surface-muted', border: 'border', 'border-strong': 'border-strong', accent: 'text', 'action-bg': 'text', 'action-text': 'surface-solid', 'action-bg-hover': 'text-muted' })) {
        root.style.setProperty(`--scene-${name}`, `var(--studio-${token})`);
    }
    configureColorLibraryClient({ emit, token: jwt, lane: 'admin' });
    configureFontPackagesClient({ emit, token: jwt, lane: 'admin' });
    configureSitePresetsClient({ emit, token: jwt });
    await Promise.all([refreshColorLibrary(), refreshFontPackages(), refreshSitePresets()]);
    const colorHost = document.createElement('div');
    colorHost.dataset.colorSchemeHost = '';
    const fontHost = document.createElement('div');
    fontHost.dataset.fontPackagesHost = '';
    colorHost.className = fontHost.className = 'style-library-panel-host';
    theme.appendChild(colorHost);
    components.prepend(fontHost);
    presets.dataset.sitePresetsHost = '';
    const libraries = initStyleLibrariesPanel(root);
    const preview = mountWebsiteDesignPreview(overview, options.branding);
    const kitContext = { sidebarEl: root, cleanupSitePresetsPanel: undefined, setSidebarPanel: options.editTheme };
    mountSitePresetsPanel(kitContext);
    const updateBranding = () => overview.dispatchEvent(new Event('bp:branding-preview'));
    root.addEventListener('input', updateBranding);
    return () => {
        libraries();
        preview();
        kitContext.cleanupSitePresetsPanel?.();
        root.removeEventListener('input', updateBranding);
    };
}
