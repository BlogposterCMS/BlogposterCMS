import { mediaItemPath } from './mediaLibraryData.js';
export function mediaEntries(listing, path) {
    const details = new Map(listing.details?.map(item => [item.name, item]));
    return ['folder', 'file'].flatMap(kind => (kind === 'folder' ? listing.folders : listing.files).map(name => ({
        kind, name, path: mediaItemPath(path, name),
        size: details.get(name)?.size ?? null,
        modifiedAt: details.get(name)?.modifiedAt || '',
        ...(typeof details.get(name)?.url === 'string' ? { url: details.get(name).url } : {})
    })));
}
export function mediaType(entry) {
    if (entry.kind === 'folder')
        return 'Folder';
    const extension = entry.name.includes('.') ? entry.name.split('.').pop().toLowerCase() : '';
    if (/^(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(extension))
        return 'Image';
    if (/^(mp4|webm|mov)$/.test(extension))
        return 'Video';
    if (/^(mp3|wav|ogg|m4a)$/.test(extension))
        return 'Audio';
    return extension ? `${extension.toUpperCase()} file` : 'File';
}
export function visibleMediaEntries(entries, query, key, descending) {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter(entry => entry.name.toLocaleLowerCase().includes(needle)).sort((a, b) => {
        if (a.kind !== b.kind)
            return a.kind === 'folder' ? -1 : 1;
        const order = key === 'size' ? (a.size ?? -1) - (b.size ?? -1)
            : key === 'modified' ? (Date.parse(a.modifiedAt) || 0) - (Date.parse(b.modifiedAt) || 0)
                : key === 'type' ? mediaType(a).localeCompare(mediaType(b))
                    : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        return (descending ? -1 : 1) * (order || a.name.localeCompare(b.name, undefined, { numeric: true }));
    });
}
export function mediaSize(size) {
    if (size === null)
        return '—';
    if (size < 1024)
        return `${size} B`;
    const unit = size < 1024 ** 2 ? 'KB' : size < 1024 ** 3 ? 'MB' : 'GB';
    const divisor = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size / divisor)} ${unit}`;
}
export function mediaDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
export function publicMediaUrl(entry) {
    // An explicit empty remote URL must never fall back to a similarly named local file.
    if (entry.kind === 'file' && entry.url !== undefined) {
        try {
            const url = new URL(entry.url);
            return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
        }
        catch {
            return '';
        }
    }
    // Preview only the existing public static route. Browsing must never create
    // share links or make a private file public as a side effect.
    if (entry.kind !== 'file' || !entry.path.startsWith('public/'))
        return '';
    const parts = entry.path.slice('public/'.length).split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[\\\u0000]/.test(part)))
        return '';
    return `/media/${parts.map(encodeURIComponent).join('/')}`;
}
export function isMediaImage(entry) {
    return /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(entry.name);
}
export function acceptsMedia(entry, accept = '') {
    if (!accept || entry.kind === 'folder')
        return true;
    const name = entry.name.toLowerCase();
    return accept.split(',').some(value => {
        const rule = value.trim().toLowerCase();
        if (rule.startsWith('.'))
            return name.endsWith(rule);
        const type = mediaType(entry).toLowerCase();
        if (rule === 'image/*' || rule === 'video/*' || rule === 'audio/*')
            return rule.startsWith(type);
        const extensions = {
            'image/jpeg': ['jpg', 'jpeg'], 'image/svg+xml': ['svg'], 'image/png': ['png'],
            'image/webp': ['webp'], 'image/gif': ['gif'], 'application/pdf': ['pdf'],
            'text/html': ['html', 'htm'], 'text/plain': ['txt'], 'video/mp4': ['mp4'], 'audio/mpeg': ['mp3']
        };
        return extensions[rule]?.some(extension => name.endsWith(`.${extension}`)) ?? false;
    });
}
