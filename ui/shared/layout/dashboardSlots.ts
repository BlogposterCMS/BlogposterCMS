export type DashboardSlotName = 'third' | 'half' | 'twoThird' | 'full' | 'page';
export type DashboardViewportName = 'mobile' | 'tablet' | 'desktop';
export type DashboardHeightMode = 'auto' | 'dynamic' | 'fixed' | 'scroll' | string;
export type DashboardCssLength = string | number;

export type DashboardWidgetSizeSlot = {
  name: string;
  minCols?: number;
  maxCols?: number;
  minRows?: number;
  maxRows?: number;
};

export type DashboardWidgetHeightPolicy = {
  mode?: DashboardHeightMode;
  min?: DashboardCssLength | Partial<Record<DashboardViewportName, DashboardCssLength>>;
  minHeight?: DashboardCssLength | Partial<Record<DashboardViewportName, DashboardCssLength>>;
  height?: DashboardCssLength | Partial<Record<DashboardViewportName, DashboardCssLength>>;
  max?: DashboardCssLength | Partial<Record<DashboardViewportName, DashboardCssLength>>;
  maxHeight?: DashboardCssLength | Partial<Record<DashboardViewportName, DashboardCssLength>>;
  viewports?: Partial<Record<DashboardViewportName, DashboardWidgetHeightPolicy>>;
};

export type ResolvedDashboardHeightPolicy = {
  mode: DashboardHeightMode;
  minHeight?: string;
  height?: string;
  maxHeight?: string;
};

export type DashboardWidgetSizeContract = {
  supportedSlots?: DashboardWidgetSizeSlot[];
  breakpoints?: Record<string, string[]>;
  defaultSlot?: string;
  heightMode?: DashboardHeightMode;
  minHeight?: DashboardWidgetHeightPolicy['minHeight'];
  height?: DashboardCssLength | Partial<Record<DashboardViewportName, DashboardCssLength>> | DashboardWidgetHeightPolicy;
  maxHeight?: DashboardWidgetHeightPolicy['maxHeight'];
  heights?: DashboardWidgetHeightPolicy['viewports'];
};

export type DashboardWidgetDefinition = Record<string, any> & {
  id: string;
  metadata?: Record<string, any> & {
    layout?: DashboardWidgetSizeContract;
    sizeContract?: DashboardWidgetSizeContract;
  };
  layout?: DashboardWidgetSizeContract;
};

export type DashboardSlotDefinition = {
  name: DashboardSlotName;
  columns: number;
  exclusive?: boolean;
};

export const DASHBOARD_SLOT_COLUMNS: Record<DashboardSlotName, DashboardSlotDefinition> = {
  third: { name: 'third', columns: 4 },
  half: { name: 'half', columns: 6 },
  twoThird: { name: 'twoThird', columns: 8 },
  full: { name: 'full', columns: 12 },
  page: { name: 'page', columns: 12, exclusive: true }
};

const DASHBOARD_SLOT_ORDER: DashboardSlotName[] = [
  'third',
  'half',
  'twoThird',
  'full',
  'page'
];

const DASHBOARD_VIEWPORT_CASCADE: Record<DashboardViewportName, DashboardViewportName[]> = {
  mobile: ['mobile'],
  tablet: ['mobile', 'tablet'],
  desktop: ['mobile', 'tablet', 'desktop']
};

const CSS_LENGTH_PATTERN = /^(?:\d+(?:\.\d+)?(?:px|rem|em|vh|dvh|vw|%|ch)|auto|min-content|max-content|fit-content|(?:calc|clamp|min|max)\([^)]+\))$/i;

function isSizeContract(value: unknown): value is DashboardWidgetSizeContract {
  return Boolean(value) && typeof value === 'object';
}

function getDashboardWidgetSizeContract(
  def: DashboardWidgetDefinition
): DashboardWidgetSizeContract | null {
  if (isSizeContract(def.layout)) return def.layout;
  if (isSizeContract(def.metadata?.layout)) return def.metadata.layout;
  if (isSizeContract(def.metadata?.sizeContract)) return def.metadata.sizeContract;
  return null;
}

function isDashboardSlotName(value: unknown): value is DashboardSlotName {
  return typeof value === 'string' && value in DASHBOARD_SLOT_COLUMNS;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isResponsiveLengthMap(value: unknown): value is Partial<Record<DashboardViewportName, DashboardCssLength>> {
  return isPlainObject(value) && ['mobile', 'tablet', 'desktop'].some(key => key in value);
}

function isHeightPolicy(value: unknown): value is DashboardWidgetHeightPolicy {
  return isPlainObject(value) && (
    'mode' in value
    || 'min' in value
    || 'minHeight' in value
    || 'height' in value
    || 'max' in value
    || 'maxHeight' in value
    || 'viewports' in value
  );
}

function cssLengthValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return `${value}px`;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96) return undefined;
  if (/[;{}]/.test(trimmed)) return undefined;
  return CSS_LENGTH_PATTERN.test(trimmed) ? trimmed : undefined;
}

function responsiveCssLength(
  value: unknown,
  viewport: DashboardViewportName
): string | undefined {
  if (!isResponsiveLengthMap(value)) {
    return cssLengthValue(value);
  }
  let resolved: unknown;
  for (const key of DASHBOARD_VIEWPORT_CASCADE[viewport]) {
    if (value[key] !== undefined) {
      resolved = value[key];
    }
  }
  return cssLengthValue(resolved);
}

function mergeHeightPolicy(
  base: ResolvedDashboardHeightPolicy,
  policy: DashboardWidgetHeightPolicy | null | undefined,
  viewport: DashboardViewportName
): ResolvedDashboardHeightPolicy {
  if (!policy) return base;
  const next = { ...base };
  if (policy.mode) next.mode = policy.mode;
  const minHeight = responsiveCssLength(policy.minHeight ?? policy.min, viewport);
  const height = responsiveCssLength(policy.height, viewport);
  const maxHeight = responsiveCssLength(policy.maxHeight ?? policy.max, viewport);
  if (minHeight) next.minHeight = minHeight;
  if (height) next.height = height;
  if (maxHeight) next.maxHeight = maxHeight;
  return next;
}

function uniqueSlotNames(names: DashboardSlotName[]): DashboardSlotName[] {
  return Array.from(new Set(names));
}

function normalizeSlotList(values: unknown): DashboardSlotName[] {
  return Array.isArray(values)
    ? uniqueSlotNames(values.filter(isDashboardSlotName))
    : [];
}

function getContractSlotNames(contract: DashboardWidgetSizeContract | null): DashboardSlotName[] {
  const slots = Array.isArray(contract?.supportedSlots)
    ? contract.supportedSlots
    : [];
  return uniqueSlotNames(
    slots
      .map(slot => slot?.name)
      .filter(isDashboardSlotName)
  );
}

export function normalizeDashboardSlotName(
  value: unknown,
  fallback: DashboardSlotName = 'full'
): DashboardSlotName {
  return isDashboardSlotName(value) ? value : fallback;
}

export function getDashboardSlotDefinition(slot: unknown): DashboardSlotDefinition {
  return DASHBOARD_SLOT_COLUMNS[normalizeDashboardSlotName(slot)];
}

export function normalizeDashboardColumn(
  value: unknown,
  slot: DashboardSlotName,
  columnCount = 12
): number | null {
  const definition = getDashboardSlotDefinition(slot);
  const maxStart = Math.max(1, columnCount - definition.columns + 1);
  const numberValue = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(1, Math.min(Math.round(numberValue), maxStart));
}

export function resolveDashboardViewport(width = window.innerWidth): DashboardViewportName {
  if (width < 768) return 'mobile';
  if (width < 1180) return 'tablet';
  return 'desktop';
}

export function getSupportedDashboardSlots(
  def: DashboardWidgetDefinition,
  viewport: DashboardViewportName = resolveDashboardViewport()
): DashboardSlotName[] {
  const contract = getDashboardWidgetSizeContract(def);
  const contractSlots = getContractSlotNames(contract);
  const viewportSlots = normalizeSlotList(contract?.breakpoints?.[viewport]);
  const allowedSlots = viewportSlots.length ? viewportSlots : contractSlots;
  return allowedSlots.length ? allowedSlots : ['full'];
}

export function resolveDashboardHeightPolicy(
  def: DashboardWidgetDefinition,
  viewport: DashboardViewportName = resolveDashboardViewport()
): ResolvedDashboardHeightPolicy {
  const contract = getDashboardWidgetSizeContract(def);
  const heightObject = isHeightPolicy(contract?.height) ? contract.height : null;
  let policy: ResolvedDashboardHeightPolicy = {
    mode: contract?.heightMode || heightObject?.mode || 'auto'
  };

  policy = mergeHeightPolicy(policy, {
    minHeight: contract?.minHeight,
    height: isHeightPolicy(contract?.height) ? undefined : contract?.height,
    maxHeight: contract?.maxHeight
  }, viewport);
  policy = mergeHeightPolicy(policy, heightObject, viewport);

  for (const key of DASHBOARD_VIEWPORT_CASCADE[viewport]) {
    policy = mergeHeightPolicy(policy, heightObject?.viewports?.[key], viewport);
    policy = mergeHeightPolicy(policy, contract?.heights?.[key], viewport);
  }

  return policy;
}

export function getDefaultDashboardSlot(
  def: DashboardWidgetDefinition,
  viewport: DashboardViewportName = resolveDashboardViewport()
): DashboardSlotName {
  const contract = getDashboardWidgetSizeContract(def);
  const supported = getSupportedDashboardSlots(def, viewport);
  const requested = normalizeDashboardSlotName(contract?.defaultSlot, supported[0] || 'full');
  return supported.includes(requested) ? requested : supported[0] || 'full';
}

export function resolveDashboardSlotForWidget(
  def: DashboardWidgetDefinition,
  requestedSlot?: unknown,
  viewport: DashboardViewportName = resolveDashboardViewport()
): DashboardSlotName {
  const supported = getSupportedDashboardSlots(def, viewport);
  const requested = normalizeDashboardSlotName(
    requestedSlot,
    getDefaultDashboardSlot(def, viewport)
  );
  return supported.includes(requested)
    ? requested
    : getDefaultDashboardSlot(def, viewport);
}

export function getNextDashboardSlot(
  def: DashboardWidgetDefinition,
  currentSlot?: unknown,
  viewport: DashboardViewportName = resolveDashboardViewport()
): DashboardSlotName {
  const supported = getSupportedDashboardSlots(def, viewport)
    .slice()
    .sort((a, b) => DASHBOARD_SLOT_ORDER.indexOf(a) - DASHBOARD_SLOT_ORDER.indexOf(b));
  if (!supported.length) return 'full';
  const fallback = supported[0] as DashboardSlotName;
  const current = normalizeDashboardSlotName(currentSlot, fallback);
  const index = supported.indexOf(current);
  return supported[(index + 1) % supported.length] ?? fallback;
}

export function applyDashboardSlotToElement(
  el: HTMLElement,
  slot: DashboardSlotName,
  supportedSlots: DashboardSlotName[] = [slot],
  column?: unknown
): void {
  const definition = getDashboardSlotDefinition(slot);
  const startColumn = definition.exclusive || definition.name === 'full'
    ? 1
    : normalizeDashboardColumn(column, definition.name);
  el.dataset.dashboardSlot = definition.name;
  el.dataset.dashboardColumns = String(definition.columns);
  el.dataset.dashboardSupportedSlots = uniqueSlotNames(supportedSlots).join(',');
  el.dataset.widgetSizeSlot = definition.name === 'page' ? 'full' : definition.name;
  el.style.setProperty('--dashboard-column-span', String(definition.columns));
  if (startColumn) {
    el.dataset.dashboardColumn = String(startColumn);
    el.style.setProperty('--dashboard-column-start', String(startColumn));
  } else {
    delete el.dataset.dashboardColumn;
    el.style.removeProperty('--dashboard-column-start');
  }
  el.classList.toggle('dashboard-widget--page', Boolean(definition.exclusive));
}

export function applyDashboardHeightPolicyToElement(
  el: HTMLElement,
  def: DashboardWidgetDefinition,
  viewport: DashboardViewportName = resolveDashboardViewport()
): void {
  const policy = resolveDashboardHeightPolicy(def, viewport);
  el.dataset.dashboardHeightMode = policy.mode;
  el.style.removeProperty('--dashboard-min-height');
  el.style.removeProperty('--dashboard-height');
  el.style.removeProperty('--dashboard-max-height');

  if (policy.minHeight) {
    el.style.setProperty('--dashboard-min-height', policy.minHeight);
  }
  if (policy.height && policy.mode !== 'dynamic' && policy.mode !== 'auto') {
    el.style.setProperty('--dashboard-height', policy.height);
  }
  if (policy.maxHeight) {
    el.style.setProperty('--dashboard-max-height', policy.maxHeight);
  }
}
