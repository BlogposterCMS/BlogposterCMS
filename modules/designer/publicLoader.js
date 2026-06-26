function preloadLink(href, rel = 'stylesheet') {
  const l = document.createElement('link');
  l.rel = rel;
  l.href = href;
  document.head.appendChild(l);
  return l;
}

function fallbackLayout(layoutRef) {
  return {
    grid: { columns: 12, cellHeight: 8 },
    items: [],
    layoutRef
  };
}

async function loadDesign(descriptor = {}, ctx) {
  const { css = [], layoutRef } = descriptor;
  css.forEach(href => preloadLink(href, 'stylesheet'));

  const layout = await ctx.meltdownEmit('designer.getLayout', {
    jwt: ctx.publicToken,
    moduleName: 'designer',
    moduleType: 'core',
    lane: 'public',
    layoutRef
  }).catch(error => {
    console.warn('[DesignerPublicLoader:LAYOUT_LOAD_FAILED] Falling back to an empty layout.', error);
    return null;
  });

  const activeLayout = layout || fallbackLayout(layoutRef);
  if (ctx && typeof ctx === 'object') {
    ctx.activeLayout = activeLayout;
    ctx.activeLayoutRef = layoutRef;
  }
  window.__BP_ACTIVE_LAYOUT__ = activeLayout;
  return activeLayout;
}

export function registerLoaders(register) {
  register('design', loadDesign);
}

export { loadDesign };
