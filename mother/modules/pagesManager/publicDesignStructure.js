'use strict';

const { describeLayoutTree } = require('../../../ui/shared/layout/layoutTreePresentation.js');
const { normalizeResponsivePlacementContract } = require('../../../ui/shared/layout/responsivePlacement.js');

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const styleText = style => Object.entries(style).filter(([, value]) => value !== '').map(([key, value]) => `${key}:${value}`).join(';');
const attributesText = attributes => Object.entries(attributes).map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
const idFromRef = ref => /^layout:([A-Za-z0-9_.:-]+)(?:@[^/\s]+)?$/.exec(ref || '')?.[1];

/** Resolve only published design structure through the existing facade, once per id. */
async function resolvePublicDesigns(requestPublic, root, contentLayoutRef, language) {
  const snapshots = Object.create(null);
  const pending = new Map();
  const rootId = idFromRef(root?.layoutRef);
  if (rootId) snapshots[rootId] = root;
  let remaining = 64;
  const read = id => {
    if (Object.hasOwn(snapshots, id)) return Promise.resolve(snapshots[id]);
    if (pending.has(id)) return pending.get(id);
    // Excessive/cyclic references must not discard an otherwise readable page.
    if (--remaining < 0) {
      snapshots[id] = null;
      console.warn('[PublicPresentation] PUBLIC_STRUCTURE_REFERENCE_LIMIT');
      return Promise.resolve(null);
    }
    const result = requestPublic('designer', 'getLayout', { layoutRef: `layout:${id}@v1`, ...(language ? { language } : {}) })
      .catch(() => null).then(layout => { snapshots[id] = layout; return layout; });
    pending.set(id, result);
    return result;
  };
  const visit = async (layout, ancestors = []) => {
    if (!layout?.document?.layoutTree) return;
    if (ancestors.length >= 16) return;
    const refs = new Set();
    const collect = node => {
      if (node?.designRef) refs.add(String(node.designRef));
      for (const child of node?.children || []) collect(child);
    };
    collect(layout.document.layoutTree);
    await Promise.all([...refs].filter(id => !ancestors.includes(id)).map(async id => visit(await read(id), [...ancestors, id])));
  };
  const contentId = idFromRef(contentLayoutRef);
  await Promise.all([visit(root, [idFromRef(root?.layoutRef)].filter(Boolean)),
    contentId ? read(contentId).then(layout => visit(layout, [contentId])) : undefined]);
  return snapshots;
}

function widgetMetadata(item) {
  try { return typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata || item.code?.meta || {}; }
  catch { return {}; }
}

/** Static rectangles reserve existing authored geometry; no widget code runs on the server. */
function itemGeometry(item, parentMode) {
  const meta = widgetMetadata(item);
  const responsive = item.responsivePlacement || meta.responsivePlacement;
  const numeric = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const style = { position: 'absolute', left: item.xPercent != null ? `${numeric(item.xPercent, 0)}%` : `${numeric(item.x, 0)}px`,
    top: item.yPercent != null ? `${numeric(item.yPercent, 0)}%` : `${numeric(item.y, 0)}px`,
    width: item.wPercent != null ? `${numeric(item.wPercent, 100)}%` : item.w != null ? `${numeric(item.w, 480)}px` : '100%',
    height: item.hPercent != null ? `${numeric(item.hPercent, 0)}%` : item.h != null ? `${numeric(item.h, 40)}px` : 'auto' };
  if (responsive) {
    const { base } = normalizeResponsivePlacementContract(responsive);
    Object.assign(style, { left: `min(max(0px,calc(${base.centerXPercent}% - ${base.widthPx / 2}px)),max(calc(100% - ${base.widthPx}px),calc((100% - ${base.widthPx}px)/2)))`,
      top: `${base.yPx}px`, width: `${base.widthPx}px`, height: `${base.heightPx}px` });
  }
  if (parentMode !== 'free') Object.assign(style, { position: 'relative', left: 'auto', top: 'auto', width: 'auto', 'max-width': '100%' });
  return style;
}

/** Serialize the same container presentation used by Studio/runtime, without changing saved rows. */
function renderPublicDesignStructure(layout, snapshots, { article = '', contentLayoutRef } = {}) {
  let inserted = false;
  const contentId = idFromRef(contentLayoutRef);
  const render = (currentLayout, ancestry, acceptsArticle, nestedContentId) => {
    const root = describeLayoutTree(currentLayout?.document?.layoutTree);
    if (!root) return '';
    const flat = [];
    const collect = (node, parents = []) => { flat.push({ node, parents }); node.children.forEach(child => collect(child, [...parents, node])); };
    collect(root);
    const hosts = flat.filter(({ node }) => node !== root || node.node.section || node.node.type === 'leaf');
    const fallback = hosts.find(({ node }) => node.node.workarea) || hosts.find(({ node }) => node.node.section) || hosts[0];
    for (const { node, parents } of flat.filter(({ node }) => node.node.isDynamicHost)) {
      for (const item of [node, ...parents.toReversed()]) {
        if (item !== node && item.attributes['data-layout-mode'] === 'free') break;
        item.attributes['data-page-content-flow'] = 'true';
      }
    }
    const walk = (node, parent) => {
      const attributes = { ...node.attributes };
      const style = { ...node.style };
      if (hosts.some(entry => entry.node === node)) attributes.class += ' canvas-grid';
      if (parent && parent !== root) {
        attributes.class += ' canvas-item runtime-layout-grid-item';
        Object.assign(style, itemGeometry(node.node.placement || {}, parent.attributes['data-layout-mode']));
      }
      // Conditional/overlay containers start in the same closed state as the client controller.
      const interaction = node.settings.interaction;
      if (interaction && (interaction.presentation !== 'normal' || interaction.when)) attributes.hidden = '';
      let children = node.children.map(child => walk(child, node)).join('');
      const reference = node.node.type === 'leaf' && node.node.designRef;
      if (reference && !ancestry.includes(reference) && ancestry.length < 16) {
        children += render(snapshots[reference], [...ancestry, reference], false);
      }
      if (node.node.isDynamicHost && acceptsArticle && !inserted) {
        if (nestedContentId && !ancestry.includes(nestedContentId)) {
          children += `<div class="runtime-page-design">${render(snapshots[nestedContentId], [...ancestry, nestedContentId], true)}</div>`;
        } else if (!nestedContentId && article) { children += article; inserted = true; }
      }
      for (const item of currentLayout.items || []) {
        const meta = widgetMetadata(item);
        const owner = String(item.workareaId ?? item.workarea_id ?? meta.workareaId ?? meta.workarea_id ?? item.sceneId ?? meta.sceneId ?? '').trim();
        if (owner ? owner !== node.node.nodeId : fallback?.node !== node) continue;
        children += `<div${attributesText({ class: 'canvas-item', 'data-bp-initial-widget': String(item.instanceId || item.instance_id || item.id || ''),
          'data-widget-id': String(item.widgetId || item.widget_id || ''), 'aria-busy': 'true', style: styleText(itemGeometry(item, attributes['data-layout-mode'])) })}></div>`;
      }
      return `<div${attributesText({ ...attributes, style: styleText(style) })}>${children}</div>`;
    };
    return `<div class="runtime-design-document" data-bp-layout-document="1">${walk(root)}</div>`;
  };
  const body = render(layout, [idFromRef(layout?.layoutRef)].filter(Boolean), true, contentId);
  return { body, articleInserted: inserted };
}

module.exports = { resolvePublicDesigns, renderPublicDesignStructure };
