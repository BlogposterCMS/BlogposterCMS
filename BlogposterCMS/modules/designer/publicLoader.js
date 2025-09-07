function preloadLink(href, rel = 'stylesheet') {
  const l = document.createElement('link');
  l.rel = rel;
  l.href = href;
  document.head.appendChild(l);
  return l;
}

async function loadDesign(descriptor = {}, ctx) {
  const { css = [], layoutRef } = descriptor;
  css.forEach(href => preloadLink(href, 'stylesheet'));

  const layout = await ctx.meltdownEmit('designer.getLayout', {
    jwt: ctx.publicToken,
    moduleName: 'designer',
    moduleType: 'community',
    layoutRef
  }).catch(() => null);

  window.__BP_ACTIVE_LAYOUT__ = layout || { grid: { columns: 12, cellHeight: 8 }, items: [], layoutRef };
}

export function registerLoaders(register) {
  register('design', loadDesign);
}

export { loadDesign };
