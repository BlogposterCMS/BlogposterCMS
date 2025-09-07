"use strict";

const path = require("path");
const sanitizeHtmlLib = require("sanitize-html");
const { registerCustomPlaceholder } = require("../../mother/modules/databaseManager/placeholders/placeholderRegistry");
const { onceCallback } = require("../../mother/emitters/motherEmitter");
const {
  handleSaveDesignPlaceholder,
  handleGetDesignPlaceholder,
  handleListDesignsPlaceholder,
} = require("./dbPlaceholders");

async function initialize({ motherEmitter, jwt, nonce }) {
  console.log("[DESIGNER MODULE] Initializing designer module...");

    // 1) Ensure dedicated database or schema for the designer module
    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        "createDatabase",
        {
          jwt,
          moduleName: "designer",
          moduleType: "community",
          nonce,
          targetModuleName: "designer",
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
          moduleName: "designer",
          moduleType: "community",
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
      moduleName: "designer",
      functionName: "handleSaveDesignPlaceholder",
    });
    registerCustomPlaceholder("DESIGNER_LIST_DESIGNS", {
      moduleName: "designer",
      functionName: "handleListDesignsPlaceholder",
    });
    registerCustomPlaceholder("DESIGNER_GET_DESIGN", {
      moduleName: "designer",
      functionName: "handleGetDesignPlaceholder",
    });

    // 3) Listen for design save events and persist via custom placeholder
    motherEmitter.on("designer.saveDesign", async (payload = {}, callback) => {
      try {
        if (!payload || typeof payload !== "object")
          throw new Error("Invalid payload");
        const { design = {}, widgets = [] } = payload;
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
        // normalize draft flag to a real boolean for database compatibility
        const is_draft = Boolean(design.isDraft);
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
              moduleName: "designer",
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
                    version,
                    now,
                  },
                  widgets: cleanWidgets,
                },
              ],
            },
            (err, res) => (err ? reject(err) : resolve(res)),
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
              moduleName: "designer",
              operation: "DESIGNER_GET_DESIGN",
              params: [payload],
            },
            (err, r) => (err ? reject(err) : resolve(r))
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
        const { jwt: token, layoutRef = "" } = payload || {};
        if (!token) throw new Error("Missing jwt");
        const match = typeof layoutRef === "string" && layoutRef.match(/^layout:([^@]+)(?:@.*)?$/);
        if (!match) throw new Error("Invalid layoutRef");
        const designId = match[1];
        motherEmitter.emit(
          "designer.getDesign",
          { id: designId },
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
                    hPercent: clamp(w.h_percent)
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
              moduleName: "designer",
              operation: "DESIGNER_LIST_DESIGNS",
              params: [payload || {}],
            },
            (err, res) => (err ? reject(err) : resolve(res))
          );
        });
        if (typeof callback === "function") callback(null, { designs });
      } catch (err) {
        if (typeof callback === "function") callback(err);
      }
    });

  console.log("[DESIGNER MODULE] designer module initialized.");
}

module.exports = {
  initialize,
  handleSaveDesignPlaceholder,
  handleGetDesignPlaceholder,
  handleListDesignsPlaceholder,
};
