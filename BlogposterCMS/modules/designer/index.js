"use strict";

const path = require("path");

module.exports = {
  async initialize({ motherEmitter, jwt, nonce }) {
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

    // 3) Listen for design save events using high level CRUD operations
    motherEmitter.on("designer.saveDesign", async (payload = {}, callback) => {
      try {
        if (typeof payload !== "object") {
          throw new Error("Invalid payload");
        }
        const { design = {}, widgets = [] } = payload;
        const title = String(design.title || "").replace(/[\n\r]/g, "").trim();
        if (!title) {
          throw new Error("Missing design title");
        }
        const description = String(design.description || "");
        const thumbnail = String(design.thumbnail || "");
        const ownerId = String(design.ownerId || "");
        const background = String(design.background || "");
        const publishedAt = design.publishedAt
          ? new Date(design.publishedAt).toISOString()
          : null;
        const now = new Date().toISOString();

        let designId = design.id;
        if (designId) {
          await new Promise((resolve, reject) => {
            motherEmitter.emit(
              "dbUpdate",
              {
                jwt,
                moduleName: "designer",
                moduleType: "community",
                table: "designer_designs",
                data: {
                  title,
                  description,
                  thumbnail,
                  background,
                  updated_at: now,
                  published_at: publishedAt,
                  owner_id: ownerId,
                },
                where: { id: designId },
              },
              (err) => (err ? reject(err) : resolve()),
            );
          });
          await Promise.all([
            new Promise((resolve, reject) => {
              motherEmitter.emit(
                "dbDelete",
                {
                  jwt,
                  moduleName: "designer",
                  moduleType: "community",
                  table: "designer_design_widgets",
                  where: { design_id: designId },
                },
                (err) => (err ? reject(err) : resolve()),
              );
            }),
            new Promise((resolve, reject) => {
              motherEmitter.emit(
                "dbDelete",
                {
                  jwt,
                  moduleName: "designer",
                  moduleType: "community",
                  table: "designer_widget_meta",
                  where: { design_id: designId },
                },
                (err) => (err ? reject(err) : resolve()),
              );
            }),
          ]);
        } else {
          const rows = await new Promise((resolve, reject) => {
            motherEmitter.emit(
              "dbInsert",
              {
                jwt,
                moduleName: "designer",
                moduleType: "community",
                table: "designer_designs",
                data: {
                  title,
                  description,
                  thumbnail,
                  background,
                  created_at: now,
                  updated_at: now,
                  published_at: publishedAt,
                  owner_id: ownerId,
                },
              },
              (err, rows) => (err ? reject(err) : resolve(rows)),
            );
          });
          designId = rows && rows[0] ? rows[0].id : null;
          if (!designId) throw new Error("Failed to insert design");
        }

        for (const w of Array.isArray(widgets) ? widgets : []) {
          const instanceId = String(w.id || "");
          const widgetId = String(w.widgetId || "");
          const x = Number(w.xPercent) || 0;
          const y = Number(w.yPercent) || 0;
          const wPerc = Number(w.wPercent) || 0;
          const hPerc = Number(w.hPercent) || 0;
          await new Promise((resolve, reject) => {
            motherEmitter.emit(
              "dbInsert",
              {
                jwt,
                moduleName: "designer",
                moduleType: "community",
                table: "designer_design_widgets",
                data: {
                  design_id: designId,
                  instance_id: instanceId,
                  widget_id: widgetId,
                  x_percent: x,
                  y_percent: y,
                  w_percent: wPerc,
                  h_percent: hPerc,
                },
              },
              (err) => (err ? reject(err) : resolve()),
            );
          });

          const code = w.code && typeof w.code === "object" ? w.code : {};
          const html = typeof code.html === "string" ? code.html : null;
          const css = typeof code.css === "string" ? code.css : null;
          const js = typeof code.js === "string" ? code.js : null;
          const metadata = code.meta ? JSON.stringify(code.meta) : null;
          if (html || css || js || metadata) {
            await new Promise((resolve, reject) => {
              motherEmitter.emit(
                "dbInsert",
                {
                  jwt,
                  moduleName: "designer",
                  moduleType: "community",
                  table: "designer_widget_meta",
                  data: {
                    design_id: designId,
                    instance_id: instanceId,
                    html,
                    css,
                    js,
                    metadata,
                  },
                },
                (err) => (err ? reject(err) : resolve()),
              );
            });
          }
        }

        await new Promise((resolve, reject) => {
          motherEmitter.emit(
            "dbInsert",
            {
              jwt,
              moduleName: "designer",
              moduleType: "community",
              table: "designer_versions",
              data: {
                design_id: designId,
                layout_json: JSON.stringify(widgets),
                created_at: now,
              },
            },
            (err) => (err ? reject(err) : resolve()),
          );
        });

        if (typeof callback === "function") {
          callback(null, { success: true, id: designId });
        }
      } catch (err) {
        if (typeof callback === "function") callback(err);
      }
    });

    console.log("[DESIGNER MODULE] designer module initialized.");
  },
};
