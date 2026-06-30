"use strict";

const path = require("path");
const sanitizeHtmlLib = require("sanitize-html");
const { registerCustomPlaceholder } = require("../databaseManager/placeholders/placeholderRegistry");
const {
  handleSaveDesignPlaceholder,
  handleGetDesignPlaceholder,
  handleListDesignsPlaceholder,
  handleGetLayoutPlaceholder,
  handleListLayoutsPlaceholder,
} = require("./dbPlaceholders");

const MODULE_NAME = "designerManager";
const DESIGNER_RESOURCE_NAME = "designer";
const MODULE_TYPE = "core";

function onceCallback(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === "function") {
      originalCb(...args);
    } else {
      console.warn("[DESIGNER MODULE] Callback missing or not a function.");
    }
  };
}

function assertCoreAdapterInitialize({ motherEmitter, jwt, moduleType } = {}) {
  if (moduleType !== MODULE_TYPE) {
    throw new Error("[DESIGNER MODULE:E_DESIGNER_SERVICE_CORE_ONLY] Designer service must be loaded through designerManager as a core service.");
  }
  if (!jwt) {
    throw new Error("[DESIGNER MODULE] initialization requires a valid JWT token.");
  }
  if (!motherEmitter) {
    throw new Error("[DESIGNER MODULE] motherEmitter missing.");
  }
}

function parseWidgetMetadata(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function initialize({ motherEmitter, jwt, nonce, moduleType } = {}) {
  assertCoreAdapterInitialize({ motherEmitter, jwt, moduleType });

  console.log("[DESIGNER MODULE] Initializing designer service...");

    // 1) Ensure dedicated database or schema for the designer module
    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        "createDatabase",
        {
          jwt,
          moduleName: MODULE_NAME,
          moduleType,
          nonce,
          targetModuleName: DESIGNER_RESOURCE_NAME,
        },
        (err) => {
          if (err) {
            console.error(
              "[DESIGNER MODULE] Error ensuring designer database: %s",
              err.message,
            );
            return reject(err);
          }
          resolve();
        },
      );
    });

    // 2) Apply generic schema definition for all supported databases
    const schemaPath = path.join(__dirname, "schemaDefinition.json");
    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        "applySchemaDefinition",
        {
          jwt,
          moduleName: MODULE_NAME,
          moduleType,
          filePath: schemaPath,
        },
        (err) => {
          if (err) {
            console.error(
              "[DESIGNER MODULE] Error applying schema: %s",
              err.message,
            );
            return reject(err);
          }
          resolve();
        },
      );
    });

    registerCustomPlaceholder("DESIGNER_SAVE_DESIGN", {
      moduleName: MODULE_NAME,
      functionName: "handleSaveDesignPlaceholder",
    });
    registerCustomPlaceholder("DESIGNER_LIST_DESIGNS", {
      moduleName: MODULE_NAME,
      functionName: "handleListDesignsPlaceholder",
    });
    registerCustomPlaceholder("DESIGNER_GET_DESIGN", {
      moduleName: MODULE_NAME,
      functionName: "handleGetDesignPlaceholder",
    });
    registerCustomPlaceholder("DESIGNER_GET_LAYOUT", {
      moduleName: MODULE_NAME,
      functionName: "handleGetLayoutPlaceholder",
    });
    registerCustomPlaceholder("DESIGNER_LIST_LAYOUTS", {
      moduleName: MODULE_NAME,
      functionName: "handleListLayoutsPlaceholder",
    });

    // 3) Listen for design save events and persist via custom placeholder
    motherEmitter.on("designer.saveDesign", async (payload = {}, callback) => {
        try {
        if (!payload || typeof payload !== "object")
          throw new Error("Invalid payload");
        const { design = {}, widgets = [], layout = null } = payload;
        const sanitizeColor = val => {
          if (typeof val !== "string") return "";
          const hex = val.match(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/);
          if (hex) return hex[0];
          const rgb = val.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*(?:\.\d+)?))?\)$/i);
          if (rgb) {
            const clamp255 = n => Math.min(255, Math.max(0, parseInt(n, 10)));
            const r = clamp255(rgb[1]);
            const g = clamp255(rgb[2]);
            const b = clamp255(rgb[3]);
            let out = `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
            if (rgb[4] !== undefined) {
              const a = Math.round(Math.min(1, Math.max(0, parseFloat(rgb[4]))) * 255);
              out += a.toString(16).padStart(2, '0');
            }
            return out;
          }
          return "";
        };
        const sanitizeUrl = val => (typeof val === "string" && /^(https?:\/\/|\/)[^\s]*$/.test(val)
          ? val
          : "");
        const sanitizeCss = (css, inline = false) => {
          const expr = /expression/i;
          const urlPattern = /url\(([^)]*)\)/gi;
          const isUnsafeUrl = url => {
            const val = url.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
            return /^(javascript|data|vbscript|file|ftp|chrome|chrome-extension|resource|about|blob):/.test(val);
          };
          if (inline) {
            return String(css || '')
              .split(';')
              .map(s => s.trim())
              .filter(Boolean)
              .filter(rule => {
                if (expr.test(rule)) return false;
                const matches = rule.matchAll(urlPattern);
                for (const [, url] of matches) {
                  if (isUnsafeUrl(url)) return false;
                }
                return true;
              })
              .join('; ');
          }
          return String(css || '')
            .replace(/expression\([^)]*\)/gi, '')
            .replace(urlPattern, (match, url) => (isUnsafeUrl(url) ? '' : match));
        };
        const sanitizeHtml = html =>
          sanitizeHtmlLib(html || '', {
            allowedTags: sanitizeHtmlLib.defaults.allowedTags,
            allowedAttributes: {
              ...sanitizeHtmlLib.defaults.allowedAttributes,
              '*': [
                ...(sanitizeHtmlLib.defaults.allowedAttributes['*'] || []),
                'style',
              ],
            },
            allowedSchemes: ['http', 'https', 'data'],
            allowProtocolRelative: false,
            transformTags: {
              '*': (tagName, attribs) => {
                if (attribs.style) attribs.style = sanitizeCss(attribs.style, true);
                return { tagName, attribs };
              },
              style: (tagName, attribs, { text }) => ({ tagName: 'style', text: sanitizeCss(text) }),
            },
          });
        const title = String(design.title || "").replace(/[\n\r]/g, "").trim();
        if (!title) throw new Error("Missing design title");
        const description = String(design.description || "");
        const thumbnail = sanitizeUrl(design.thumbnail || "");
        const ownerId = String(design.ownerId || "");
        const bg_color = sanitizeColor(design.bgColor || "");
        const bg_media_id = String(design.bgMediaId || "");
        const bg_media_url = sanitizeUrl(design.bgMediaUrl || "");
        const published_at = design.publishedAt
          ? new Date(design.publishedAt).toISOString()
          : null;
        // Normalize the draft flag before it crosses database engine adapters.
        const is_draft = Boolean(design.isDraft);
        const is_layout = Boolean(design.isLayout || design.is_layout);
        const is_global = Boolean(design.isGlobal || design.is_global);
        const version = Number.isInteger(design.version) ? design.version : 0;
        const now = new Date().toISOString();

        const clamp = n => Math.min(100, Math.max(0, Number(n) || 0));
        const cleanWidgets = [];
        for (const w of Array.isArray(widgets) ? widgets : []) {
          const instanceId = String(w.id || "").trim();
          const widgetId = String(w.widgetId || "").trim();
          if (!instanceId || !widgetId) continue;
          const x = clamp(w.xPercent);
          const y = clamp(w.yPercent);
          const wPerc = clamp(w.wPercent);
          const hPerc = clamp(w.hPercent);
          const z = Number.isFinite(w.zIndex) ? Math.round(w.zIndex) : null;
          const rot = Number.isFinite(w.rotationDeg) ? w.rotationDeg : null;
          const op = Number.isFinite(w.opacity)
            ? Math.min(1, Math.max(0, w.opacity))
            : null;
          const code = w.code && typeof w.code === "object" ? w.code : {};
          const html =
            typeof code.html === "string" ? sanitizeHtml(code.html) : null;
          const css =
            typeof code.css === "string" ? sanitizeCss(code.css) : null;
          const js = typeof code.js === "string" ? code.js : null;
          const metadata = code.meta ? JSON.stringify(code.meta) : null;
          cleanWidgets.push({
            instanceId,
            widgetId,
            x,
            y,
            wPerc,
            hPerc,
            zIndex: z,
            rotation: rot,
            opacity: op,
            html,
            css,
            js,
            metadata,
          });
        }

        const result = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            "performDbOperation",
            {
              jwt,
              moduleName: MODULE_NAME,
              moduleType,
              operation: "DESIGNER_SAVE_DESIGN",
              params: [
                {
                  design: {
                    id: design.id,
                    title,
                    description,
                    thumbnail,
                    bg_color,
                    bg_media_id,
                    bg_media_url,
                    published_at,
                    owner_id: ownerId,
                    is_draft,
                    is_layout,
                    is_global,
                    version,
                    now,
                  },
                  widgets: cleanWidgets,
                  layout,
                },
              ],
            },
            onceCallback((err, res) => (err ? reject(err) : resolve(res))),
          );
        });

        if (typeof callback === "function") callback(null, result);
      } catch (err) {
        if (typeof callback === "function") callback(err);
      }
      });
    motherEmitter.on("designer.getDesign", async (payload = {}, callback) => {
      try {
        if (!payload || typeof payload !== "object")
          throw new Error("Invalid payload");
        if (!payload.id) throw new Error("Missing design id");
        const res = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            "performDbOperation",
            {
              jwt,
              moduleName: MODULE_NAME,
              moduleType,
              operation: "DESIGNER_GET_DESIGN",
              params: [payload],
            },
            onceCallback((err, r) => (err ? reject(err) : resolve(r)))
          );
        });
        if (typeof callback === "function") callback(null, res);
      } catch (err) {
        if (typeof callback === "function") callback(err);
      }
      });

    motherEmitter.on("designer.getLayout", (payload = {}, originalCb) => {
      const cb = onceCallback(originalCb);
      try {
        const { jwt: token, id, layoutRef = "" } = payload || {};
        if (!token) throw new Error("Missing jwt");
        if (id) {
          motherEmitter.emit(
            "performDbOperation",
            {
              jwt: token,
              moduleName: MODULE_NAME,
              moduleType,
              operation: "DESIGNER_GET_LAYOUT",
              params: [{ id }],
            },
            onceCallback((err, res) => (err ? cb(err) : cb(null, res)))
          );
          return;
        }
        const match =
          typeof layoutRef === "string" && layoutRef.match(/^layout:([^@]+)(?:@.*)?$/);
        if (!match) throw new Error("Invalid layoutRef");
        const designId = match[1];
        motherEmitter.emit(
          "designer.getDesign",
          {
            jwt: token,
            moduleName: MODULE_NAME,
            moduleType,
            nonce,
            id: designId,
          },
          onceCallback((err, res) => {
            if (err) return cb(err);
            if (!res) return cb(new Error("Design not found"));
            const clamp = n => Math.min(100, Math.max(0, Number(n) || 0));
            const items = Array.isArray(res.widgets)
              ? res.widgets
                  .map(w => ({
                    instanceId: String(w.instance_id || ""),
                    widgetId: String(w.widget_id || ""),
                    xPercent: clamp(w.x_percent),
                    yPercent: clamp(w.y_percent),
                    wPercent: clamp(w.w_percent),
                    hPercent: clamp(w.h_percent),
                    zIndex: Number(w.z_index) || 0,
                    rotationDeg: Number(w.rotation_deg) || 0,
                    opacity: w.opacity == null ? 1 : Number(w.opacity) || 1,
                    html: typeof w.html === "string" ? w.html : "",
                    css: typeof w.css === "string" ? w.css : "",
                    js: typeof w.js === "string" ? w.js : "",
                    metadata: parseWidgetMetadata(w.metadata)
                  }))
                  .filter(it => it.instanceId && it.widgetId)
              : [];
            cb(null, { grid: { columns: 12, cellHeight: 8 }, items, layoutRef });
          })
        );
      } catch (e) {
        cb(e);
      }
    });
    motherEmitter.on("designer.listDesigns", async (payload = {}, callback) => {
      try {
        const designs = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            "performDbOperation",
            {
              jwt,
              moduleName: MODULE_NAME,
              moduleType,
              operation: "DESIGNER_LIST_DESIGNS",
              params: [payload || {}],
            },
            onceCallback((err, res) => (err ? reject(err) : resolve(res)))
          );
        });
        if (typeof callback === "function") callback(null, { designs });
      } catch (err) {
        if (typeof callback === "function") callback(err);
      }
      });

    motherEmitter.on("designer.listLayouts", async (payload = {}, callback) => {
      try {
        const layouts = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            "performDbOperation",
            {
              jwt,
              moduleName: MODULE_NAME,
              moduleType,
              operation: "DESIGNER_LIST_LAYOUTS",
              params: [payload || {}],
            },
            onceCallback((err, res) => (err ? reject(err) : resolve(res)))
          );
        });
        if (typeof callback === "function") callback(null, { layouts });
      } catch (err) {
        if (typeof callback === "function") callback(err);
      }
    });

  console.log("[DESIGNER MODULE] designer service initialized.");
}

module.exports = {
  initialize,
  MODULE_NAME,
  DESIGNER_RESOURCE_NAME,
  MODULE_TYPE,
  handleSaveDesignPlaceholder,
  handleGetDesignPlaceholder,
  handleListDesignsPlaceholder,
  handleGetLayoutPlaceholder,
  handleListLayoutsPlaceholder,
  _internals: {
    assertCoreAdapterInitialize
  }
};
