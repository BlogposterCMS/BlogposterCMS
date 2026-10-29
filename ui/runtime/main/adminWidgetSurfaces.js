const ADMIN_SETTINGS_SURFACE_PATH = '/ui/widgets/plainspace/admin/settings/settingsPanels.js';
const ADMIN_DASHBOARD_CONTROLS_PATH = '/ui/widgets/panel/widgetControls.js';
let dashboardControlsModulePromise = null;
export async function renderAdminSettingsSurface(el, page) {
    // Match the Settings owner's route guard before downloading its editor graph.
    const slug = page?.slug;
    if (String(slug || '').split('/').filter(Boolean)[0] !== 'settings')
        return false;
    const mod = await import(
    /* webpackIgnore: true */ ADMIN_SETTINGS_SURFACE_PATH);
    return typeof mod.renderSettingsSurface === 'function'
        ? Boolean(await mod.renderSettingsSurface(el, page))
        : false;
}
export async function attachAdminDashboardControls(el, grid) {
    if (!dashboardControlsModulePromise) {
        dashboardControlsModulePromise = import(
        /* webpackIgnore: true */ ADMIN_DASHBOARD_CONTROLS_PATH);
    }
    const mod = await dashboardControlsModulePromise;
    if (typeof mod.attachDashboardControls === 'function') {
        mod.attachDashboardControls(el, grid);
    }
}
