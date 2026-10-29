import {
  createMediaFolder,
  createMediaShareLink,
  deleteMediaItem,
  errorMessage,
  listMediaFolder,
  mediaItemPath,
  renameMediaItem,
  uploadMediaFile,
  type MediaUploadFetch,
  type ShareLinkResult
} from './mediaLibraryData.js';
import { bpDialog } from '../dialogs/bpDialog.js';
import { registerWorkspaceChanges } from '../navigation/workspaceChanges.js';
import { registerWorkspaceAgent, agentString } from '../agent/workspaceAgent.js';
import type { MediaStorageLocation } from './mediaStorageLocations.js';

export type MediaExplorerMode = 'manage' | 'picker';
export type MediaExplorerView = 'grid' | 'list';

export interface MediaExplorerSelection extends ShareLinkResult {
  name: string;
}

export interface MediaExplorerSurfaceOptions {
  mode?: MediaExplorerMode;
  jwt?: string | null;
  emit?: Window['meltdownEmit'];
  uploadFetch?: MediaUploadFetch;
  csrfToken?: string | null;
  initialPath?: string;
  accept?: string;
  /** SEO/image fields require a direct public asset and must not publish private files. */
  publicUrlOnly?: boolean;
  enableUpload?: boolean;
  enableMutations?: boolean;
  onSelectFile?: (selection: MediaExplorerSelection) => void;
  loadStorageLocations?: () => Promise<MediaStorageLocation[]>;
  onPublishDownload?: (connectionId: string) => Promise<void>;
}

export interface MediaExplorerSurface {
  element: HTMLElement;
  load: (path?: string) => Promise<void>;
  getCurrentPath: () => string;
}

import {
  acceptsMedia, isMediaImage, mediaDate, mediaEntries, mediaSize, mediaType,
  publicMediaUrl, visibleMediaEntries, type MediaEntry, type MediaSortKey
} from './mediaExplorerEntries.js';

const ICON_ROOT = '/assets/icons/';
function icon(name: string): HTMLImageElement {
  const image = document.createElement('img');
  image.src = `${ICON_ROOT}${name}.svg`;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  return image;
}
function commandButton(label: string, iconName: string, visibleLabel = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `media-command${visibleLabel ? ' media-command--label' : ''}`;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(icon(iconName));
  if (visibleLabel) button.append(document.createTextNode(label));
  return button;
}
function pathParts(path: string): string[] { return path.split('/').filter(Boolean); }
function fileIcon(entry: MediaEntry): string {
  if (entry.kind === 'folder') return 'folder';
  return ({ Image: 'file-image', Video: 'file-video-camera', Audio: 'file-music' } as Record<string, string>)[mediaType(entry)] || 'file-text';
}
function dialogApi() { return window.bpDialog ?? bpDialog; }

interface FolderState { folders?: string[]; loading?: boolean; error?: string; }

export function createMediaExplorerSurface(options: MediaExplorerSurfaceOptions = {}): MediaExplorerSurface {
  const mode = options.mode || 'manage';
  const enableUpload = options.enableUpload !== false;
  const enableMutations = options.enableMutations ?? mode === 'manage';
  const emit = options.emit ?? window.meltdownEmit;
  const jwt = options.jwt ?? window.ADMIN_TOKEN ?? window.PUBLIC_TOKEN;
  const root = document.createElement('section');
  root.className = `media-explorer media-explorer--${mode}`;
  root.setAttribute('aria-label', mode === 'picker' ? 'Choose a file' : 'Files and media');

  const heading = document.createElement('header');
  heading.className = 'media-explorer__heading';
  const title = document.createElement('h2');
  title.textContent = mode === 'picker' ? 'Choose a file' : 'Files & media';
  const intro = document.createElement('p');
  intro.textContent = mode === 'picker' ? 'Browse your library, then select a file to use.' : 'Your site files, organized in folders.';
  heading.append(title, intro);

  const toolbar = document.createElement('div');
  toolbar.className = 'media-explorer__toolbar';
  const commands = document.createElement('div');
  commands.className = 'media-explorer__commands';
  const uploadBtn = commandButton('Upload file', 'upload', true);
  uploadBtn.classList.add('primary');
  const folderBtn = commandButton('New folder', 'folder-plus', true);
  const openBtn = commandButton('Open folder', 'folder-open', true);
  const shareBtn = commandButton('Share link', 'link', true);
  const renameBtn = commandButton('Rename', 'file-pen-line', true);
  const deleteBtn = commandButton('Delete', 'trash-2', true);
  const publishBtn = commandButton('Publish download', 'upload', true);
  if (options.onPublishDownload) commands.append(publishBtn);
  deleteBtn.classList.add('danger');
  if (enableUpload) commands.append(uploadBtn);
  if (enableMutations) commands.append(folderBtn);
  commands.append(openBtn);
  if (mode === 'manage') commands.append(shareBtn);
  if (enableMutations) commands.append(renameBtn, deleteBtn);
  const views = document.createElement('div');
  views.className = 'media-explorer__views';
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', 'File view');
  const listBtn = commandButton('List view', 'list');
  const gridBtn = commandButton('Grid view', 'grid-3x3');
  views.append(listBtn, gridBtn);
  toolbar.append(commands, views);

  const address = document.createElement('div');
  address.className = 'media-explorer__address';
  const navigation = document.createElement('div');
  navigation.className = 'media-explorer__nav';
  const backBtn = commandButton('Back', 'arrow-left');
  const forwardBtn = commandButton('Forward', 'arrow-right');
  const upBtn = commandButton('Up one folder', 'arrow-up');
  const refreshBtn = commandButton('Refresh', 'refresh-cw');
  navigation.append(backBtn, forwardBtn, upBtn, refreshBtn);
  const crumbs = document.createElement('nav');
  crumbs.className = 'media-explorer__crumbs';
  crumbs.setAttribute('aria-label', 'Current folder');
  const search = document.createElement('input');
  search.className = 'media-explorer__search';
  search.type = 'search';
  search.placeholder = 'Search this folder';
  search.setAttribute('aria-label', 'Search media');
  search.autocomplete = 'off';
  address.append(navigation, crumbs, search);

  const body = document.createElement('div');
  body.className = 'media-explorer__body';
  const folders = document.createElement('nav');
  folders.className = 'media-explorer__folders';
  folders.setAttribute('aria-label', 'Folders');
  const main = document.createElement('div');
  main.className = 'media-explorer__main';
  const folderHeading = document.createElement('h3');
  folderHeading.className = 'media-explorer__folder-title';
  const columns = document.createElement('div');
  columns.className = 'media-explorer__columns';
  const sortButtons = new Map<MediaSortKey, HTMLButtonElement>();
  for (const [key, label] of [['name', 'Name'], ['type', 'Type'], ['modified', 'Modified'], ['size', 'Size']] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', `Sort by ${label.toLowerCase()}`);
    button.onclick = () => {
      descending = sortKey === key ? !descending : false;
      sortKey = key;
      renderEntries();
    };
    sortButtons.set(key, button);
    columns.append(button);
  }
  const itemsEl = document.createElement('div');
  itemsEl.className = 'media-explorer__items';
  itemsEl.setAttribute('role', 'listbox');
  itemsEl.setAttribute('aria-label', 'Files and folders');
  const details = document.createElement('aside');
  details.className = 'media-explorer__details';
  details.setAttribute('aria-label', 'Selection details');
  main.append(folderHeading, columns, itemsEl);
  body.append(folders, main, details);
  const footer = document.createElement('footer');
  footer.className = 'media-explorer__footer';
  const statusEl = document.createElement('div');
  statusEl.className = 'media-explorer__status';
  statusEl.setAttribute('role', 'status');
  const useBtn = commandButton('Use selected file', 'check', true);
  useBtn.classList.add('primary');
  footer.append(statusEl);
  if (mode === 'picker') footer.append(useBtn);
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'file';
  hiddenInput.hidden = true;
  hiddenInput.className = 'media-explorer__file-input';
  if (options.accept) hiddenInput.accept = options.accept;
  root.append(heading, toolbar, address, body, footer, hiddenInput);

  let currentPath = options.initialPath || '';
  let listingEntries: MediaEntry[] = [];
  let currentView: MediaExplorerView = mode === 'picker' ? 'grid' : 'list';
  let selectedPath = '';
  let sortKey: MediaSortKey = 'name';
  let descending = false;
  let loadVersion = 0;
  let loadState: 'loading' | 'ready' | 'error' = 'loading';
  let loadError = '';
  let busy = false;
  let locationId = 'local';
  let storageLocations: MediaStorageLocation[] = [];
  let storageError = '';
  const isRemote = () => locationId !== 'local';
  const locationLabel = () => storageLocations.find(location => location.id === locationId)?.label || 'Library';
  const listFolder = (path: string) => {
    if (!isRemote()) return listMediaFolder(emit, jwt, path);
    const location = storageLocations.find(item => item.id === locationId);
    if (!location) return Promise.reject(new Error('MEDIA_EXPLORER_STORAGE_UNAVAILABLE'));
    return location.list(path);
  };
  const history = [currentPath];
  let historyIndex = 0;
  const folderCache = new Map<string, FolderState>();
  const expanded = new Set(['']);
  registerWorkspaceChanges(root, { isDirty: () => false, isBusy: () => busy });

  const selectedEntry = () => listingEntries.find(entry => entry.path === selectedPath);
  const visibleEntries = () => visibleMediaEntries(listingEntries, search.value, sortKey, descending);
  function setStatus(message: string, kind: 'neutral' | 'error' = 'neutral') {
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
    statusEl.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }
  function renderStatus() {
    const count = visibleEntries().length;
    setStatus(`${count} ${count === 1 ? 'item' : 'items'}${search.value ? ` of ${listingEntries.length}` : ''}${selectedEntry() ? ' · 1 selected' : ''}`);
  }
  function updateCommands() {
    const selected = selectedEntry();
    const unavailable = busy || loadState !== 'ready';
    uploadBtn.disabled = folderBtn.disabled = unavailable || isRemote();
    publishBtn.disabled = unavailable;
    openBtn.disabled = unavailable || selected?.kind !== 'folder';
    shareBtn.disabled = unavailable || selected?.kind !== 'file' || (isRemote() && !publicMediaUrl(selected));
    renameBtn.disabled = deleteBtn.disabled = unavailable || !selected || isRemote();
    useBtn.disabled = unavailable || selected?.kind !== 'file' || !acceptsMedia(selected, options.accept);
    backBtn.disabled = busy || historyIndex === 0;
    forwardBtn.disabled = busy || historyIndex >= history.length - 1;
    upBtn.disabled = busy || !currentPath;
  }
  async function perform(action: () => Promise<void>, propagate = false) {
    if (busy || loadState !== 'ready') {
      if (propagate) throw new Error('MEDIA_EXPLORER_NOT_READY: Reload the folder before changing files.');
      return;
    }
    busy = true;
    root.inert = true;
    root.setAttribute('aria-busy', 'true');
    updateCommands();
    try { await action(); }
    catch (error) { setStatus(`MEDIA_EXPLORER_ACTION_FAILED: ${errorMessage(error)}`, 'error'); if (propagate) throw error; }
    finally {
      busy = false;
      root.inert = false;
      root.setAttribute('aria-busy', 'false');
      updateCommands();
    }
  }

  function renderCrumbs() {
    crumbs.replaceChildren();
    let cursor = '';
    for (const [index, part] of [locationLabel(), ...pathParts(currentPath)].entries()) {
      if (index) {
        cursor = mediaItemPath(cursor, part);
        const separator = document.createElement('span');
        separator.textContent = '/';
        separator.setAttribute('aria-hidden', 'true');
        crumbs.append(separator);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = part;
      const target = cursor;
      if (target === currentPath) button.setAttribute('aria-current', 'location');
      button.onclick = () => { void navigate(target); };
      crumbs.append(button);
    }
    folderHeading.textContent = pathParts(currentPath).at(-1) || locationLabel();
  }

  async function loadTree(path: string) {
    if (folderCache.get(path)?.loading) return;
    const state: FolderState = { loading: true };
    folderCache.set(path, state);
    renderFolders();
    try {
      const listing = await listFolder(path);
      // A main-pane refresh can supersede this sidebar-only request.
      if (folderCache.get(path) !== state) return;
      folderCache.set(path, { folders: listing.folders });
    } catch (error) {
      if (folderCache.get(path) !== state) return;
      folderCache.set(path, { error: `MEDIA_EXPLORER_FOLDERS_FAILED: ${errorMessage(error)}` });
    }
    renderFolders();
  }
  function renderFolders() {
    const label = document.createElement('h3');
    label.textContent = options.loadStorageLocations ? 'Storage' : 'Folders';
    folders.replaceChildren(label);
    function row(path: string, name: string, depth: number): HTMLElement {
      const item = document.createElement('li');
      const line = document.createElement('div');
      line.className = 'media-folder';
      line.style.setProperty('--folder-depth', String(depth));
      const cached = folderCache.get(path);
      const toggle = commandButton(`${expanded.has(path) ? 'Collapse' : 'Expand'} ${name}`, expanded.has(path) ? 'chevron-down' : 'chevron-right');
      toggle.setAttribute('aria-expanded', String(expanded.has(path)));
      toggle.disabled = cached?.folders?.length === 0;
      toggle.onclick = () => {
        if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
        if (expanded.has(path) && !cached?.folders) void loadTree(path); else renderFolders();
      };
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'media-folder__name';
      button.title = name;
      button.append(icon(path === currentPath ? 'folder-open' : 'folder'), document.createTextNode(name));
      if (path === currentPath) button.setAttribute('aria-current', 'location');
      button.onclick = () => { void navigate(path); };
      line.append(toggle, button);
      item.append(line);
      if (expanded.has(path)) {
        const children = document.createElement('ul');
        if (cached?.loading) {
          const loading = document.createElement('li'); loading.textContent = 'Loading…'; children.append(loading);
        } else if (cached?.error) {
          const retry = document.createElement('button');
          retry.type = 'button'; retry.textContent = 'Retry folders'; retry.title = cached.error;
          retry.onclick = () => { void loadTree(path); };
          const failure = document.createElement('li'); failure.append(retry); children.append(failure);
        } else {
          [...(cached?.folders || [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .forEach(child => children.append(row(mediaItemPath(path, child), child, depth + 1)));
        }
        item.append(children);
      }
      return item;
    }
    const tree = document.createElement('ul');
    if (!options.loadStorageLocations) tree.append(row('', 'Library', 0));
    else {
      for (const location of [{ id: 'local', label: 'Local server' }, ...storageLocations]) {
        const item = document.createElement('li');
        const button = document.createElement('button'); button.type = 'button'; button.className = 'media-folder__name';
        button.append(icon('folder'), document.createTextNode(location.label));
        button.setAttribute('aria-label', `Open storage ${location.label}`);
        if (location.id === locationId) button.setAttribute('aria-current', 'location');
        button.onclick = () => { void selectLocation(location.id); };
        item.append(button);
        if (location.id === locationId) { const branch = document.createElement('ul'); branch.append(row('', 'Files', 1)); item.append(branch); }
        tree.append(item);
      }
      const settings = document.createElement('a'); settings.href = '/admin/settings/general?tab=storage';
      settings.className = 'media-command media-command--label'; settings.style.textDecoration = 'none'; settings.textContent = 'Connect storage';
      folders.append(settings);
      if (storageError) {
        const retry = commandButton('Retry storage connections', 'refresh-cw', true);
        retry.title = storageError; retry.onclick = () => { void reloadLocations(); }; folders.append(retry);
      }
    }
    folders.append(tree);
  }

  async function reloadLocations() {
    if (!options.loadStorageLocations) return;
    try { storageLocations = await options.loadStorageLocations(); storageError = ''; }
    catch (error) { storageError = `MEDIA_EXPLORER_STORAGE_FAILED: ${errorMessage(error)}`; }
    renderFolders();
  }
  async function selectLocation(id: string) {
    if (busy) return;
    if (id !== 'local' && !storageLocations.some(location => location.id === id)) throw new Error('MEDIA_EXPLORER_STORAGE_UNAVAILABLE');
    locationId = id; folderCache.clear(); expanded.clear(); expanded.add('');
    history.splice(0, history.length, ''); historyIndex = 0; search.value = '';
    await load('');
  }

  function renderDetails() {
    details.replaceChildren();
    const entry = selectedEntry();
    details.hidden = !entry;
    body.classList.toggle('has-selection', Boolean(entry));
    if (!entry) return;
    const preview = document.createElement('div');
    preview.className = 'media-explorer__preview';
    const url = publicMediaUrl(entry);
    if (url && isMediaImage(entry)) {
      const image = document.createElement('img'); image.src = url; image.alt = entry.name;
      image.onerror = () => preview.replaceChildren(icon(fileIcon(entry)));
      preview.append(image);
    } else preview.append(icon(fileIcon(entry)));
    const name = document.createElement('h3'); name.textContent = entry.name;
    const path = document.createElement('p'); path.className = 'media-explorer__detail-path'; path.textContent = `Library / ${entry.path}`;
    const info = document.createElement('dl');
    for (const [key, value] of [['Type', mediaType(entry)], ['Size', entry.kind === 'folder' ? '—' : mediaSize(entry.size)], ['Modified', mediaDate(entry.modifiedAt)]] as const) {
      const term = document.createElement('dt'); term.textContent = key;
      const definition = document.createElement('dd'); definition.textContent = value;
      info.append(term, definition);
    }
    details.append(preview, name, path, info);
    if (url) {
      const open = document.createElement('a'); open.href = url; open.target = '_blank'; open.rel = 'noopener noreferrer';
      open.textContent = 'Open file'; open.className = 'button secondary'; details.append(open);
    }
    if (mode === 'picker' && !acceptsMedia(entry, options.accept)) {
      const hint = document.createElement('p'); hint.textContent = `Choose a file matching ${options.accept}.`; details.append(hint);
    }
  }
  function select(entry?: MediaEntry, focus = false) {
    selectedPath = entry?.path || '';
    itemsEl.querySelectorAll<HTMLElement>('.media-item').forEach(item => {
      const active = item.dataset.path === selectedPath;
      item.classList.toggle('selected', active);
      const button = item.querySelector<HTMLButtonElement>('.media-item__main')!;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active || (!selectedPath && item === itemsEl.firstElementChild) ? 0 : -1;
      if (active && focus) button.focus();
    });
    renderDetails();
    updateCommands();
    if (loadState === 'ready') renderStatus();
  }
  async function choose(entry: MediaEntry) {
    if (!acceptsMedia(entry, options.accept)) return;
    const result = options.publicUrlOnly || isRemote() ? { shareURL: publicMediaUrl(entry) } : await createMediaShareLink(emit, jwt, entry.path);
    if (options.publicUrlOnly && !result.shareURL) throw new Error('MEDIA_PUBLIC_IMAGE_REQUIRED: Choose an image from public media or a configured public storage location.');
    if (!result.shareURL) throw new Error('MEDIA_EXPLORER_SELECTION_FAILED: No usable file URL was returned.');
    options.onSelectFile?.({ ...result, name: entry.path });
  }
  function open(entry: MediaEntry) {
    if (entry.kind === 'folder') void navigate(entry.path);
    else if (mode === 'picker') void perform(() => choose(entry));
    else select(entry);
  }
  function renderEntry(entry: MediaEntry, index: number) {
    const item = document.createElement('div');
    item.className = `media-item ${entry.kind}`;
    item.dataset.path = entry.path;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-item__main';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', `${entry.name}, ${mediaType(entry)}`);
    button.title = entry.name;
    const mark = document.createElement('span'); mark.className = 'media-icon';
    const preview = publicMediaUrl(entry);
    if (currentView === 'grid' && preview && isMediaImage(entry)) {
      const image = document.createElement('img'); image.src = preview; image.alt = ''; image.loading = 'lazy'; image.className = 'media-thumbnail';
      image.onerror = () => mark.replaceChildren(icon(fileIcon(entry)));
      mark.append(image);
    } else mark.append(icon(fileIcon(entry)));
    const name = document.createElement('span'); name.className = 'media-name'; name.textContent = entry.name;
    const identity = document.createElement('span'); identity.className = 'media-item__identity'; identity.append(mark, name);
    button.append(identity);
    for (const [className, text] of [['type', mediaType(entry)], ['modified', mediaDate(entry.modifiedAt)], ['size', entry.kind === 'folder' ? '—' : mediaSize(entry.size)]] as const) {
      const cell = document.createElement('span'); cell.className = `media-item__${className}`; cell.textContent = text; button.append(cell);
    }
    button.onclick = () => select(entry);
    button.ondblclick = () => open(entry);
    button.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); open(entry); return; }
      const visible = visibleEntries();
      const target = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? Math.min(index + 1, visible.length - 1)
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? Math.max(index - 1, 0)
        : event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : -1;
      if (target >= 0) { event.preventDefault(); select(visible[target], true); }
      if (event.key === 'Escape') { event.preventDefault(); select(); }
      if (event.key === 'F2' && enableMutations) { event.preventDefault(); select(entry); renameBtn.click(); }
      if (event.key === 'Delete' && enableMutations) { event.preventDefault(); select(entry); deleteBtn.click(); }
    };
    item.append(button);
    return item;
  }
  function renderEntries() {
    itemsEl.replaceChildren();
    itemsEl.className = `media-explorer__items media-explorer__items--${currentView}`;
    columns.hidden = currentView !== 'list' || loadState !== 'ready';
    listBtn.setAttribute('aria-pressed', String(currentView === 'list'));
    gridBtn.setAttribute('aria-pressed', String(currentView === 'grid'));
    sortButtons.forEach((button, key) => { button.dataset.direction = key === sortKey ? (descending ? 'descending' : 'ascending') : ''; });
    if (loadState !== 'ready') {
      const message = document.createElement('p'); message.className = 'media-explorer__empty';
      message.textContent = loadState === 'loading' ? 'Loading files…' : loadError;
      itemsEl.append(message);
      if (loadState === 'error') {
        const retry = commandButton('Retry', 'refresh-cw', true);
        retry.onclick = () => { void load(currentPath); }; itemsEl.append(retry);
      }
      setStatus(message.textContent, loadState === 'error' ? 'error' : 'neutral');
      select();
      return;
    }
    const visible = visibleEntries();
    if (!visible.some(entry => entry.path === selectedPath)) selectedPath = '';
    if (!visible.length) {
      const empty = document.createElement('p'); empty.className = 'media-explorer__empty';
      empty.textContent = search.value.trim() ? 'No matching files in this folder.' : 'This folder is empty.';
      itemsEl.append(empty);
    } else visible.forEach((entry, index) => itemsEl.append(renderEntry(entry, index)));
    select(selectedEntry());
  }

  async function load(path = '') {
    const version = ++loadVersion;
    loadState = 'loading';
    loadError = '';
    currentPath = path;
    selectedPath = '';
    renderCrumbs();
    renderEntries();
    try {
      const listing = await listFolder(path);
      if (version !== loadVersion) return;
      loadState = 'ready';
      currentPath = listing.currentPath || path;
      listingEntries = mediaEntries(listing, currentPath);
      folderCache.set(currentPath, { folders: listing.folders });
      let ancestor = '';
      expanded.add('');
      expanded.add(currentPath);
      pathParts(currentPath).forEach(part => { expanded.add(ancestor); ancestor = mediaItemPath(ancestor, part); });
      renderCrumbs(); renderFolders(); renderEntries();
      // Only expand folders on demand; do not recursively scan the library.
      for (const path of expanded) if (!folderCache.has(path)) void loadTree(path);
    } catch (error) {
      if (version !== loadVersion) return;
      loadState = 'error';
      loadError = `MEDIA_EXPLORER_LOAD_FAILED: ${errorMessage(error)}`;
      listingEntries = [];
      renderEntries();
    }
  }
  async function navigate(path: string, direction?: number) {
    if (busy) return;
    if (direction !== undefined) historyIndex = direction;
    else if (path !== currentPath) { history.splice(historyIndex + 1); history.push(path); historyIndex = history.length - 1; }
    search.value = '';
    await load(path);
  }
  async function refreshAfterMutation(message: string) {
    await load(currentPath);
    if (loadState === 'ready') setStatus(message);
  }
  function invalidateFolder(path: string) {
    [...folderCache.keys()].filter(key => key === path || key.startsWith(`${path}/`)).forEach(key => folderCache.delete(key));
  }
  async function renameEntry(entry: MediaEntry, name: string) {
    if (isRemote()) throw new Error('MEDIA_EXPLORER_STORAGE_MUTATION_UNSUPPORTED');
    await renameMediaItem(emit, jwt, currentPath, entry.name, name.trim());
    invalidateFolder(entry.path);
    await refreshAfterMutation(`Renamed to ${name.trim()}`);
  }
  async function deleteEntry(entry: MediaEntry) {
    if (isRemote()) throw new Error('MEDIA_EXPLORER_STORAGE_MUTATION_UNSUPPORTED');
    await deleteMediaItem(emit, jwt, currentPath, entry.name);
    invalidateFolder(entry.path);
    await refreshAfterMutation(`Deleted ${entry.name}`);
  }
  async function createFolder(name: string) {
    if (isRemote()) throw new Error('MEDIA_EXPLORER_STORAGE_MUTATION_UNSUPPORTED');
    await createMediaFolder(emit, jwt, currentPath, name.trim());
    await refreshAfterMutation(`Created ${name.trim()}`);
  }
  backBtn.onclick = () => { if (historyIndex > 0) void navigate(history[historyIndex - 1]!, historyIndex - 1); };
  forwardBtn.onclick = () => { if (historyIndex + 1 < history.length) void navigate(history[historyIndex + 1]!, historyIndex + 1); };
  upBtn.onclick = () => { void navigate(pathParts(currentPath).slice(0, -1).join('/')); };
  refreshBtn.onclick = () => { void reloadLocations().then(() => load(currentPath)); };
  publishBtn.onclick = () => { void perform(async () => {
    await options.onPublishDownload?.(locationId.startsWith('external:') ? 'local' : locationId);
    await reloadLocations(); await load(currentPath);
  }); };
  gridBtn.onclick = () => { currentView = 'grid'; renderEntries(); };
  listBtn.onclick = () => { currentView = 'list'; renderEntries(); };
  search.oninput = () => renderEntries();
  openBtn.onclick = () => { const entry = selectedEntry(); if (entry?.kind === 'folder') open(entry); };
  useBtn.onclick = () => { const entry = selectedEntry(); if (entry?.kind === 'file') void perform(() => choose(entry)); };
  shareBtn.onclick = () => {
    const entry = selectedEntry(); if (entry?.kind !== 'file') return;
    void perform(async () => {
      const result = isRemote() ? { shareURL: publicMediaUrl(entry) } : await createMediaShareLink(emit, jwt, entry.path);
      if (!result.shareURL) throw new Error('MEDIA_EXPLORER_SHARE_FAILED: No share URL was returned.');
      await dialogApi().prompt('Share link', result.shareURL);
      setStatus(`Share link created for ${entry.name}`);
    });
  };
  renameBtn.onclick = () => {
    const entry = selectedEntry(); if (!entry) return;
    void perform(async () => {
      const name = await dialogApi().prompt('Rename item', entry.name, { prompt: { label: 'Name', required: true } });
      if (!name?.trim() || name === entry.name) return;
      await renameEntry(entry, name);
    });
  };
  deleteBtn.onclick = () => {
    const entry = selectedEntry(); if (!entry) return;
    void perform(async () => {
      const message = entry.kind === 'folder' ? `Delete folder “${entry.name}” and its contents?` : `Delete “${entry.name}”?`;
      if (!await dialogApi().confirm(message, { title: 'Delete item', confirmLabel: 'Delete', cancelLabel: 'Cancel' })) return;
      await deleteEntry(entry);
    });
  };
  uploadBtn.onclick = () => hiddenInput.click();
  hiddenInput.onchange = () => {
    const file = hiddenInput.files?.[0]; if (!file) return;
    void perform(async () => {
      try {
        await uploadMediaFile(options.uploadFetch ?? window.fetchWithTimeout, options.csrfToken ?? window.CSRF_TOKEN, currentPath, file);
        await refreshAfterMutation(`Uploaded ${file.name}`);
      } finally { hiddenInput.value = ''; }
    });
  };
  folderBtn.onclick = () => void perform(async () => {
    const name = await dialogApi().prompt('New folder name:', '', { prompt: { label: 'Folder name', required: true } });
    if (!name?.trim()) return;
    await createFolder(name);
  });

  renderFolders();
  if (options.loadStorageLocations) void reloadLocations();
  void load(currentPath);
  function agentEntry(params: Record<string, unknown>): MediaEntry {
    const path = agentString(params, 'path');
    const entry = listingEntries.find(item => item.path === path);
    if (!entry) throw new Error('MEDIA_EXPLORER_ITEM_NOT_FOUND: Inspect the current folder first.');
    return entry;
  }
  registerWorkspaceAgent({ root, id: mode === 'picker' ? 'media-picker' : 'media', title: mode === 'picker' ? 'Choose media' : 'Files and media',
    read: () => ({ dirty: false, busy: busy || loadState === 'loading', error: loadError || (statusEl.dataset.kind === 'error' ? statusEl.textContent : null),
      mode, currentPath, storageId: locationId, storages: [{ id: 'local', label: 'Local server' }, ...storageLocations.map(({ id, label }) => ({ id, label }))],
      storageError: storageError || null, mutationsSupported: !isRemote(), selection: selectedPath || null, query: search.value, view: currentView,
      entryCount: listingEntries.length, visibleCount: visibleEntries().length,
      entries: visibleEntries().map(entry => ({ ...entry, selectable: entry.kind === 'folder' || acceptsMedia(entry, options.accept) })),
      accept: options.accept || null, history: { back: historyIndex > 0, forward: historyIndex + 1 < history.length }
    }), actions: [
      ...(options.loadStorageLocations ? [{ action: 'media.openStorage', label: 'Open storage', params: [{ name: 'id', type: 'string' as const, required: true }],
        run: async (p: Record<string, unknown>) => { await selectLocation(agentString(p, 'id')); if (loadState === 'error') throw new Error(loadError); } }] : []),
      { action: 'media.openFolder', label: 'Open folder', params: [{ name: 'path', type: 'string', required: true }],
        run: async p => {
          const path = typeof p.path === 'string' ? p.path : '';
          if (path && !folderCache.has(path) && !listingEntries.some(entry => entry.path === path && entry.kind === 'folder')) throw new Error('MEDIA_EXPLORER_FOLDER_UNKNOWN');
          await navigate(path);
          if (loadState === 'error') throw new Error(loadError);
        } },
      { action: 'media.select', label: 'Select file or folder', params: [{ name: 'path', type: 'string', required: true }], run: p => select(agentEntry(p)) },
      { action: 'media.search', label: 'Search current folder', params: [{ name: 'query', type: 'string', required: true }], run: p => {
        if (typeof p.query !== 'string') throw new Error('CMS_AGENT_PARAM_INVALID: query must be a string.');
        search.value = p.query; renderEntries();
      } },
      { action: 'media.refresh', label: 'Reload current folder', run: async () => { await load(currentPath); if (loadState === 'error') throw new Error(loadError); } },
      ...(enableMutations ? [
        { action: 'media.createFolder', label: 'Create folder', params: [{ name: 'name', type: 'string', required: true }], run: (p: Record<string, unknown>) => perform(() => createFolder(agentString(p, 'name')), true) },
        { action: 'media.rename', label: 'Rename item', params: [{ name: 'path', type: 'string', required: true }, { name: 'name', type: 'string', required: true }], run: (p: Record<string, unknown>) => perform(() => renameEntry(agentEntry(p), agentString(p, 'name')), true) },
        { action: 'media.delete', label: 'Delete item', params: [{ name: 'path', type: 'string', required: true }], confirm: true, run: (p: Record<string, unknown>) => perform(() => deleteEntry(agentEntry(p)), true) }
      ] : []),
      ...(mode === 'picker' ? [{ action: 'media.useSelected', label: 'Use selected file', confirm: true, run: async () => {
        const entry = selectedEntry();
        if (!entry || entry.kind !== 'file' || !acceptsMedia(entry, options.accept)) throw new Error('MEDIA_EXPLORER_SELECTION_INVALID');
        await perform(() => choose(entry), true);
      } }] : [])
    ]
  });
  return { element: root, load, getCurrentPath: () => currentPath };
}
