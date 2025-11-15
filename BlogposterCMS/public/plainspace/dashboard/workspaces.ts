type MeltdownEmit = (
  action: string,
  payload: Record<string, unknown>,
  callback?: (err: unknown, data: unknown) => void
) => Promise<unknown>;

interface AdminPage {
  id?: string;
  slug: string;
  title?: string;
  lane?: string;
  weight?: number | null;
  meta?: {
    icon?: string | null;
    workspace?: string | null;
  } | null;
  config?: {
    icon?: string | null;
  } | null;
}

declare global {
  interface Window {
    ADMIN_TOKEN?: string;
    ADMIN_BASE?: string;
    meltdownEmit: MeltdownEmit;
  }
}

const DEFAULT_WORKSPACE_ICON = '/assets/icons/file-box.svg';
const DEFAULT_SUBPAGE_ICON = '/assets/icons/file.svg';
const ADMIN_LANE = 'admin';

let iconListPromise: Promise<string[]> | null = null;
let fetchPromise: Promise<void> | null = null;
let lastRenderSignature: string | null = null;
let cachedPages: AdminPage[] | null = null;

function getAdminBase(): string {
  const base = (window.ADMIN_BASE || '/admin/').replace(/\/+$/u, '');
  return base.endsWith('/') ? base : `${base}/`;
}

function workspaceButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = 'workspace-create';
  button.className = 'nav-button';
  button.type = 'button';
  button.title = 'Create workspace';
  button.setAttribute('aria-label', 'Create workspace');

  const icon = document.createElement('img');
  icon.src = '/assets/icons/plus.svg';
  icon.className = 'icon';
  icon.alt = '';
  button.append(icon);

  return button;
}

function cloneWithCreateHandler(source: HTMLButtonElement): HTMLButtonElement {
  const clone = source.cloneNode(true) as HTMLButtonElement;
  clone.addEventListener('click', () => {
    void showWorkspaceField();
  });
  return clone;
}

function compareWeight(a: AdminPage, b: AdminPage): number {
  const aw = typeof a.weight === 'number' ? a.weight : 0;
  const bw = typeof b.weight === 'number' ? b.weight : 0;
  return aw - bw;
}

function asArray(value: unknown): AdminPage[] {
  if (Array.isArray(value)) {
    return value as AdminPage[];
  }
  if (value && typeof value === 'object') {
    const container = value as { pages?: unknown; data?: unknown };
    const maybePages = container.pages ?? container.data;
    if (Array.isArray(maybePages)) {
      return maybePages as AdminPage[];
    }
    if (maybePages && typeof maybePages === 'object' && 'slug' in (maybePages as Record<string, unknown>)) {
      return [maybePages as AdminPage];
    }
    if ('slug' in (value as Record<string, unknown>)) {
      return [value as AdminPage];
    }
  }
  return [];
}

async function fetchAdminPages(): Promise<AdminPage[]> {
  if (cachedPages) {
    return cachedPages;
  }

  if (!window.ADMIN_TOKEN) {
    console.warn('[workspaceNav] ADMIN_TOKEN not yet available; deferring page fetch.');
    return [];
  }

  try {
    const response = await window.meltdownEmit('getPagesByLane', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: ADMIN_LANE
    });

    const pages = asArray(response);
    cachedPages = pages;
    return pages;
  } catch (error) {
    console.error('[workspaceNav] failed to fetch pages', error);
    cachedPages = null;
    return [];
  }
}

async function ensureIconList(): Promise<string[]> {
  if (!iconListPromise) {
    iconListPromise = fetch('/assets/icon-list.json')
      .then(async res => {
        if (!res.ok) {
          throw new Error('Failed to load icons');
        }
        const names = await res.json();
        return Array.isArray(names) ? (names as string[]) : [];
      })
      .catch(err => {
        console.error('Failed to load icons', err);
        return [];
      });
  }
  return iconListPromise;
}

function normaliseIcon(page: AdminPage, fallback: string): string {
  const metaIcon = page.meta?.icon;
  if (typeof metaIcon === 'string' && metaIcon) {
    return metaIcon;
  }
  const configIcon = page.config?.icon;
  if (typeof configIcon === 'string' && configIcon) {
    return configIcon;
  }
  return fallback;
}

function computeSignature(workspaces: AdminPage[], subpages: AdminPage[], workspaceSlug: string): string {
  const simpleTop = workspaces.map(p => `${p.slug}|${p.title ?? ''}|${p.meta?.icon ?? ''}`).join('||');
  const simpleSub = subpages.map(p => `${p.slug}|${p.title ?? ''}|${p.meta?.icon ?? ''}`).join('||');
  return `${workspaceSlug}::${simpleTop}::${simpleSub}`;
}

function buildWorkspaces(nav: HTMLElement, pages: AdminPage[], adminBase: string, workspaceSlug: string): void {
  const existingCreate = nav.querySelector<HTMLButtonElement>('#workspace-create');
  const createBtn = cloneWithCreateHandler(existingCreate ?? workspaceButton());

  const fragment = document.createDocumentFragment();
  fragment.append(createBtn);

  pages
    .filter(page => page.lane === ADMIN_LANE && page.meta?.workspace === page.slug)
    .sort(compareWeight)
    .forEach(page => {
      const anchor = document.createElement('a');
      const href = `${adminBase}${page.slug}`;
      anchor.href = href;
      anchor.textContent = page.title || page.slug;
      if (window.location.pathname.startsWith(href)) {
        anchor.classList.add('active');
      }

      const icon = document.createElement('img');
      icon.src = normaliseIcon(page, DEFAULT_WORKSPACE_ICON);
      icon.className = 'icon';
      icon.alt = '';
      anchor.prepend(icon);

      fragment.append(anchor);
    });

  nav.replaceChildren(fragment);
}

function buildSidebar(nav: HTMLElement, pages: AdminPage[], adminBase: string, workspaceSlug: string): void {
  const fragment = document.createDocumentFragment();

  pages
    .filter(page => page.slug.startsWith(`${workspaceSlug}/`) && page.slug !== workspaceSlug)
    .sort(compareWeight)
    .forEach(page => {
      const title = page.title || page.slug.split('/').pop() || page.slug;
      const linkHref = `${adminBase}${page.slug}`;

      const anchor = document.createElement('a');
      anchor.href = linkHref;
      anchor.className = 'sidebar-item';
      if (window.location.pathname.startsWith(linkHref)) {
        anchor.classList.add('active');
      }

      const icon = document.createElement('img');
      icon.src = normaliseIcon(page, DEFAULT_SUBPAGE_ICON);
      icon.className = 'icon';
      icon.alt = '';
      anchor.append(icon);

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = title;
      anchor.append(label);

      fragment.append(anchor);
    });

  const add = document.createElement('div');
  add.className = 'sidebar-item sidebar-add-subpage';

  const addIcon = document.createElement('img');
  addIcon.src = '/assets/icons/plus.svg';
  addIcon.className = 'icon';
  addIcon.alt = '';
  add.append(addIcon);

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Add';
  add.append(label);

  add.addEventListener('click', () => {
    void showSubpageField(workspaceSlug);
  });

  fragment.append(add);

  nav.replaceChildren(fragment);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

interface InlineFieldDetail {
  name: string;
  icon: string;
}

type InlineSubmitHandler = (detail: InlineFieldDetail) => Promise<void> | void;

async function buildInlineField(
  id: string,
  placeholder: string,
  submitHandler: InlineSubmitHandler,
  iconConfirm = false
): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  container.id = id;
  container.className = 'inline-create-field';

  let selectedIcon = DEFAULT_WORKSPACE_ICON;

  const iconButton = document.createElement('button');
  iconButton.type = 'button';
  iconButton.className = 'icon-button';

  const iconImg = document.createElement('img');
  iconImg.src = selectedIcon;
  iconImg.alt = 'Select icon';
  iconButton.append(iconImg);

  const iconList = document.createElement('div');
  iconList.className = 'icon-list';

  function closeIconList(): void {
    iconList.classList.remove('open');
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(event: MouseEvent): void {
    if (!container.contains(event.target as Node)) {
      closeIconList();
    }
  }

  iconButton.addEventListener('click', async event => {
    event.stopPropagation();
    if (iconList.classList.contains('open')) {
      closeIconList();
      return;
    }
    iconList.classList.add('open');
    document.addEventListener('click', handleOutsideClick);
    if (!iconList.hasChildNodes()) {
      const iconNames = await ensureIconList();
      iconNames.forEach(name => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = `/assets/icons/${name}`;
        img.alt = name.replace('.svg', '');
        btn.append(img);
        btn.addEventListener('click', e => {
          e.stopPropagation();
          selectedIcon = `/assets/icons/${name}`;
          iconImg.src = selectedIcon;
          closeIconList();
        });
        iconList.append(btn);
      });
    }
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';

  if (iconConfirm) {
    submitBtn.className = 'icon-button confirm-button';
    const confirmImg = document.createElement('img');
    confirmImg.src = '/assets/icons/corner-down-right.svg';
    confirmImg.alt = 'Create';
    submitBtn.append(confirmImg);
  } else {
    submitBtn.textContent = 'Create';
  }

  submitBtn.addEventListener('click', async () => {
    closeIconList();
    await submitHandler({ name: input.value.trim(), icon: selectedIcon });
    container.remove();
  });

  container.append(iconButton, iconList, input, submitBtn);

  return container;
}

async function showWorkspaceField(): Promise<void> {
  const nav = document.getElementById('workspace-nav');
  const button = nav?.querySelector<HTMLButtonElement>('#workspace-create');
  if (!nav || !button) {
    return;
  }

  const icon = button.querySelector<HTMLImageElement>('img.icon');
  const existing = document.getElementById('workspace-floating-field');
  if (existing) {
    existing.remove();
    nav.querySelectorAll('a').forEach(anchor => {
      anchor.style.display = '';
    });
    if (icon) {
      icon.src = '/assets/icons/plus.svg';
    }
    return;
  }

  nav.querySelectorAll('a').forEach(anchor => {
    anchor.style.display = 'none';
  });
  if (icon) {
    icon.src = '/assets/icons/minus.svg';
  }

  const container = await buildInlineField(
    'workspace-floating-field',
    'Workspace name',
    async detail => {
      const slug = slugify(detail.name);
      if (!slug) {
        return;
      }

      try {
        await window.meltdownEmit('createPage', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'pagesManager',
          moduleType: 'core',
          title: detail.name,
          slug,
          lane: ADMIN_LANE,
          status: 'published',
          parent_id: null,
          meta: { icon: detail.icon, workspace: slug }
        });

        cachedPages = null;
        const base = getAdminBase();
        window.location.href = `${base}${slug}`;
      } catch (error) {
        console.error('Failed to create workspace', error);
      }
    },
    true
  );

  document.body.append(container);
  const rect = button.getBoundingClientRect();
  container.style.left = `${rect.right + window.scrollX + 8}px`;
  container.style.top = `${rect.top + window.scrollY + rect.height / 2}px`;
  container.style.zIndex = '1000';
  requestAnimationFrame(() => {
    container.classList.add('open');
  });
}

async function showSubpageField(workspace: string): Promise<void> {
  const addBtn = document.querySelector<HTMLDivElement>('.sidebar-add-subpage');
  if (!addBtn) {
    return;
  }

  const icon = addBtn.querySelector<HTMLImageElement>('img.icon');
  const label = addBtn.querySelector<HTMLSpanElement>('.label');
  const existing = document.getElementById('subpage-floating-field');

  if (existing) {
    existing.remove();
    if (icon) {
      icon.src = '/assets/icons/plus.svg';
    }
    if (label) {
      label.style.display = '';
    }
    return;
  }

  const container = await buildInlineField(
    'subpage-floating-field',
    'Page name',
    async detail => {
      const slug = slugify(detail.name);
      if (!slug) {
        return;
      }

      try {
        let parentId: string | null = null;
        try {
          const parentRes = await window.meltdownEmit('getPageBySlug', {
            jwt: window.ADMIN_TOKEN,
            moduleName: 'pagesManager',
            moduleType: 'core',
            slug: workspace,
            lane: ADMIN_LANE
          });

          const parentPages = asArray(parentRes);
          const parent = parentPages[0];
          parentId = parent?.id ?? null;
        } catch (error) {
          console.error('Failed to fetch parent page', error);
        }

        await window.meltdownEmit('createPage', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'pagesManager',
          moduleType: 'core',
          title: detail.name,
          slug: `${workspace}/${slug}`,
          lane: ADMIN_LANE,
          status: 'published',
          parent_id: parentId,
          meta: { icon: detail.icon }
        });

        cachedPages = null;
        window.location.reload();
      } catch (error) {
        console.error('Failed to create subpage', error);
      }
    },
    true
  );

  document.body.append(container);
  const rect = addBtn.getBoundingClientRect();
  container.style.left = `${rect.right + window.scrollX + 8}px`;
  container.style.top = `${rect.top + window.scrollY + rect.height / 2}px`;
  container.style.zIndex = '1000';

  if (icon) {
    icon.src = '/assets/icons/minus.svg';
  }
  if (label) {
    label.style.display = 'none';
  }

  requestAnimationFrame(() => {
    container.classList.add('open');
  });
}

async function renderWorkspaceNav(): Promise<void> {
  const nav = document.getElementById('workspace-nav');
  const sidebarNav = document.getElementById('subpage-nav');
  if (!nav && !sidebarNav) {
    return;
  }

  const adminBase = getAdminBase();
  const relativePath = window.location.pathname.replace(new RegExp(`^${adminBase.replace(/[-/\\^$*+?.()|[\]{}]/gu, '\\$&')}`), '');
  const workspaceSlug = relativePath.split('/')[0] || '';

  const pages = await fetchAdminPages();

  const adminPages = pages.filter(page => page.lane === ADMIN_LANE);

  const workspaceCandidates = adminPages.filter(page => {
    const explicitWorkspace = page.meta?.workspace === page.slug;
    const topLevel = !page.slug.includes('/');
    return explicitWorkspace || topLevel;
  });

  const activeWorkspaceSlug = workspaceSlug || workspaceCandidates[0]?.slug || '';

  const workspaces = workspaceCandidates;
  const sidebarPages = activeWorkspaceSlug
    ? adminPages.filter(page => page.slug.startsWith(`${activeWorkspaceSlug}/`) && page.slug !== activeWorkspaceSlug)
    : [];

  const signature = computeSignature(workspaces, sidebarPages, activeWorkspaceSlug);
  if (signature === lastRenderSignature) {
    return;
  }
  lastRenderSignature = signature;

  if (nav) {
    buildWorkspaces(nav, workspaces, adminBase, activeWorkspaceSlug);
  }
  if (sidebarNav && activeWorkspaceSlug) {
    buildSidebar(sidebarNav, sidebarPages, adminBase, activeWorkspaceSlug);
  }
}

export async function initWorkspaceNav(): Promise<void> {
  if (fetchPromise) {
    await fetchPromise;
    return;
  }

  fetchPromise = renderWorkspaceNav()
    .catch(error => {
      console.error('[workspaceNav] render failed', error);
    })
    .finally(() => {
      fetchPromise = null;
    });

  await fetchPromise;
}

function scheduleInit(): void {
  if (!window.ADMIN_TOKEN) {
    setTimeout(scheduleInit, 250);
    return;
  }
  void initWorkspaceNav();
}

document.addEventListener('DOMContentLoaded', scheduleInit);
document.addEventListener('main-header-loaded', scheduleInit);
document.addEventListener('sidebar-loaded', scheduleInit);
