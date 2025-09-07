import { orchestrate } from '/assets/js/envelope/orchestrator.js';
import * as LR from '/assets/js/envelope/loaderRegistry.js';

async function tryImportLoader(src) {
  if (!src || !/^[-\w]+$/.test(src)) return false;
  const paths = [
    `/modules/${src}/publicLoader.js`,
    `/mother/modules/${src}/publicLoader.js`
  ];
  for (const p of paths) {
    try {
      const mod = await import(p);
      if (typeof mod.registerLoaders === 'function') mod.registerLoaders(LR.register);
      return true;
    } catch (_) {
      // try next path
    }
  }
  console.warn(`No publicLoader found for "${src}" in /modules or /mother/modules`);
  return false;
}

async function ensureToken() {
  if (!window.PUBLIC_TOKEN) {
    window.PUBLIC_TOKEN = await window.meltdownEmit('ensurePublicToken', {
      moduleName: 'auth',
      moduleType: 'core'
    }).catch(() => null);
  }
}

async function loadModuleLoaders(envelope) {
  const mods = [...new Set((envelope?.attachments || [])
    .map(att => att.source)
    .filter(src => typeof src === 'string' && /^[-\w]+$/.test(src))
  )];
  await Promise.all(mods.map(tryImportLoader));
}

async function main() {
  await ensureToken();
  let slug = location.pathname.replace(/^\/+/, '') || '';
  if (!slug) {
    const start = await window.meltdownEmit('getStartPage', {
      jwt: window.PUBLIC_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      language: window.LANG || 'en'
    }).catch(() => null);
    slug = start?.slug || '';
  }
  if (!slug) {
    console.error('No start page configured');
    return;
  }
  const envelope = await window.meltdownEmit('getEnvelope', {
    jwt: window.PUBLIC_TOKEN,
    moduleName: 'pagesManager',
    moduleType: 'core',
    slug,
    language: window.LANG || 'en'
  });
  if (envelope?.meta?.seoTitle) {
    document.title = envelope.meta.seoTitle;
  }
  await loadModuleLoaders(envelope);
  const ctx = {
    meltdownEmit: window.meltdownEmit,
    publicToken: window.PUBLIC_TOKEN,
    env: 'csr'
  };
  await orchestrate(envelope, ctx);
}

main().catch(err => console.error(err));
