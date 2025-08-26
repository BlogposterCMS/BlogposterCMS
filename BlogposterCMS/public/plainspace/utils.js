let designerAppNameCache = null;
export async function getDesignerAppName() {
  if (designerAppNameCache !== null) return designerAppNameCache;
  try {
    const res = await window.meltdownEmit('listBuilderApps', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'appLoader',
      moduleType: 'core'
    });
    const first = Array.isArray(res?.apps) && res.apps[0] ? res.apps[0].name : '';
    designerAppNameCache = first ? String(first).replace(/[^a-z0-9_-]/gi, '') : '';
  } catch (err) {
    console.warn('[Designer] failed to resolve designer app', err);
    designerAppNameCache = '';
  }
  return designerAppNameCache;
}
