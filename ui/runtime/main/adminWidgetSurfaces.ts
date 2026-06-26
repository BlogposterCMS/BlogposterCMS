type SettingsSurfaceModule = {
  renderSettingsSurface?: (el: HTMLElement, page: unknown) => Promise<boolean> | boolean;
};

type DashboardControlsModule = {
  attachDashboardControls?: (el: HTMLElement | null, grid: unknown | null) => void;
};

const ADMIN_SETTINGS_SURFACE_PATH = '/ui/widgets/plainspace/admin/settings/settingsPanels.js';
const ADMIN_DASHBOARD_CONTROLS_PATH = '/ui/widgets/panel/widgetControls.js';

let dashboardControlsModulePromise: Promise<DashboardControlsModule> | null = null;

export async function renderAdminSettingsSurface(el: HTMLElement, page: unknown): Promise<boolean> {
  const mod = await import(
    /* webpackIgnore: true */ ADMIN_SETTINGS_SURFACE_PATH
  ) as SettingsSurfaceModule;
  return typeof mod.renderSettingsSurface === 'function'
    ? Boolean(await mod.renderSettingsSurface(el, page))
    : false;
}

export async function attachAdminDashboardControls(
  el: HTMLElement | null,
  grid: unknown | null
): Promise<void> {
  if (!dashboardControlsModulePromise) {
    dashboardControlsModulePromise = import(
      /* webpackIgnore: true */ ADMIN_DASHBOARD_CONTROLS_PATH
    ) as Promise<DashboardControlsModule>;
  }
  const mod = await dashboardControlsModulePromise;
  if (typeof mod.attachDashboardControls === 'function') {
    mod.attachDashboardControls(el, grid);
  }
}
