"use strict";

const MODULE_NAME = "pagesManager";
const MODULE_TYPE = "core";
const DESIGNER_MODULE_NAME = "designer";
const SETTINGS_MODULE_NAME = "settingsManager";

const COMING_SOON_SEED_KEY = "core.comingSoon";
const COMING_SOON_SEED_VERSION = 3;
const COMING_SOON_SLUG = "coming-soon";
const COMING_SOON_LANGUAGE = "en";
const COMING_SOON_WORKAREA_ID = "coming-soon-workarea";

function canEmit(motherEmitter, eventName) {
  if (!motherEmitter || typeof motherEmitter.emit !== "function") return false;
  if (typeof motherEmitter.listenerCount !== "function") return true;
  return motherEmitter.listenerCount(eventName) > 0;
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    const emitted = motherEmitter.emit(eventName, payload, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    if (!emitted) {
      reject(new Error(`PAGES_COMING_SOON_EVENT_MISSING: ${eventName}`));
    }
  });
}

function parseRecord(value) {
  if (!value || typeof value !== "object" && typeof value !== "string") return {};
  if (typeof value === "object" && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pageIdFromResult(result) {
  return result?.pageId ?? result?.id ?? result?.insertedId ?? null;
}

function pageIdFromRow(page) {
  return page?.id ?? page?._id ?? page?.pageId ?? null;
}

function titleFromPage(page) {
  if (!page || typeof page !== "object") return "";
  return String(page.title || page.trans_title || page.transTitle || "").trim();
}

function isSeedOwned(meta = {}) {
  return meta.seedKey === COMING_SOON_SEED_KEY
    || meta.systemSeed === COMING_SOON_SEED_KEY
    || meta.seedSource === COMING_SOON_SEED_KEY;
}

function seedVersionOf(meta = {}) {
  const version = Number(meta.seedVersion);
  return Number.isFinite(version) ? version : 0;
}

function isRetiredRawComingSoonSeedPage(page = {}) {
  if (!page || typeof page !== "object") return false;
  const title = titleFromPage(page).toLowerCase();
  const html = String(page.html || page.trans_html || "").toLowerCase();
  // Older installs created this exact raw HTML page without seed metadata.
  return String(page.slug || "") === COMING_SOON_SLUG
    && title === "coming soon"
    && (html.includes("site under maintenance") || html.includes("we'll be back shortly"));
}

function baseSeedMeta(extra = {}) {
  return {
    ...extra,
    seedKey: COMING_SOON_SEED_KEY,
    seedVersion: COMING_SOON_SEED_VERSION,
    systemPage: true,
    maintenancePage: true,
    inheritParentDesign: false
  };
}

function comingSoonTranslation() {
  return {
    language: COMING_SOON_LANGUAGE,
    title: "Coming Soon",
    html: [
      '<section style="--studio-canvas:#ffffff;--studio-surface-solid:#ffffff;--studio-surface-muted:#f6f7f8;--studio-text:#1f2933;--studio-text-muted:rgba(31,41,51,.62);--studio-border:rgba(17,24,39,.08);--studio-border-strong:rgba(17,24,39,.14);--studio-radius-panel:18px;--studio-radius-control:999px;--studio-shadow-soft:0 1px 2px rgba(0,0,0,.04),0 14px 36px rgba(17,24,39,.08);min-height:100vh;box-sizing:border-box;display:grid;align-items:center;padding:clamp(24px,5vw,56px);background:var(--studio-canvas);color:var(--studio-text);font-family:HarmonyOS Sans,Noto Sans,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">',
      '<div style="width:min(1120px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:clamp(24px,5vw,64px);align-items:center;">',
      '<div>',
      '<div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:24px;padding:8px 12px;border:1px solid var(--studio-border);border-radius:var(--studio-radius-control);background:var(--studio-surface-solid);box-shadow:var(--studio-shadow-soft);font-size:13px;font-weight:650;color:var(--studio-text-muted);"><span style="width:8px;height:8px;border-radius:99px;background:#35c49f;display:inline-block;"></span>Design Studio Tech Preview</div>',
      '<h1 style="margin:0;max-width:760px;font-size:clamp(48px,7vw,88px);line-height:.96;font-weight:720;letter-spacing:0;color:var(--studio-text);">Coming Soon</h1>',
      '<p style="margin:22px 0 0;max-width:600px;font-size:clamp(17px,2vw,21px);line-height:1.58;color:var(--studio-text-muted);">This page is seeded as an editable Design Studio preview. Clean dashboard surfaces, public widgets and runtime layout are already wired.</p>',
      '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:30px;"><a href="/login" style="display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 18px;border-radius:var(--studio-radius-control);background:var(--studio-text);color:var(--studio-surface-solid);text-decoration:none;font-weight:700;">Open admin</a><span style="display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid var(--studio-border);border-radius:var(--studio-radius-control);background:var(--studio-surface-solid);color:var(--studio-text-muted);font-weight:600;">Seeded on install</span></div>',
      "</div>",
      '<div style="border:1px solid var(--studio-border);border-radius:var(--studio-radius-panel);background:var(--studio-surface-solid);box-shadow:var(--studio-shadow-soft);padding:18px;">',
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--studio-border);"><strong style="font-size:14px;">Studio canvas</strong><span style="font-size:12px;color:var(--studio-text-muted);">editable seed</span></div>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;"><div style="min-height:104px;border:1px solid var(--studio-border);border-radius:14px;background:var(--studio-surface-muted);padding:14px;"><b style="display:block;font-size:13px;margin-bottom:10px;">Layout</b><span style="display:block;height:8px;width:78%;border-radius:99px;background:rgba(31,41,51,.16);"></span><span style="display:block;height:8px;width:52%;margin-top:8px;border-radius:99px;background:rgba(31,41,51,.12);"></span></div><div style="min-height:104px;border:1px solid var(--studio-border);border-radius:14px;background:var(--studio-surface-muted);padding:14px;"><b style="display:block;font-size:13px;margin-bottom:10px;">Widgets</b><span style="display:inline-flex;width:34px;height:34px;border-radius:99px;background:#ffffff;border:1px solid var(--studio-border);"></span><span style="display:inline-flex;width:34px;height:34px;margin-left:6px;border-radius:99px;background:#ffffff;border:1px solid var(--studio-border);"></span></div></div>',
      '<div style="margin-top:12px;display:grid;gap:10px;"><div style="height:44px;border:1px solid var(--studio-border);border-radius:14px;background:#ffffff;"></div><div style="height:44px;border:1px solid var(--studio-border);border-radius:14px;background:#ffffff;"></div></div>',
      "</div>",
      "</section>"
    ].join(""),
    metaDesc: "A Design Studio powered coming soon preview is being prepared.",
    seoTitle: "Coming Soon",
    seoKeywords: "coming soon, design studio, tech preview"
  };
}

function widgetMeta(label, settings = {}) {
  return {
    label,
    workareaId: COMING_SOON_WORKAREA_ID,
    settings
  };
}

function comingSoonDesignPayload() {
  // Store text content in widget metadata so the public widgets remain editable.
  const widgets = [
    {
      id: "coming-soon-tech-preview-pill",
      widgetId: "textBox",
      xPercent: 8,
      yPercent: 12,
      wPercent: 34,
      hPercent: 7,
      zIndex: 1,
      code: {
        meta: widgetMeta("Tech preview pill", {
          html: '<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:999px;background:var(--studio-surface-solid,#fff);box-shadow:var(--studio-shadow-soft,0 14px 36px rgba(17,24,39,.08));font-size:13px;font-weight:650;color:var(--studio-text-muted,rgba(31,41,51,.62));"><span style="width:8px;height:8px;border-radius:99px;background:#35c49f;display:inline-block;"></span>Design Studio Tech Preview</div>'
        })
      }
    },
    {
      id: "coming-soon-headline",
      widgetId: "textBox",
      xPercent: 8,
      yPercent: 22,
      wPercent: 48,
      hPercent: 24,
      zIndex: 2,
      code: {
        meta: widgetMeta("Coming Soon headline", {
          html: '<h1 style="margin:0;font-size:clamp(48px,7vw,88px);line-height:.96;font-weight:720;letter-spacing:0;color:var(--studio-text,#1f2933);">Coming Soon</h1>'
        })
      }
    },
    {
      id: "coming-soon-copy",
      widgetId: "textBox",
      xPercent: 8,
      yPercent: 48,
      wPercent: 42,
      hPercent: 13,
      zIndex: 3,
      code: {
        meta: widgetMeta("Coming Soon copy", {
          html: '<p style="margin:0;font-size:clamp(17px,2vw,21px);line-height:1.58;color:var(--studio-text-muted,rgba(31,41,51,.62));">This page is seeded as an editable Design Studio preview. Clean dashboard surfaces, public widgets and runtime layout are already wired.</p>'
        })
      }
    },
    {
      id: "coming-soon-seed-status",
      widgetId: "textBox",
      xPercent: 8,
      yPercent: 66,
      wPercent: 20,
      hPercent: 12,
      zIndex: 4,
      code: {
        meta: widgetMeta("Seeded install status", {
          html: '<div style="height:100%;padding:18px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:18px;background:var(--studio-surface-solid,#fff);box-shadow:var(--studio-shadow-soft,0 14px 36px rgba(17,24,39,.08));"><strong style="display:block;font-size:14px;color:var(--studio-text,#1f2933);">Seeded on install</strong><span style="display:block;margin-top:8px;font-size:13px;line-height:1.45;color:var(--studio-text-muted,rgba(31,41,51,.62));">PagesManager creates this preview and links it to maintenance mode.</span></div>'
        })
      }
    },
    {
      id: "coming-soon-runtime-status",
      widgetId: "textBox",
      xPercent: 30,
      yPercent: 66,
      wPercent: 20,
      hPercent: 12,
      zIndex: 5,
      code: {
        meta: widgetMeta("Runtime status", {
          html: '<div style="height:100%;padding:18px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:18px;background:var(--studio-surface-solid,#fff);box-shadow:var(--studio-shadow-soft,0 14px 36px rgba(17,24,39,.08));"><strong style="display:block;font-size:14px;color:var(--studio-text,#1f2933);">Runtime ready</strong><span style="display:block;margin-top:8px;font-size:13px;line-height:1.45;color:var(--studio-text-muted,rgba(31,41,51,.62));">The public renderer loads this saved DesignDocument by meta.designId.</span></div>'
        })
      }
    },
    {
      id: "coming-soon-studio-preview",
      widgetId: "textBox",
      xPercent: 58,
      yPercent: 14,
      wPercent: 34,
      hPercent: 52,
      zIndex: 6,
      code: {
        meta: widgetMeta("Studio preview card", {
          html: '<div style="height:100%;box-sizing:border-box;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:18px;background:var(--studio-surface-solid,#fff);box-shadow:var(--studio-shadow-soft,0 14px 36px rgba(17,24,39,.08));padding:18px;color:var(--studio-text,#1f2933);"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--studio-border,rgba(17,24,39,.08));"><strong style="font-size:14px;">Studio canvas</strong><span style="font-size:12px;color:var(--studio-text-muted,rgba(31,41,51,.62));">editable seed</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;"><div style="min-height:104px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:14px;background:var(--studio-surface-muted,#f6f7f8);padding:14px;"><b style="display:block;font-size:13px;margin-bottom:10px;">Layout</b><span style="display:block;height:8px;width:78%;border-radius:99px;background:rgba(31,41,51,.16);"></span><span style="display:block;height:8px;width:52%;margin-top:8px;border-radius:99px;background:rgba(31,41,51,.12);"></span></div><div style="min-height:104px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:14px;background:var(--studio-surface-muted,#f6f7f8);padding:14px;"><b style="display:block;font-size:13px;margin-bottom:10px;">Widgets</b><span style="display:inline-flex;width:34px;height:34px;border-radius:99px;background:#fff;border:1px solid var(--studio-border,rgba(17,24,39,.08));"></span><span style="display:inline-flex;width:34px;height:34px;margin-left:6px;border-radius:99px;background:#fff;border:1px solid var(--studio-border,rgba(17,24,39,.08));"></span></div></div><div style="margin-top:12px;display:grid;gap:10px;"><div style="height:44px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:14px;background:#fff;"></div><div style="height:44px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:14px;background:#fff;"></div></div></div>'
        })
      }
    },
    {
      id: "coming-soon-login-link",
      widgetId: "buttonLink",
      xPercent: 8,
      yPercent: 82,
      wPercent: 18,
      hPercent: 8,
      zIndex: 7,
      code: {
        meta: widgetMeta("Open admin", {
          label: "Open admin",
          href: "/login",
          variant: "primary"
        })
      }
    },
    {
      id: "coming-soon-install-chip",
      widgetId: "textBox",
      xPercent: 28,
      yPercent: 82,
      wPercent: 22,
      hPercent: 8,
      zIndex: 8,
      code: {
        meta: widgetMeta("Install chip", {
          html: '<div style="display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border:1px solid var(--studio-border,rgba(17,24,39,.08));border-radius:999px;background:var(--studio-surface-solid,#fff);color:var(--studio-text-muted,rgba(31,41,51,.62));font-size:14px;font-weight:650;">Default first-install page</div>'
        })
      }
    }
  ];

  return {
    design: {
      title: "System / Coming Soon",
      description: "Dashboard-styled first-install Coming Soon tech preview.",
      bgColor: "#ffffff",
      isDraft: false,
      version: 0
    },
    widgets,
    layout: {
      type: "leaf",
      nodeId: COMING_SOON_WORKAREA_ID,
      workarea: true,
      settings: {
        mode: "free",
        minHeight: "100vh",
        padding: "clamp(24px,5vw,56px)",
        background: "#ffffff",
        overflow: "visible"
      }
    }
  };
}

async function saveComingSoonDesign(motherEmitter, jwt) {
  if (!canEmit(motherEmitter, "designer.saveDesign")) {
    return { skipped: true, reason: "PAGES_COMING_SOON_DESIGNER_MISSING" };
  }

  try {
    const saved = await emitAsync(motherEmitter, "designer.saveDesign", {
      jwt,
      moduleName: DESIGNER_MODULE_NAME,
      moduleType: MODULE_TYPE,
      ...comingSoonDesignPayload()
    });
    const designId = saved?.id ?? saved?.designId ?? null;
    return designId
      ? { skipped: false, designId, result: saved }
      : { skipped: true, reason: "PAGES_COMING_SOON_DESIGN_ID_MISSING", result: saved };
  } catch (err) {
    console.warn("[PAGE MANAGER] PAGES_COMING_SOON_DESIGN_SAVE_FAILED", err?.message || err);
    return { skipped: true, reason: "PAGES_COMING_SOON_DESIGN_SAVE_FAILED", error: err };
  }
}

async function setSetting(motherEmitter, jwt, key, value) {
  if (!canEmit(motherEmitter, "setSetting")) {
    return { skipped: true, reason: "PAGES_COMING_SOON_SETTINGS_MISSING" };
  }
  await emitAsync(motherEmitter, "setSetting", {
    jwt,
    moduleName: SETTINGS_MODULE_NAME,
    moduleType: MODULE_TYPE,
    key,
    value
  });
  return { skipped: false };
}

async function updatePageMeta(motherEmitter, jwt, pageId, meta) {
  if (!pageId) throw new Error("PAGES_COMING_SOON_PAGE_ID_MISSING");
  if (!canEmit(motherEmitter, "updatePage")) {
    return { skipped: true, reason: "PAGES_COMING_SOON_UPDATE_PAGE_MISSING" };
  }
  await emitAsync(motherEmitter, "updatePage", {
    jwt,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    pageId,
    meta
  });
  return { skipped: false };
}

async function getComingSoonPage(motherEmitter, jwt) {
  if (!canEmit(motherEmitter, "getPageBySlug")) return null;
  return emitAsync(motherEmitter, "getPageBySlug", {
    jwt,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    slug: COMING_SOON_SLUG,
    lane: "public",
    language: COMING_SOON_LANGUAGE
  });
}

async function createComingSoonPage(motherEmitter, jwt) {
  if (!canEmit(motherEmitter, "createPage")) {
    throw new Error("PAGES_COMING_SOON_CREATE_PAGE_MISSING");
  }
  const result = await emitAsync(motherEmitter, "createPage", {
    jwt,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    title: "Coming Soon",
    slug: COMING_SOON_SLUG,
    lane: "public",
    status: "published",
    translations: [comingSoonTranslation()],
    meta: baseSeedMeta(),
    is_content: false
  });
  return pageIdFromResult(result);
}

async function maybeAttachDesign(motherEmitter, jwt, page, { force = false } = {}) {
  const pageId = pageIdFromRow(page);
  const meta = parseRecord(page?.meta);
  if (!force && meta.designId) return { pageId, meta, design: { skipped: true, reason: "already-linked" } };

  const design = await saveComingSoonDesign(motherEmitter, jwt);
  if (!design.designId) return { pageId, meta, design };

  const nextMeta = baseSeedMeta({
    ...meta,
    designId: design.designId
  });
  await updatePageMeta(motherEmitter, jwt, pageId, nextMeta);
  return { pageId, meta: nextMeta, design };
}

async function seedComingSoonPage(motherEmitter, jwt, options = {}) {
  if (!motherEmitter || typeof motherEmitter.emit !== "function") {
    throw new Error("PAGES_COMING_SOON_EMITTER_MISSING");
  }
  if (!jwt) throw new Error("PAGES_COMING_SOON_JWT_MISSING");

  const enableMaintenanceMode = options.enableMaintenanceMode === true;
  const existing = await getComingSoonPage(motherEmitter, jwt);
  let page = existing;
  let created = false;
  let upgraded = false;
  let pageId = pageIdFromRow(page);
  let design = { skipped: true, reason: "not-seed-owned" };
  const meta = parseRecord(page?.meta);
  const seedManaged = isSeedOwned(meta) || isRetiredRawComingSoonSeedPage(page);
  const seedOutdated = seedManaged && seedVersionOf(meta) < COMING_SOON_SEED_VERSION;

  if (!page) {
    pageId = await createComingSoonPage(motherEmitter, jwt);
    created = true;
    page = { id: pageId, slug: COMING_SOON_SLUG, meta: baseSeedMeta() };
  }

  // Custom user pages with the same slug are left untouched unless maintenance is explicitly enabled.
  if (created || seedManaged) {
    const attached = await maybeAttachDesign(motherEmitter, jwt, page, {
      force: created || seedOutdated || !parseRecord(page?.meta).designId
    });
    pageId = attached.pageId || pageId;
    design = attached.design;
    upgraded = !created && Boolean(attached.design?.designId);
  }

  if (pageId && (created || seedManaged || enableMaintenanceMode)) {
    await setSetting(motherEmitter, jwt, "MAINTENANCE_PAGE_ID", String(pageId));
  }

  if (enableMaintenanceMode) {
    await setSetting(motherEmitter, jwt, "MAINTENANCE_MODE", "true");
  }

  return {
    pageId,
    created,
    upgraded,
    designId: design?.designId || parseRecord(page?.meta).designId || null,
    designSkipped: design?.skipped === true,
    designSkipReason: design?.reason || null
  };
}

module.exports = {
  COMING_SOON_SEED_KEY,
  COMING_SOON_SEED_VERSION,
  COMING_SOON_SLUG,
  comingSoonDesignPayload,
  comingSoonTranslation,
  seedComingSoonPage,
  _internals: {
    baseSeedMeta,
    canEmit,
    emitAsync,
    isRetiredRawComingSoonSeedPage,
    isSeedOwned,
    parseRecord
  }
};
