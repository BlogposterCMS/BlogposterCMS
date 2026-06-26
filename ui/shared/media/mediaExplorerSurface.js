import { createMediaFolder, createMediaShareLink, deleteMediaItem, errorMessage, listMediaFolder, mediaItemPath, renameMediaItem, uploadMediaFile } from './mediaLibraryData.js';
import { bpDialog } from '../dialogs/bpDialog.js';
const ICON_ROOT = '/assets/icons/';
function icon(name) {
    const img = document.createElement('img');
    img.src = `${ICON_ROOT}${name}.svg`;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    return img;
}
function commandButton(label, iconName, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `media-command ${className}`.trim();
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(icon(iconName));
    return button;
}
function pathParts(path) {
    return path.split('/').filter(Boolean);
}
function fileIcon(name) {
    const lower = name.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower))
        return 'file-image';
    if (/\.(html?|css|js|mjs|json)$/.test(lower))
        return 'file-code-2';
    return 'file';
}
function filterEntries(entries, query) {
    const needle = query.trim().toLowerCase();
    if (!needle)
        return entries;
    return entries.filter(entry => entry.name.toLowerCase().includes(needle));
}
function dialogApi() {
    return window.bpDialog ?? bpDialog;
}
function toEntries(listing, path) {
    return [
        ...listing.folders.map(name => ({ kind: 'folder', name, path: mediaItemPath(path, name) })),
        ...listing.files.map(name => ({ kind: 'file', name, path: mediaItemPath(path, name) }))
    ];
}
export function createMediaExplorerSurface(options = {}) {
    const mode = options.mode || 'manage';
    const enableUpload = options.enableUpload !== false;
    const enableMutations = options.enableMutations ?? mode === 'manage';
    const emit = options.emit ?? window.meltdownEmit;
    const jwt = options.jwt ?? window.ADMIN_TOKEN ?? window.PUBLIC_TOKEN;
    const root = document.createElement('section');
    root.className = `media-explorer media-explorer--${mode}`;
    const toolbar = document.createElement('div');
    toolbar.className = 'media-explorer__toolbar';
    const nav = document.createElement('div');
    nav.className = 'media-explorer__nav';
    const backBtn = commandButton('Back', 'arrow-left');
    const refreshBtn = commandButton('Refresh', 'refresh-cw');
    const crumbs = document.createElement('div');
    crumbs.className = 'media-explorer__crumbs';
    nav.append(backBtn, crumbs, refreshBtn);
    const search = document.createElement('input');
    search.className = 'media-explorer__search';
    search.type = 'search';
    search.placeholder = 'Search media';
    search.autocomplete = 'off';
    const commands = document.createElement('div');
    commands.className = 'media-explorer__commands';
    const gridBtn = commandButton('Grid view', 'grid-3x3');
    const listBtn = commandButton('List view', 'list');
    const uploadBtn = commandButton('Upload file', 'upload');
    const folderBtn = commandButton('New folder', 'folder-plus');
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'file';
    hiddenInput.className = 'media-explorer__file-input';
    hiddenInput.style.display = 'none';
    if (options.accept)
        hiddenInput.accept = options.accept;
    commands.append(gridBtn, listBtn);
    if (enableUpload)
        commands.append(uploadBtn);
    if (enableMutations)
        commands.append(folderBtn);
    commands.append(hiddenInput);
    toolbar.append(nav, search, commands);
    const body = document.createElement('div');
    body.className = 'media-explorer__body';
    const itemsEl = document.createElement('div');
    itemsEl.className = 'media-explorer__items media-explorer__items--grid';
    const statusEl = document.createElement('div');
    statusEl.className = 'media-explorer__status';
    statusEl.setAttribute('role', 'status');
    body.append(itemsEl);
    root.append(toolbar, body, statusEl);
    let currentPath = options.initialPath || '';
    let parentPath = '';
    let listingEntries = [];
    let currentView = 'grid';
    let selectedPath = '';
    function setStatus(message, kind = 'neutral') {
        statusEl.textContent = message;
        statusEl.dataset.kind = kind;
    }
    function setView(view) {
        currentView = view;
        gridBtn.classList.toggle('active', view === 'grid');
        listBtn.classList.toggle('active', view === 'list');
        gridBtn.setAttribute('aria-pressed', String(view === 'grid'));
        listBtn.setAttribute('aria-pressed', String(view === 'list'));
        itemsEl.className = `media-explorer__items media-explorer__items--${view}`;
        renderEntries();
    }
    function renderCrumbs() {
        crumbs.innerHTML = '';
        const rootBtn = document.createElement('button');
        rootBtn.type = 'button';
        rootBtn.textContent = 'Library';
        rootBtn.onclick = () => {
            void load('');
        };
        crumbs.appendChild(rootBtn);
        let cursor = '';
        pathParts(currentPath).forEach(part => {
            cursor = mediaItemPath(cursor, part);
            const separator = document.createElement('span');
            separator.textContent = '/';
            separator.setAttribute('aria-hidden', 'true');
            const crumb = document.createElement('button');
            crumb.type = 'button';
            crumb.textContent = part;
            const targetPath = cursor;
            crumb.onclick = () => {
                void load(targetPath);
            };
            crumbs.append(separator, crumb);
        });
    }
    async function choose(entry) {
        try {
            const share = await createMediaShareLink(emit, jwt, entry.path);
            options.onSelectFile?.({ ...share, name: entry.path });
        }
        catch (err) {
            setStatus(`Error: ${errorMessage(err)}`, 'error');
            await dialogApi().alert(`Error: ${errorMessage(err)}`);
        }
    }
    async function share(entry) {
        try {
            const result = await createMediaShareLink(emit, jwt, entry.path);
            await dialogApi().prompt('Share link', result.shareURL || '');
            setStatus(`Shared ${entry.name}`);
        }
        catch (err) {
            setStatus(`Error: ${errorMessage(err)}`, 'error');
            await dialogApi().alert(`Error: ${errorMessage(err)}`);
        }
    }
    async function rename(entry) {
        const nextName = await dialogApi().prompt('Rename item', entry.name, {
            prompt: { label: 'Name', required: true }
        });
        if (!nextName || nextName === entry.name)
            return;
        try {
            await renameMediaItem(emit, jwt, currentPath, entry.name, nextName);
            setStatus(`Renamed ${entry.name}`);
            await load(currentPath);
        }
        catch (err) {
            setStatus(`Error: ${errorMessage(err)}`, 'error');
            await dialogApi().alert(`Error: ${errorMessage(err)}`);
        }
    }
    async function remove(entry) {
        if (!await dialogApi().confirm(`Delete ${entry.name}?`))
            return;
        try {
            await deleteMediaItem(emit, jwt, currentPath, entry.name);
            setStatus(`Deleted ${entry.name}`);
            await load(currentPath);
        }
        catch (err) {
            setStatus(`Error: ${errorMessage(err)}`, 'error');
            await dialogApi().alert(`Error: ${errorMessage(err)}`);
        }
    }
    function renderEntry(entry) {
        const item = document.createElement('div');
        item.className = `media-item ${entry.kind}`;
        item.dataset.path = entry.path;
        item.classList.toggle('selected', selectedPath === entry.path);
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'media-item__main';
        main.title = entry.name;
        const iconWrap = document.createElement('span');
        iconWrap.className = 'media-icon';
        iconWrap.appendChild(icon(entry.kind === 'folder' ? 'folder' : fileIcon(entry.name)));
        const name = document.createElement('span');
        name.className = 'media-name';
        name.textContent = entry.name;
        main.append(iconWrap, name);
        main.onclick = () => {
            selectedPath = entry.path;
            if (entry.kind === 'folder') {
                void load(entry.path);
                return;
            }
            if (mode === 'picker') {
                void choose(entry);
                return;
            }
            renderEntries();
        };
        const actions = document.createElement('div');
        actions.className = 'media-item__actions';
        const shareBtn = commandButton('Share', 'share-2', 'media-command--inline');
        shareBtn.onclick = ev => {
            ev.stopPropagation();
            void share(entry);
        };
        actions.appendChild(shareBtn);
        if (enableMutations) {
            const renameBtn = commandButton('Rename', 'file-pen-line', 'media-command--inline');
            renameBtn.onclick = ev => {
                ev.stopPropagation();
                void rename(entry);
            };
            const deleteBtn = commandButton('Delete', 'trash-2', 'media-command--inline danger');
            deleteBtn.onclick = ev => {
                ev.stopPropagation();
                void remove(entry);
            };
            actions.append(renameBtn, deleteBtn);
        }
        item.append(main, actions);
        return item;
    }
    function renderEntries() {
        itemsEl.innerHTML = '';
        const visibleEntries = filterEntries(listingEntries, search.value);
        if (!visibleEntries.length) {
            const empty = document.createElement('p');
            empty.className = 'media-explorer__empty';
            empty.textContent = search.value ? 'No matching media.' : 'This folder is empty.';
            itemsEl.appendChild(empty);
        }
        else {
            visibleEntries.forEach(entry => itemsEl.appendChild(renderEntry(entry)));
        }
        const folderCount = listingEntries.filter(entry => entry.kind === 'folder').length;
        const fileCount = listingEntries.length - folderCount;
        setStatus(`${folderCount} folders, ${fileCount} files`);
    }
    async function load(path = '') {
        currentPath = path;
        backBtn.disabled = !currentPath;
        selectedPath = '';
        renderCrumbs();
        itemsEl.innerHTML = '';
        const loading = document.createElement('p');
        loading.className = 'media-explorer__empty';
        loading.textContent = 'Loading media...';
        itemsEl.appendChild(loading);
        try {
            const listing = await listMediaFolder(emit, jwt, path);
            parentPath = listing.parentPath;
            currentPath = listing.currentPath || path;
            listingEntries = toEntries(listing, currentPath);
            backBtn.disabled = !currentPath;
            renderCrumbs();
            renderEntries();
        }
        catch (err) {
            listingEntries = [];
            itemsEl.innerHTML = '';
            const error = document.createElement('p');
            error.className = 'media-explorer__empty error';
            error.textContent = `Error: ${errorMessage(err)}`;
            itemsEl.appendChild(error);
            setStatus(`Error: ${errorMessage(err)}`, 'error');
        }
    }
    backBtn.onclick = () => {
        void load(parentPath);
    };
    refreshBtn.onclick = () => {
        void load(currentPath);
    };
    gridBtn.onclick = () => setView('grid');
    listBtn.onclick = () => setView('list');
    search.oninput = () => renderEntries();
    uploadBtn.onclick = () => hiddenInput.click();
    hiddenInput.onchange = async (event) => {
        const target = event.target;
        const file = target?.files?.[0];
        if (!file)
            return;
        try {
            await uploadMediaFile(options.uploadFetch ?? window.fetchWithTimeout, options.csrfToken ?? window.CSRF_TOKEN, currentPath, file);
            setStatus(`Uploaded ${file.name}`);
            await load(currentPath);
        }
        catch (err) {
            setStatus(`Upload failed: ${errorMessage(err)}`, 'error');
            await dialogApi().alert(`Upload failed: ${errorMessage(err)}`);
        }
        finally {
            hiddenInput.value = '';
        }
    };
    folderBtn.onclick = async () => {
        const name = await dialogApi().prompt('New folder name:', '', {
            prompt: { label: 'Folder name', required: true }
        });
        if (!name)
            return;
        try {
            await createMediaFolder(emit, jwt, currentPath, name);
            setStatus(`Created ${name}`);
            await load(currentPath);
        }
        catch (err) {
            setStatus(`Error: ${errorMessage(err)}`, 'error');
            await dialogApi().alert(`Error: ${errorMessage(err)}`);
        }
    };
    setView(currentView);
    void load(currentPath);
    return {
        element: root,
        load,
        getCurrentPath: () => currentPath
    };
}
