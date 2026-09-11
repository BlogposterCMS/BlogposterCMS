export type JsonDelta = { value?: unknown; fields?: Record<string, JsonDelta>; removed?: string[]; keyed?: { key: string; items: Record<string, JsonDelta>; removed: string[]; order?: string[] } };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const allowedKey = (key: string) => !['__proto__', 'prototype', 'constructor'].includes(key);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));

/** Diff by persistent item id, including responsive rule ids, rather than copying every viewport. */
export function jsonDelta(base: unknown, value: unknown): JsonDelta | undefined {
  if (equal(base, value)) return undefined;
  if (record(base) && record(value)) {
    const fields: Record<string, JsonDelta> = {};
    for (const key of Object.keys(value).filter(allowedKey)) { const change = jsonDelta(base[key], value[key]); if (change) fields[key] = change; }
    const removed = Object.keys(base).filter(key => allowedKey(key) && !Object.hasOwn(value, key));
    return { fields, ...(removed.length ? { removed } : {}) };
  }
  if (Array.isArray(base) && Array.isArray(value)) {
    const key = ['nodeId', 'id'].find(candidate => [...base, ...value].length && [...base, ...value].every(item => record(item) && typeof item[candidate] === 'string' && allowedKey(item[candidate] as string)));
    if (key && new Set(base.map(item => item[key])).size === base.length && new Set(value.map(item => item[key])).size === value.length) {
      const before = new Map(base.map(item => [item[key], item]));
      const items: Record<string, JsonDelta> = {};
      for (const item of value) { const change = jsonDelta(before.get(item[key]), item); if (change) items[item[key]] = change; }
      const removed = base.filter(item => !value.some(next => next[key] === item[key])).map(item => item[key]);
      const order = value.map(item => item[key]);
      return { keyed: { key, items, removed, ...(!equal(base.map(item => item[key]), order) ? { order } : {}) } };
    }
  }
  return { value: clone(value) };
}

/** Apply only the locale delta; source fields and viewport rules added later continue to inherit. */
export function applyJsonDelta(base: unknown, delta?: JsonDelta): any {
  if (!delta) return clone(base);
  if (Object.hasOwn(delta, 'value')) return clone(delta.value);
  if (delta.keyed) {
    const { key, items, removed, order } = delta.keyed;
    const result = (Array.isArray(base) ? base : []).filter(item => !removed.includes(String(item?.[key])))
      .map(item => applyJsonDelta(item, items[item[key]]));
    // A locale-owned addition has a complete value. A partial override whose
    // source item was removed must not create a malformed orphan container.
    for (const [id, change] of Object.entries(items)) if (Object.hasOwn(change, 'value') && !result.some(item => item?.[key] === id)) result.push(applyJsonDelta(undefined, change));
    if (order) result.sort((a, b) => (order.includes(a?.[key]) ? order.indexOf(a[key]) : order.length) - (order.includes(b?.[key]) ? order.indexOf(b[key]) : order.length));
    return result.filter(Boolean);
  }
  const result = record(base) ? clone(base) : {};
  for (const key of delta.removed || []) if (allowedKey(key)) delete result[key];
  for (const [key, change] of Object.entries(delta.fields || {})) if (allowedKey(key)) result[key] = applyJsonDelta(result[key], change);
  return result;
}

/** Bound untrusted saved override documents before recursive application. */
export function validateJsonDelta(delta: unknown, depth = 0, budget = { count: 0 }): asserts delta is JsonDelta {
  if (!record(delta) || depth > 40 || ++budget.count > 20000) throw new Error('DESIGN_LOCALE_DELTA_INVALID');
  if (Object.keys(delta).some(key => !['value', 'fields', 'removed', 'keyed'].includes(key))) throw new Error('DESIGN_LOCALE_DELTA_INVALID');
  const keys = (value: unknown) => Array.isArray(value) && value.every(key => typeof key === 'string' && allowedKey(key) && key.length <= 160);
  if (delta.removed !== undefined && !keys(delta.removed)) throw new Error('DESIGN_LOCALE_DELTA_INVALID');
  if (delta.fields !== undefined) {
    if (!record(delta.fields)) throw new Error('DESIGN_LOCALE_DELTA_INVALID');
    for (const [key, value] of Object.entries(delta.fields)) { if (!allowedKey(key)) throw new Error('DESIGN_LOCALE_DELTA_INVALID'); validateJsonDelta(value, depth + 1, budget); }
  }
  if (delta.keyed !== undefined) {
    const keyed = delta.keyed;
    if (!record(keyed) || !['nodeId', 'id'].includes(String(keyed.key)) || !record(keyed.items) || !keys(keyed.removed) || (keyed.order !== undefined && !keys(keyed.order))) throw new Error('DESIGN_LOCALE_DELTA_INVALID');
    for (const [key, value] of Object.entries(keyed.items)) { if (!allowedKey(key)) throw new Error('DESIGN_LOCALE_DELTA_INVALID'); validateJsonDelta(value, depth + 1, budget); }
  }
}
