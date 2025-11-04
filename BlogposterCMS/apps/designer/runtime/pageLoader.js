import { renderLayoutTree } from '../renderer/layoutRender.js';
import { executeJs } from '../utils.js';
import { sanitizeHtml } from '../../../public/plainspace/sanitizer.js';

const JS_TRUST_FLAGS = [
  'allowCustomJs',
  'allow_custom_js',
  'trustedAuthor',
  'trusted_author',
  'trusted',
  'trustedJs',
  'trusted_js',
  'jsTrusted',
  'js_trusted'
];

const TRUTHY_FLAG_LITERALS = new Set(['true', '1', 'yes', 'y', 'on']);

const isExplicitlyTruthy = value => {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return TRUTHY_FLAG_LITERALS.has(normalized);
  }
  return false;
};

const getJwt = () => window.ADMIN_TOKEN || window.PUBLIC_TOKEN || null;

export const canExecuteCustomJs = design => {
  if (!design || typeof design !== 'object') return false;
  for (const key of JS_TRUST_FLAGS) {
    if (key in design) return isExplicitlyTruthy(design[key]);
  }
  const meta = design.meta || design.metadata;
  if (meta && typeof meta === 'object') {
    for (const key of JS_TRUST_FLAGS) {
      if (key in meta) return isExplicitlyTruthy(meta[key]);
    }
  }
  return false;
};

const applySanitizedHtml = (target, html) => {
  target.innerHTML = sanitizeHtml(html);
};
const basePayload = extra => ({ jwt: getJwt(), ...extra });

async function safeEmit(event, payload) {
  const jwt = getJwt();
  if (typeof window.meltdownEmit !== 'function' || !jwt) return null;
  try {
    return await window.meltdownEmit(event, payload);
  } catch (err) {
    console.warn('[PageLoader] event failed', event, err);
    return null;
  }
}

async function loadDesign(designId) {
  if (!designId) return null;
  const res = await safeEmit('designer.getDesign', basePayload({
    id: designId,
    moduleName: 'designer',
    moduleType: 'community'
  }));
  return res && res.design ? res.design : res;
}

export async function renderPage(pageId, mountEl) {
  if (!mountEl) return;
  const pageRes = await safeEmit('getPageById', basePayload({
    pageId,
    moduleName: 'pagesManager',
    moduleType: 'core'
  }));
  const page = pageRes?.data || pageRes || {};
  const siteRes = await safeEmit('getSiteMeta', basePayload({
    moduleName: 'plainspace',
    moduleType: 'core'
  }));
  const site = siteRes || {};
  const layoutId = page.layout_id || site.global_layout_id;
  let layoutTree = null;
  if (layoutId) {
    const layoutRes = await safeEmit('getLayoutTemplate', basePayload({
      layoutId,
      moduleName: 'plainspace',
      moduleType: 'core'
    }));
    layoutTree = layoutRes?.layout || layoutRes?.tree || null;
  } else {
    const globalRes = await safeEmit('getGlobalLayoutTemplate', basePayload({
      moduleName: 'plainspace',
      moduleType: 'core'
    }));
    layoutTree = globalRes?.layout || globalRes?.tree || null;
  }
  if (!layoutTree) {
    mountEl.textContent = '';
    return;
  }
  const idMap = renderLayoutTree(layoutTree, mountEl);
  let host = null;
  async function mountLeaves(node) {
    if (node.type === 'split') {
      for (const child of node.children || []) {
        await mountLeaves(child);
      }
      return;
    }
    const el = idMap.get(String(node.nodeId));
    if (!el) return;
    if (node.designRef) {
      const design = await loadDesign(node.designRef);
      if (design && typeof design.html === 'string') {
        applySanitizedHtml(el, design.html);
        if (design.js) {
          if (canExecuteCustomJs(design)) {
            try { executeJs(design.js, el, el); } catch (e) { console.error('[PageLoader] design js error', e); }
          } else {
            console.warn('[PageLoader] blocked custom js for untrusted design', node.designRef);
          }
        }
      }
    }
    if (node.isDynamicHost || node.workarea) host = el;
  }
  await mountLeaves(layoutTree);
  if (!host) {
    let maxArea = 0;
    for (const el of idMap.values()) {
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea) {
        maxArea = area;
        host = el;
      }
    }
  }
  const designId = page.design_id || site.default_design_id;
  if (host && designId && page.auto_mount !== false) {
    const pageDesign = await loadDesign(designId);
    if (pageDesign && typeof pageDesign.html === 'string') {
      applySanitizedHtml(host, pageDesign.html);
      if (pageDesign.js) {
        if (canExecuteCustomJs(pageDesign)) {
          try { executeJs(pageDesign.js, host, host); } catch (e) { console.error('[PageLoader] page design js error', e); }
        } else {
          console.warn('[PageLoader] blocked custom js for untrusted page design', designId);
        }
      }
    }
  }
}
