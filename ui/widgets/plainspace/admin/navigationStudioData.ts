import {
  type DesignRecord,
  designUrl,
  fetchDesignerLayouts,
  sortDesignsByRecent
} from './designerLayoutsData.js';

export type NavigationStudioEmitter = Window['meltdownEmit'];

export interface NavigationLocation {
  id?: string | number;
  key?: string;
  label?: string;
  description?: string;
}

export interface NavigationMenu {
  id?: string | number;
  menuId?: string | number;
  key?: string;
  menuKey?: string;
  label?: string;
  description?: string;
  locationKey?: string;
  location_key?: string;
}

export interface NavigationItemMeta {
  icon?: string;
  visibility?: {
    desktop?: boolean;
    mobile?: boolean;
  };
  mega?: {
    enabled?: boolean;
    layoutId?: string | number | null;
    layoutTitle?: string;
    source?: string;
    fallback?: string;
  };
  [key: string]: unknown;
}

export interface NavigationMenuItem {
  id?: string | number;
  itemId?: string | number;
  menuId?: string | number;
  menu_id?: string | number;
  parentId?: string | number | null;
  parent_id?: string | number | null;
  type?: string;
  title?: string;
  url?: string;
  entryId?: string | number | null;
  entry_id?: string | number | null;
  sourceModule?: string | null;
  source_module?: string | null;
  sourceId?: string | number | null;
  source_id?: string | number | null;
  target?: string;
  rel?: string;
  cssClass?: string;
  css_class?: string;
  position?: number;
  status?: string;
  meta?: NavigationItemMeta;
  children?: NavigationMenuItem[];
}

export interface PageRecord {
  id?: string | number;
  title?: string;
  slug?: string;
  status?: string;
  lane?: string;
  parent_id?: string | number | null;
  weight?: number | null;
}

export interface NavigationDiagnostic {
  code: string;
  severity: 'info' | 'warning';
  message: string;
  itemId?: string | number | null;
}

export interface GeneratedNavigationItem {
  clientId: string;
  title: string;
  type: 'page';
  url: string;
  sourceModule: 'pagesManager';
  sourceId: string;
  status: 'active' | 'draft';
  children: GeneratedNavigationItem[];
}

interface DraftDesignRecord {
  id: null;
  title: string;
  description: string;
  thumbnail: string;
  ownerId: string | number;
  bgColor: string;
  bgMediaId: string;
  bgMediaUrl: string;
  version: number;
  isLayout: boolean;
  isGlobal: boolean;
  isDraft: boolean;
  meta: { surface: string };
}

const NAVIGATION_MODULE = {
  moduleName: 'navigationManager',
  moduleType: 'core'
} as const;

const PAGES_MODULE = {
  moduleName: 'pagesManager',
  moduleType: 'core'
} as const;

const DESIGNER_MODULE = {
  moduleName: 'designer',
  moduleType: 'community'
} as const;

export const NAVIGATION_STUDIO_MAX_DEPTH = 3;

export const NAVIGATION_STUDIO_DEFAULT_LOCATIONS: NavigationLocation[] = [
  { key: 'primary', label: 'Header Main', description: 'Main public site navigation.' },
  { key: 'mobile', label: 'Mobile Menu', description: 'Mobile drawer navigation.' },
  { key: 'footer', label: 'Footer Menu', description: 'Footer navigation links.' },
  { key: 'legal', label: 'Legal Menu', description: 'Legal and compliance links.' },
  { key: 'sidebar-blog', label: 'Sidebar / Blog', description: 'Sidebar and blog navigation.' }
];

export const NAVIGATION_STUDIO_DEFAULT_MENUS: NavigationMenu[] = [
  { key: 'header-main', label: 'Header Main', locationKey: 'primary' },
  { key: 'mobile-menu', label: 'Mobile Menu', locationKey: 'mobile' },
  { key: 'footer-menu', label: 'Footer Menu', locationKey: 'footer' },
  { key: 'legal-menu', label: 'Legal Menu', locationKey: 'legal' },
  { key: 'sidebar-blog', label: 'Sidebar / Blog', locationKey: 'sidebar-blog' }
];

function requireEmitter(emit: NavigationStudioEmitter): NonNullable<NavigationStudioEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_NAVIGATION_STUDIO_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toArray(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const item = value[key];
    if (Array.isArray(item)) return item;
  }
  return [];
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pageSort(a: PageRecord, b: PageRecord): number {
  const aw = typeof a.weight === 'number' ? a.weight : 0;
  const bw = typeof b.weight === 'number' ? b.weight : 0;
  if (aw !== bw) return aw - bw;
  return String(a.title || a.slug || '').localeCompare(String(b.title || b.slug || ''));
}

function buildMegaDraftDesignRecord(
  ownerId: string | number | null,
  title: string
): DraftDesignRecord {
  return {
    id: null,
    title,
    description: 'Mega menu panel managed from Navigation Studio.',
    thumbnail: '',
    ownerId: ownerId || '',
    bgColor: '',
    bgMediaId: '',
    bgMediaUrl: '',
    version: 0,
    isLayout: false,
    isGlobal: false,
    isDraft: true,
    meta: { surface: 'mega-menu' }
  };
}

function designIdFromResult(value: unknown): string | number | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as { id?: unknown; designId?: unknown };
  return typeof result.id === 'string' || typeof result.id === 'number'
    ? result.id
    : typeof result.designId === 'string' || typeof result.designId === 'number'
      ? result.designId
      : null;
}

export function toNavigationLocations(value: unknown): NavigationLocation[] {
  return toArray(value, ['locations', 'data']).filter((item): item is NavigationLocation => (
    isRecord(item) && typeof item.key === 'string'
  ));
}

export function toNavigationMenus(value: unknown): NavigationMenu[] {
  return toArray(value, ['menus', 'data']).filter((item): item is NavigationMenu => (
    isRecord(item) && Boolean(item.key || item.menuKey || item.id || item.menuId)
  ));
}

export function toPages(value: unknown): PageRecord[] {
  return toArray(value, ['pages', 'data']).filter((item): item is PageRecord => (
    isRecord(item) && Boolean(item.id || item.slug || item.title)
  ));
}

export function toNavigationItems(value: unknown): NavigationMenuItem[] {
  const source = isRecord(value) && Array.isArray(value.tree)
    ? value.tree
    : toArray(value, ['items', 'data']);
  return source.filter((item): item is NavigationMenuItem => isRecord(item));
}

export function menuId(menu: NavigationMenu | null | undefined): string | number | null {
  return menu?.id ?? menu?.menuId ?? null;
}

export function menuLocationKey(menu: NavigationMenu | null | undefined): string {
  return normalizeString(menu?.locationKey ?? menu?.location_key);
}

export function menuKey(menu: NavigationMenu | null | undefined): string {
  return normalizeString(menu?.key ?? menu?.menuKey);
}

export function itemId(item: NavigationMenuItem | null | undefined): string | number | null {
  return item?.id ?? item?.itemId ?? null;
}

export function itemParentId(item: NavigationMenuItem | null | undefined): string | number | null {
  return item?.parentId ?? item?.parent_id ?? null;
}

export function itemMenuId(item: NavigationMenuItem | null | undefined): string | number | null {
  return item?.menuId ?? item?.menu_id ?? null;
}

export function itemMeta(item: NavigationMenuItem | null | undefined): NavigationItemMeta {
  return isRecord(item?.meta) ? { ...(item?.meta as NavigationItemMeta) } : {};
}

export function navigationMenuRef(menu: NavigationMenu): Record<string, string | number> {
  const id = menuId(menu);
  if (id) return { menuId: id };
  const key = menuKey(menu);
  if (key) return { menuKey: key };
  const locationKey = menuLocationKey(menu);
  if (locationKey) return { locationKey };
  throw new Error('PLAINSPACE_NAVIGATION_STUDIO_MENU_REF_MISSING: menuId, menuKey or locationKey required');
}

export function navigationItemPayload(
  item: NavigationMenuItem,
  patch: Partial<NavigationMenuItem> = {}
): Record<string, unknown> {
  const merged = { ...item, ...patch };
  const id = itemId(merged);
  return {
    ...(id ? { itemId: id } : {}),
    ...(itemMenuId(merged) ? { menuId: itemMenuId(merged) } : {}),
    parentId: itemParentId(merged),
    type: merged.type || 'custom',
    title: merged.title || merged.url || '',
    url: merged.url || '',
    entryId: merged.entryId ?? merged.entry_id ?? null,
    sourceModule: merged.sourceModule ?? merged.source_module ?? null,
    sourceId: merged.sourceId ?? merged.source_id ?? null,
    target: merged.target || '',
    rel: merged.rel || '',
    cssClass: merged.cssClass ?? merged.css_class ?? '',
    position: Number(merged.position) || 0,
    status: merged.status || 'active',
    meta: itemMeta(merged)
  };
}

export function flattenNavigationItems(
  items: NavigationMenuItem[],
  depth = 1,
  parentId: string | number | null = null
): Array<{ item: NavigationMenuItem; depth: number; parentId: string | number | null; position: number }> {
  return items.flatMap((item, position) => {
    const id = itemId(item);
    const row = { item, depth, parentId, position };
    const children = Array.isArray(item.children)
      ? flattenNavigationItems(item.children, depth + 1, id)
      : [];
    return [row, ...children];
  });
}

export function maxNavigationDepth(items: NavigationMenuItem[]): number {
  return flattenNavigationItems(items).reduce((max, row) => Math.max(max, row.depth), 0);
}

export function pageUrl(page: PageRecord): string {
  const slug = normalizeString(page.slug).replace(/^\/+/u, '').replace(/\/+$/u, '');
  return slug ? `/${slug}` : '/';
}

export function generateItemsFromPages(
  pages: PageRecord[],
  maxDepth = NAVIGATION_STUDIO_MAX_DEPTH
): GeneratedNavigationItem[] {
  const visiblePages = pages
    .filter(page => (page.lane || 'public') === 'public')
    .filter(page => String(page.status || 'published').toLowerCase() !== 'deleted')
    .slice()
    .sort(pageSort);
  const byId = new Map<string, PageRecord>();
  const childrenByParent = new Map<string, PageRecord[]>();

  visiblePages.forEach(page => {
    if (page.id !== null && page.id !== undefined) byId.set(String(page.id), page);
  });

  visiblePages.forEach(page => {
    const parentId = page.parent_id == null ? '' : String(page.parent_id);
    if (!parentId || !byId.has(parentId)) return;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), page]);
  });

  const toGenerated = (page: PageRecord, depth: number): GeneratedNavigationItem | null => {
    if (depth > maxDepth || page.id === null || page.id === undefined) return null;
    const sourceId = String(page.id);
    const children = (childrenByParent.get(sourceId) || [])
      .map(child => toGenerated(child, depth + 1))
      .filter((item): item is GeneratedNavigationItem => Boolean(item));
    return {
      clientId: `page:${sourceId}`,
      title: page.title || page.slug || `Page ${sourceId}`,
      type: 'page',
      url: pageUrl(page),
      sourceModule: 'pagesManager',
      sourceId,
      status: String(page.status || 'published').toLowerCase() === 'published' ? 'active' : 'draft',
      children
    };
  };

  return visiblePages
    .filter(page => {
      const parentId = page.parent_id == null ? '' : String(page.parent_id);
      return !parentId || !byId.has(parentId);
    })
    .map(page => toGenerated(page, 1))
    .filter((item): item is GeneratedNavigationItem => Boolean(item));
}

export function buildNavigationDiagnostics(
  items: NavigationMenuItem[],
  pages: PageRecord[] = [],
  menu?: NavigationMenu | null
): NavigationDiagnostic[] {
  const diagnostics: NavigationDiagnostic[] = [];
  const flat = flattenNavigationItems(items);
  const rootCount = items.length;
  const mobileMenu = /mobile/i.test(`${menu?.label || ''} ${menuKey(menu)} ${menuLocationKey(menu)}`);
  const pageUrls = new Set(pages.map(pageUrl));
  const titleMap = new Map<string, NavigationMenuItem[]>();

  if (rootCount > 7) {
    diagnostics.push({
      code: 'NAV_STUDIO_ROOT_COUNT_HIGH',
      severity: 'warning',
      message: `${rootCount} main items are a lot. Aim for 5-7 if this is a header menu.`
    });
  }

  if (mobileMenu && flat.length > 12) {
    diagnostics.push({
      code: 'NAV_STUDIO_MOBILE_COUNT_HIGH',
      severity: 'warning',
      message: `${flat.length} mobile items may feel long on small screens.`
    });
  }

  if (maxNavigationDepth(items) > NAVIGATION_STUDIO_MAX_DEPTH) {
    diagnostics.push({
      code: 'NAV_STUDIO_DEPTH_ADVANCED',
      severity: 'info',
      message: 'This menu uses more than three levels. Keep that behind Advanced mode.'
    });
  }

  flat.forEach(({ item, depth }) => {
    const titleKey = normalizeString(item.title).toLowerCase();
    if (titleKey) titleMap.set(titleKey, [...(titleMap.get(titleKey) || []), item]);

    const url = normalizeString(item.url);
    if (!url && item.type !== 'archive') {
      diagnostics.push({
        code: 'NAV_STUDIO_ITEM_TARGET_MISSING',
        severity: 'warning',
        message: `"${item.title || 'Untitled'}" has no target.`,
        itemId: itemId(item)
      });
    }

    if (/^https?:\/\//iu.test(url) && item.target !== '_blank') {
      diagnostics.push({
        code: 'NAV_STUDIO_EXTERNAL_TARGET',
        severity: 'info',
        message: `"${item.title || url}" is external and does not open in a new tab.`,
        itemId: itemId(item)
      });
    }

    if (url.startsWith('/') && url !== '/' && !pageUrls.has(url) && item.type !== 'custom') {
      diagnostics.push({
        code: 'NAV_STUDIO_INTERNAL_TARGET_MISSING',
        severity: 'warning',
        message: `${url} does not match a current public page slug.`,
        itemId: itemId(item)
      });
    }

    const meta = itemMeta(item);
    if (meta.mega?.enabled && !meta.mega.layoutId && depth === 1) {
      diagnostics.push({
        code: 'NAV_STUDIO_MEGA_LAYOUT_MISSING',
        severity: 'info',
        message: `"${item.title || 'Mega item'}" is marked as Mega Menu but has no Design Studio layout selected.`,
        itemId: itemId(item)
      });
    }
  });

  titleMap.forEach((matches, title) => {
    if (matches.length > 1) {
      diagnostics.push({
        code: 'NAV_STUDIO_DUPLICATE_LABEL',
        severity: 'warning',
        message: `Multiple menu items are named "${title}".`,
        itemId: itemId(matches[0])
      });
    }
  });

  return diagnostics;
}

export async function fetchNavigationLocations(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined
): Promise<NavigationLocation[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('listNavigationLocations', {
    jwt,
    ...NAVIGATION_MODULE
  });
  return toNavigationLocations(res);
}

export async function fetchNavigationMenus(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined
): Promise<NavigationMenu[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('listNavigationMenus', {
    jwt,
    ...NAVIGATION_MODULE
  });
  return toNavigationMenus(res);
}

export async function fetchNavigationTree(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  menu: NavigationMenu
): Promise<NavigationMenuItem[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getNavigationTree', {
    jwt,
    ...NAVIGATION_MODULE,
    ...navigationMenuRef(menu)
  });
  return toNavigationItems(res);
}

export async function fetchPublicPages(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined
): Promise<PageRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getPagesByLane', {
    jwt,
    ...PAGES_MODULE,
    lane: 'public'
  });
  return toPages(res);
}

export async function fetchNavigationDesigns(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined
): Promise<DesignRecord[]> {
  return sortDesignsByRecent(await fetchDesignerLayouts(emit, jwt));
}

export async function registerNavigationLocation(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  location: NavigationLocation
): Promise<unknown> {
  const meltdownEmit = requireEmitter(emit);
  return meltdownEmit('registerNavigationLocation', {
    jwt,
    ...NAVIGATION_MODULE,
    key: location.key,
    label: location.label || location.key,
    description: location.description || ''
  });
}

export async function upsertNavigationMenu(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  menu: NavigationMenu
): Promise<NavigationMenu> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('upsertNavigationMenu', {
    jwt,
    ...NAVIGATION_MODULE,
    key: menuKey(menu),
    label: menu.label || menuKey(menu),
    description: menu.description || '',
    locationKey: menuLocationKey(menu)
  });
  return toNavigationMenus([res])[0] || (res as NavigationMenu);
}

export async function addNavigationItem(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  menu: NavigationMenu,
  item: NavigationMenuItem
): Promise<NavigationMenuItem> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('addNavigationMenuItem', {
    jwt,
    ...NAVIGATION_MODULE,
    ...navigationMenuRef(menu),
    ...navigationItemPayload(item)
  });
  return toNavigationItems([res])[0] || (res as NavigationMenuItem);
}

export async function updateNavigationItem(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  item: NavigationMenuItem,
  patch: Partial<NavigationMenuItem>
): Promise<NavigationMenuItem> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('updateNavigationMenuItem', {
    jwt,
    ...NAVIGATION_MODULE,
    ...navigationItemPayload(item, patch)
  });
  return toNavigationItems([res])[0] || (res as NavigationMenuItem);
}

export async function deleteNavigationItem(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  item: NavigationMenuItem
): Promise<unknown> {
  const meltdownEmit = requireEmitter(emit);
  return meltdownEmit('deleteNavigationMenuItem', {
    jwt,
    ...NAVIGATION_MODULE,
    itemId: itemId(item)
  });
}

export async function ensureNavigationStudioDefaults(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  locations: NavigationLocation[],
  menus: NavigationMenu[]
): Promise<void> {
  const locationKeys = new Set(locations.map(location => normalizeString(location.key)));
  for (const location of NAVIGATION_STUDIO_DEFAULT_LOCATIONS) {
    if (location.key && !locationKeys.has(location.key)) {
      await registerNavigationLocation(emit, jwt, location);
      locationKeys.add(location.key);
    }
  }

  const menuKeys = new Set(menus.map(menu => menuKey(menu)));
  const menuLocations = new Set(menus.map(menu => menuLocationKey(menu)).filter(Boolean));
  for (const menu of NAVIGATION_STUDIO_DEFAULT_MENUS) {
    const key = menuKey(menu);
    const locationKey = menuLocationKey(menu);
    if (!menuKeys.has(key) && !menuLocations.has(locationKey)) {
      await upsertNavigationMenu(emit, jwt, menu);
      menuKeys.add(key);
      menuLocations.add(locationKey);
    }
  }
}

export async function persistNavigationOrder(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  items: NavigationMenuItem[]
): Promise<void> {
  for (const row of flattenNavigationItems(items)) {
    await updateNavigationItem(emit, jwt, row.item, {
      parentId: row.parentId,
      position: row.position
    });
  }
}

async function createGeneratedBranch(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  menu: NavigationMenu,
  generated: GeneratedNavigationItem,
  parentId: string | number | null,
  position: number
): Promise<void> {
  const created = await addNavigationItem(emit, jwt, menu, {
    parentId,
    type: generated.type,
    title: generated.title,
    url: generated.url,
    sourceModule: generated.sourceModule,
    sourceId: generated.sourceId,
    position,
    status: generated.status,
    meta: { generatedFrom: 'pages' }
  });
  const createdId = itemId(created);
  for (const [childPosition, child] of generated.children.entries()) {
    await createGeneratedBranch(emit, jwt, menu, child, createdId, childPosition);
  }
}

export async function replaceMenuItemsWithGeneratedPages(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  menu: NavigationMenu,
  currentItems: NavigationMenuItem[],
  pages: PageRecord[]
): Promise<void> {
  const existing = flattenNavigationItems(currentItems).reverse();
  for (const row of existing) {
    await deleteNavigationItem(emit, jwt, row.item);
  }

  const generatedItems = generateItemsFromPages(pages);
  for (const [position, item] of generatedItems.entries()) {
    await createGeneratedBranch(emit, jwt, menu, item, null, position);
  }
}

export async function createMegaMenuDesign(
  emit: NavigationStudioEmitter,
  jwt: string | null | undefined,
  ownerId: string | number | null,
  title: string
): Promise<string | number | null> {
  const meltdownEmit = requireEmitter(emit);
  const design = buildMegaDraftDesignRecord(ownerId, title);
  const res = await meltdownEmit('designer.saveDesign', {
    jwt,
    ...DESIGNER_MODULE,
    design,
    widgets: [],
    layout: null
  }, 20000);
  return designIdFromResult(res);
}

export { type DesignRecord, designUrl };
