'use strict';

const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');
const { buildHtmlStructure } = require('./htmlStructureMapper');

const FORMAT = 'blogposter-html-capture';
const MAX_ELEMENTS = 1500;
// Captures carry computed declarations, never an executable stylesheet or script.
const CSS_PROPERTIES = new Set(('color background-color background-image background-size background-position background-repeat '
  + 'border-top border-right border-bottom border-left border-radius box-shadow font-family font-size font-weight font-style '
  + 'line-height letter-spacing text-align text-transform text-decoration white-space word-break overflow-wrap padding-top '
  + 'padding-right padding-bottom padding-left object-fit object-position display align-items justify-content gap flex-direction '
  + 'opacity margin width height box-sizing').split(' '));

function fail(code, message) { throw new Error(`[${code}] ${message}`); }
function finite(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('HTML_IMPORT_GEOMETRY_INVALID', label);
  return value;
}

/** Reject escape/comment tricks before accepting a computed declaration. No backend URL fetch occurs. */
function safeDeclarations(styles) {
  return Object.entries(styles || {}).filter(([key, value]) => CSS_PROPERTIES.has(key)
    && typeof value === 'string' && value.length <= 2000 && !/[{};<>\\@\u0000-\u001f]/.test(value)
    && !/expression|\/\*|(?:javascript|data|vbscript|file|blob):/i.test(value))
    .map(([key, value]) => `${key}:${value}`).join(';');
}

function sanitizeFragment(html, selector) {
  let ordinal = 0;
  const rules = [];
  const clean = sanitizeHtml(String(html || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'button']),
    allowedAttributes: { '*': ['class', 'data-text-editable'], a: ['href', 'class', 'data-text-editable'], img: ['src', 'alt', 'class'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'], allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, attributes) => {
        const nodeClass = `bp-import-node-${++ordinal}`;
        const declarations = {};
        // sanitize-html performs the HTML parsing; style input is restricted to computed declarations below.
        for (const part of String(attributes.style || '').split(';')) {
          const separator = part.indexOf(':');
          if (separator > 0) declarations[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
        }
        const css = safeDeclarations(declarations);
        if (css) rules.push(`${selector} .${nodeClass}{${css}}`);
        return { tagName, attribs: { ...attributes, class: `${nodeClass}${ordinal === 1 && tagName !== 'img' ? ' editable' : ''}` } };
      }
    }
  });
  return { html: clean, css: rules.join('\n') };
}

function validateCapture(input) {
  if (JSON.stringify(input || null).length > 8 * 1024 * 1024) fail('HTML_IMPORT_LIMIT_EXCEEDED', 'Capture exceeds 8 MB.');
  if (!input || input.format !== FORMAT || input.version !== 1 || !Array.isArray(input.snapshots)
    || !input.snapshots.length || input.snapshots.length > 8) fail('HTML_IMPORT_CAPTURE_INVALID', 'Expected a version 1 HTML capture with 1–8 viewports.');
  const snapshots = [...input.snapshots].sort((a, b) => a.viewport?.width - b.viewport?.width);
  const widths = new Set();
  for (const snapshot of snapshots) {
    const width = finite(snapshot.viewport?.width, 320, 3840, 'Viewport width must be 320–3840.');
    if (widths.has(width)) fail('HTML_IMPORT_CAPTURE_INVALID', 'Viewport widths must be unique.');
    widths.add(width);
    finite(snapshot.pageHeight, 1, 200000, 'Invalid document height.');
    if (!Array.isArray(snapshot.elements) || snapshot.elements.length > MAX_ELEMENTS) fail('HTML_IMPORT_LIMIT_EXCEEDED', 'Capture exceeds 1500 elements; split the source page.');
    const ids = new Set();
    for (const el of snapshot.elements) {
      if (typeof el.id !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(el.id) || ids.has(el.id)) fail('HTML_IMPORT_CAPTURE_INVALID', 'Element IDs must be unique and stable.');
      ids.add(el.id);
      if (!['text', 'image', 'button', 'decoration', 'unsupported'].includes(el.kind)) fail('HTML_IMPORT_CAPTURE_INVALID', 'Unknown element kind.');
      if (String(el.html || '').length > 250000) fail('HTML_IMPORT_LIMIT_EXCEEDED', 'Element HTML exceeds 250 KB.');
      finite(el.rect?.x, -200000, 200000, 'Invalid x coordinate.');
      finite(el.rect?.y, 0, 200000, 'Invalid y coordinate.');
      finite(el.rect?.w, 0.01, 200000, 'Invalid width.');
      finite(el.rect?.h, 0.01, 200000, 'Invalid height.');
    }
  }
  return snapshots;
}

function geometry(el, width) {
  return { centerXPercent: (el.rect.x + el.rect.w / 2) / width * 100,
    yPx: el.rect.y, widthPx: el.rect.w, heightPx: el.rect.h, minWidthPx: 1, minHeightPx: 1 };
}

/** Map measured HTML onto the existing LayoutTree, inline widgets and responsive placement contract. */
function buildHtmlDesignerDraft(input) {
  const snapshots = validateCapture(input);
  const sourceHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 12);
  const rootId = `html-import-${sourceHash}`;
  const containerName = `bp-import-${sourceHash}`;
  const base = snapshots[snapshots.length - 1];
  const ranges = snapshots.map((s, i) => ({ minWidth: i ? Math.floor((snapshots[i - 1].viewport.width + s.viewport.width) / 2) + 1 : 320,
    maxWidth: i < snapshots.length - 1 ? Math.floor((s.viewport.width + snapshots[i + 1].viewport.width) / 2) : 3840 }));
  const structure = buildHtmlStructure(snapshots, rootId, ranges);
  const nodes = new Map();
  snapshots.forEach((s, index) => s.elements.forEach(el => {
    if (!nodes.has(el.id)) nodes.set(el.id, new Map());
    nodes.get(el.id).set(index, el);
  }));
  if (nodes.size > MAX_ELEMENTS) fail('HTML_IMPORT_LIMIT_EXCEEDED', 'Combined capture exceeds 1500 elements.');
  const warnings = snapshots.flatMap(s => (s.warnings || []).map(w => ({ code: String(w.code || 'HTML_IMPORT_REVIEW'), nodeId: String(w.nodeId || ''), viewport: s.viewport.width })));
  warnings.push({ code: 'HTML_IMPORT_VIEWPORTS_SAMPLED', message: 'Only captured widths are measured. Intermediate widths and interactions require review.' });
  warnings.push({ code: 'HTML_IMPORT_SOURCE_ASSETS_REFERENCED', message: 'Images and backgrounds reference the source. Use Media Manager assets before removing the source.' });
  const widgets = [];
  const paintOrder = [...nodes.keys()].sort((left, right) => {
    const a = [...nodes.get(left).values()].at(-1), b = [...nodes.get(right).values()].at(-1);
    return (Number(a.stackingOrder) || 0) - (Number(b.stackingOrder) || 0)
      || Number(left.match(/\d+/)?.[0] || 0) - Number(right.match(/\d+/)?.[0] || 0);
  });
  for (const [sourceId, variants] of nodes) {
    const latest = variants.get(snapshots.length - 1) || [...variants.values()][0];
    if (latest.kind === 'unsupported') continue;
    const id = `${rootId}-${sourceId}`;
    const workareaId = structure ? structure.parentId(latest) : rootId;
    const sceneId = structure ? structure.sceneId(latest) : rootId;
    const sceneTitle = structure ? structure.title(latest) : 'Imported page';
    const elementGeometry = (element, index) => {
      const relative = structure ? structure.relativeElement(element, index) : element;
      return geometry(relative, relative.parentWidth || snapshots[index].viewport.width);
    };
    const selector = `[data-instance-id="${id}"]`;
    const fragments = new Map();
    variants.forEach((el, i) => {
      const fragment = el.kind === 'decoration'
        ? `<div style="${safeDeclarations({ ...el.css, margin: '0', width: '100%', height: '100%', 'box-sizing': 'border-box' })}"></div>` : el.html;
      fragments.set(i, sanitizeFragment(fragment, selector));
    });
    const baseIndex = variants.has(snapshots.length - 1) ? snapshots.length - 1 : [...variants.keys()][0];
    const baseFragment = fragments.get(baseIndex);
    if (!baseFragment.html.trim()) { warnings.push({ code: 'HTML_IMPORT_EMPTY_AFTER_SANITIZE', nodeId: sourceId }); continue; }
    let css = `${selector}{visibility:visible}\n${baseFragment.css}`;
    snapshots.forEach((snapshot, i) => {
      const range = ranges[i], fragment = fragments.get(i);
      css += `\n@container ${containerName} (min-width:${range.minWidth}px) and (max-width:${range.maxWidth}px){${fragment ? fragment.css : `${selector}{visibility:hidden;pointer-events:none}`}}`;
      if (fragment && fragment.html !== baseFragment.html) warnings.push({ code: 'HTML_IMPORT_CONTENT_VARIANT_REVIEW', nodeId: sourceId, viewport: snapshot.viewport.width });
    });
    // A named container follows the authored canvas width, including Designer Fit zoom and mobile preview.
    if (!widgets.length) css += `\n[data-node-id="${rootId}"]{container-type:inline-size;container-name:${containerName};background:${base.background === 'transparent' ? 'transparent' : safeDeclarations({ color: base.background }).slice(6) || 'transparent'}}`;
    const responsivePlacement = { version: 1, base: elementGeometry(latest, baseIndex),
      rules: snapshots.flatMap((s, i) => variants.has(i) ? [{ id: `capture-${s.viewport.width}`, ...ranges[i], geometry: elementGeometry(variants.get(i), i) }] : []) };
    const kind = latest.kind;
    widgets.push({ id, widgetId: kind === 'text' ? 'textBox' : kind === 'image' ? 'mediaBlock' : kind === 'button' ? 'buttonLink' : 'htmlBlock',
      xPercent: latest.rect.x / base.viewport.width * 100, yPercent: latest.rect.y / base.pageHeight * 100,
      wPercent: latest.rect.w / base.viewport.width * 100, hPercent: latest.rect.h / base.pageHeight * 100,
      zIndex: structure ? structure.stackOrder(sourceId) : paintOrder.indexOf(sourceId) + 1,
      workareaId, sceneId, sceneTitle, behavior: 'scroll', elementName: latest.label,
      code: { html: baseFragment.html, css, meta: { workareaId, sceneId, sceneTitle, behavior: 'scroll',
        elementName: String(latest.label || kind), responsivePlacement,
        htmlImport: { version: 1, sourceId, kind, capturedWidths: [...variants.keys()].map(i => snapshots[i].viewport.width),
          // Any surviving object can restore the measured canvas after another object is deleted.
          parentId: workareaId, sectionId: sceneId,
          page: structure ? structure.page(latest) : { rootId, initialMinHeight: '320px', frames: snapshots.map((s, i) => ({ ...ranges[i], height: s.pageHeight })) },
          warnings: warnings.filter(w => w.nodeId === sourceId).map(w => w.code) } } } });
  }
  if (!widgets.length) fail('HTML_IMPORT_EMPTY', 'No supported editable elements remained.');
  return { version: 1, source: 'html-visual-mapper', title: String(input.title || base.title || 'Imported HTML page').slice(0, 200),
    widgets, layout: structure?.layout || { type: 'split', nodeId: 'page-root', orientation: 'vertical', settings: { mode: 'stack' },
      children: [{ type: 'leaf', nodeId: rootId, workarea: true, isDynamicHost: true,
        section: { id: rootId, title: 'Imported page' }, settings: { mode: 'free', minHeight: '320px', overflow: 'visible' } }] },
    summary: { widgets: widgets.length, sections: structure?.sectionCount || 1, containers: structure?.containerCount || 0, editableWidgets: widgets.filter(w => w.widgetId !== 'htmlBlock').length,
      decorations: widgets.filter(w => w.widgetId === 'htmlBlock').length, capturedWidths: snapshots.map(s => s.viewport.width), warnings },
    sourceUrl: String(base.sourceUrl || '') };
}

module.exports = { FORMAT, buildHtmlDesignerDraft, safeDeclarations, sanitizeFragment };
