'use strict';

// JSON-only analytics domain: no filesystem, process, HTTP or Node dependencies.
const DIMENSIONS = ['kind', 'event', 'module', 'actor', 'page', 'device', 'browser', 'os', 'source', 'outcome'];
function label(value, fallback = 'unknown') {
  return (typeof value === 'string' || typeof value === 'number')
    ? String(value).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120) || fallback : fallback;
}
function normalizeRecord(input, now = Date.now()) {
  if (!input || !['system', 'page'].includes(input.kind)) throw new Error('ANALYTICS_INVALID_KIND');
  const record = { version: 1, at: new Date(now).toISOString() };
  for (const key of DIMENSIONS) record[key] = label(input[key]);
  if (input.kind === 'page') {
    for (const key of ['title', 'path', 'visitor', 'session', 'country', 'region', 'city', 'geoStatus']) record[key] = label(input[key], '');
  }
  record.durationMs = Math.max(0, Math.min(3600000, Number(input.durationMs) || 0));
  return record;
}
function clientDimensions(userAgent = '', referrer = '') {
  const ua = String(userAgent).slice(0, 1024);
  let source = 'direct';
  try { source = new URL(referrer).hostname; } catch { /* Missing/invalid referrer is direct. */ }
  return {
    device: /bot|crawler|spider|headless/i.test(ua) ? 'bot' : /ipad|tablet/i.test(ua) ? 'tablet' : /mobile|iphone|android/i.test(ua) ? 'mobile' : ua ? 'desktop' : 'unknown',
    browser: /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'unknown',
    os: /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown', source
  };
}
function summarize(records, days = 7, now = Date.now()) {
  if (![1, 7, 30].includes(days)) throw new Error('ANALYTICS_INVALID_PERIOD');
  const from = now - days * 86400000;
  const rows = records.filter(row => Date.parse(row.at) >= from && Date.parse(row.at) <= now);
  const previous = records.filter(row => Date.parse(row.at) >= from - days * 86400000 && Date.parse(row.at) < from);
  const count = (items, kind) => items.filter(row => row.kind === kind).length;
  const tables = {};
  for (const key of DIMENSIONS.filter(key => key !== 'kind')) {
    const groups = new Map();
    for (const row of rows) {
      if (['device', 'browser', 'os', 'source', 'page'].includes(key) && row.kind !== 'page') continue;
      if (['module', 'actor', 'event', 'outcome'].includes(key) && row.kind !== 'system') continue;
      groups.set(row[key], (groups.get(row[key]) || 0) + 1);
    }
    tables[key] = [...groups].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 25);
  }
  const timeline = new Map();
  for (const row of rows) {
    const day = row.at.slice(0, 10);
    if (!timeline.has(day)) timeline.set(day, { day, pages: 0, system: 0 });
    timeline.get(day)[row.kind === 'page' ? 'pages' : 'system']++;
  }
  return { version: 1, days, from: new Date(from).toISOString(), to: new Date(now).toISOString(),
    pages: count(rows, 'page'), system: count(rows, 'system'),
    errors: rows.filter(row => row.kind === 'system' && row.outcome === 'error').length,
    previous: { pages: count(previous, 'page'), system: count(previous, 'system') },
    tables, timeline: [...timeline.values()].sort((a, b) => a.day.localeCompare(b.day)),
    // Filter before limiting: a busy emitter must not hide all website visits.
    recentPages: rows.filter(row => row.kind === 'page').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500),
    recent: rows.slice(-50).reverse() };
}
module.exports = { DIMENSIONS, normalizeRecord, clientDimensions, summarize };
