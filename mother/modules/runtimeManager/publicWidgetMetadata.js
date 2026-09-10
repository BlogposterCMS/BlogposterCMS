'use strict';

/** Published widget metadata includes translated menus and declarative UI trees.
 * Bound the complete projection instead of silently erasing nested conditions. */
function publicJsonValue(value) {
  let remaining = 16384, characters = 262144;
  function visit(item, depth) {
    if (--remaining < 0 || depth > 32) throw Object.assign(new Error('PUBLIC_WIDGET_METADATA_LIMIT'), { code: 'PUBLIC_WIDGET_METADATA_LIMIT' });
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') return Number.isFinite(item) ? item : undefined;
    if (typeof item === 'string') {
      characters -= item.length;
      if (characters < 0) throw Object.assign(new Error('PUBLIC_WIDGET_METADATA_LIMIT'), { code: 'PUBLIC_WIDGET_METADATA_LIMIT' });
      return item;
    }
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1)).filter(child => child !== undefined);
    if (item && typeof item === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(item)) {
        if (!key.trim() || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        characters -= key.length;
        if (characters < 0) throw Object.assign(new Error('PUBLIC_WIDGET_METADATA_LIMIT'), { code: 'PUBLIC_WIDGET_METADATA_LIMIT' });
        const projected = visit(child, depth + 1);
        if (projected !== undefined) out[key] = projected;
      }
      return out;
    }
    return undefined;
  }
  return visit(value, 0);
}

module.exports = { publicJsonValue };
