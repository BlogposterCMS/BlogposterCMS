import { renderLayoutTree } from '../renderer/layoutRender.js';
import { executeJs } from '../utils.js';

const JWT = window.ADMIN_TOKEN || window.PUBLIC_TOKEN || null;
const basePayload = extra => ({ jwt: JWT, ...extra });

async function safeEmit(event, payload) {
  if (typeof window.meltdownEmit !== 'function' || !JWT) return null;
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
        el.innerHTML = design.html;
        if (design.js) {
          try { executeJs(design.js, el, el); } catch (e) { console.error('[PageLoader] design js error', e); }
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
      host.innerHTML = pageDesign.html;
      if (pageDesign.js) {
        try { executeJs(pageDesign.js, host, host); } catch (e) { console.error('[PageLoader] page design js error', e); }
      }
    }
  }
}
