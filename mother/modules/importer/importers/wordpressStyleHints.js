'use strict';

const MAX_CSS_BYTES = 500000;
const MAX_VALUES = 18;
const COLOR_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|hsla?\([^)]+\)/gi;
const CSS_VAR_PATTERN = /--([a-z0-9_-]+)\s*:\s*([^;{}]+)(?:;|})/gi;
const FONT_FAMILY_PATTERN = /font-family\s*:\s*([^;{}]+)(?:;|})/gi;
const SPACING_PATTERN = /\b(?:margin|padding|gap|row-gap|column-gap)\s*:\s*([^;{}]+)(?:;|})/gi;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSpace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function pushCount(map, value) {
  const clean = normalizeSpace(value);
  if (!clean) return;
  map.set(clean, (map.get(clean) || 0) + 1);
}

function topValues(map, max = MAX_VALUES) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, max)
    .map(([value, count]) => ({ value, count }));
}

function collectMatches(pattern, css, map) {
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(css)) !== null) {
    pushCount(map, match[0]);
  }
}

function collectValueMatches(pattern, css, map) {
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(css)) !== null) {
    pushCount(map, match[1]);
  }
}

function collectCssVariables(css, result) {
  let match;
  CSS_VAR_PATTERN.lastIndex = 0;
  while ((match = CSS_VAR_PATTERN.exec(css)) !== null) {
    const key = normalizeSpace(match[1]).toLowerCase();
    const value = normalizeSpace(match[2]);
    if (!key || !value || Object.keys(result).length >= MAX_VALUES) continue;
    result[key] = value;
  }
}

function inferTokenRoles(cssVariables = {}, colors = []) {
  const roleNames = Object.keys(cssVariables);
  const findVar = parts => {
    const key = roleNames.find(name => parts.every(part => name.includes(part)));
    return key ? cssVariables[key] : '';
  };
  return {
    primary: findVar(['primary']) || findVar(['brand']) || colors[0]?.value || '',
    background: findVar(['background']) || findVar(['surface']) || '',
    text: findVar(['text']) || findVar(['foreground']) || ''
  };
}

async function readCss(reader, stylePath) {
  if (!reader || !stylePath || !await reader.has(stylePath)) return '';
  const css = await reader.readText(stylePath);
  return String(css || '').slice(0, MAX_CSS_BYTES);
}

async function extractStyleHints(reader, plan = {}) {
  const stylePaths = [
    ...asArray(plan.theme?.styles),
    ...asArray(plan.pages).flatMap(page => asArray(page.styles))
  ].filter((item, index, all) => typeof item === 'string' && item && all.indexOf(item) === index);

  const colors = new Map();
  const fonts = new Map();
  const spacings = new Map();
  const cssVariables = {};
  const scanned = [];
  const warnings = [];

  for (const stylePath of stylePaths) {
    try {
      const css = await readCss(reader, stylePath);
      if (!css) continue;
      scanned.push(stylePath);
      collectMatches(COLOR_PATTERN, css, colors);
      collectValueMatches(FONT_FAMILY_PATTERN, css, fonts);
      collectValueMatches(SPACING_PATTERN, css, spacings);
      collectCssVariables(css, cssVariables);
    } catch (err) {
      warnings.push(`STYLE_HINT_READ_FAILED: ${stylePath} - ${err.message}`);
    }
  }

  const colorValues = topValues(colors);
  return {
    source: 'wordpress-style-hints',
    scannedStyles: scanned,
    tokens: {
      cssVariables,
      colors: colorValues,
      fonts: topValues(fonts, 10),
      spacing: topValues(spacings, 10),
      roles: inferTokenRoles(cssVariables, colorValues)
    },
    warnings
  };
}

module.exports = {
  _internals: {
    inferTokenRoles,
    topValues
  },
  extractStyleHints
};
