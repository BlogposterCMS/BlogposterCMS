/** Public editorial labels stored in the owning page/content metadata.
 * Shared by the editor and authoritative writes; tags never grant permissions. */
export function normalizeContentTags(value) {
    if (value === undefined || value === null || value === '')
        return [];
    const items = typeof value === 'string' ? value.split(/[,，\n]/u) : value;
    if (!Array.isArray(items) || items.length > 24)
        return invalidTags();
    const tags = [];
    for (const item of items) {
        if (typeof item !== 'string' || /[\u0000-\u001f\u007f]/u.test(item))
            return invalidTags();
        const tag = item.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
        if (!tag)
            continue;
        if (tag.length > 64 || !/^[\p{L}\p{N}][\p{L}\p{N} ._:-]*$/u.test(tag))
            return invalidTags();
        if (!tags.includes(tag))
            tags.push(tag);
    }
    return tags;
}
function invalidTags() {
    const error = new Error('CONTENT_TAGS_INVALID: Use up to 24 tags of 64 characters, separated by commas.');
    Object.assign(error, { code: 'CONTENT_TAGS_INVALID', statusCode: 400 });
    throw error;
}
/** Omitted tags preserve the established metadata shape and legacy records. */
export function normalizeTaggedMeta(meta) {
    // Older page transports also accept JSON text. Validate those labels without
    // changing that transport's metadata representation.
    if (typeof meta === 'string') {
        let parsed;
        try {
            parsed = JSON.parse(meta);
        }
        catch {
            return meta;
        }
        return JSON.stringify(normalizeTaggedMeta(parsed));
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !Object.hasOwn(meta, 'tags'))
        return meta;
    return { ...meta, tags: normalizeContentTags(meta.tags) };
}
