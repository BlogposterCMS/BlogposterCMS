declare module '*.js';
declare module '*.min.js';

interface Window {
  ADMIN_TOKEN?: string | null;
  ADMIN_BASE?: string | null;
  PUBLIC_TOKEN?: string | null;
  CSRF_TOKEN?: string | null;
  USER_COLOR?: string | null;
  ACTIVE_THEME?: string | null;
  LANG?: string | null;
  PAGE_ID?: string | number | null;
  PAGE_SLUG?: string | null;
  DEBUG_RENDERER?: boolean;
  DEBUG_MELTDOWN?: boolean;
  NONCE?: string;
  AVAILABLE_FONTS?: string[];
  FONT_SOURCES?: Record<string, string>;
  LOADED_FONT_CSS?: Record<string, boolean>;
  loadFontCss?: (name: string) => void;
  featherIcons?: Record<string, string>;
  featherIcon?: (name: string, extraClass?: string) => string;
  EyeDropper?: {
    new(): {
      open: () => Promise<{ sRGBHex: string }>;
    };
  };
  GLOBAL_TEXT_WIDGETS?: unknown[];
  availableWidgets?: any[];
  adminGrid?: any;
  adminPageContext?: any;
  adminCurrentLayout?: any[];
  __dashboardDraggingWidgetId?: string;
  addDashboardWidget?: (definition: any, position?: Record<string, unknown>) => unknown;
  saveAdminLayout?: () => Promise<void>;
  blogposterApi?: import('./api-client/meltdownClient').MeltdownClient;
  blogposterAgentConsole?: import('./agent/agentConsole').AgentConsole;
  blogposterAgent?: Record<string, unknown>;
  __blogposterAppBridgeFetchInstalled?: boolean;
  blogposterDesignerCommands?: {
    execute?: (command: import('./agent/agentSurfaceClient').AgentSurfaceCommand) => Promise<Record<string, unknown>> | Record<string, unknown>;
    snapshot?: () => Record<string, unknown>;
  };
  meltdownEmit?: import('./api-client/meltdownClient').MeltdownClient['emit'];
  meltdownEmitBatch?: import('./api-client/meltdownClient').MeltdownClient['emitBatch'];
  fetchWithTimeout?: (
    resource: RequestInfo | URL,
    options?: RequestInit,
    timeout?: number
  ) => Promise<Response>;
  pageDataLoader?: {
    load: (
      eventName: string,
      payload?: Record<string, unknown>,
      opts?: { fields?: readonly string[] }
    ) => Promise<Record<string, unknown> | null>;
    clear: (eventName?: string, payload?: Record<string, unknown>) => void;
  };
  pageDataPromise?: Promise<Record<string, unknown> | null>;
  _openMediaExplorer?: (payload?: Record<string, unknown>) => Promise<unknown> | unknown;
  __scriptRoot?: HTMLElement | ShadowRoot;
  __scriptWrapper?: HTMLElement;
}
