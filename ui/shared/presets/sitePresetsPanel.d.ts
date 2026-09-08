export function mountSitePresetsPanel(ctx: {
  sidebarEl: HTMLElement;
  cleanupSitePresetsPanel?: () => void;
  setSidebarPanel?: (panel: string) => void;
  getSitePresetSettings?: () => Record<string, unknown>;
  applySitePresetSettings?: (settings: unknown) => void;
  captureSitePresetDemo?: () => unknown;
  applySitePresetDemo?: (demo: unknown) => Promise<void>;
  insertUiKitComponent?: (component: unknown, kitId: string) => Promise<unknown>;
}): void;
