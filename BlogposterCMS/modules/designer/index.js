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

    // 3) Listen for layout save events using high level CRUD operations
    motherEmitter.on("designer.saveLayout", (payload = {}, callback) => {
      if (typeof payload !== "object") {
        if (typeof callback === "function")
          callback(new Error("Invalid payload"));
        return;
      }
      const safeName = String(payload.name || "").replace(/[\n\r]/g, "");
      if (!safeName) {
        if (typeof callback === "function")
          callback(new Error("Missing layout name"));
        return;
      }
      const layoutJson = JSON.stringify(payload.layout || {});
      const updatedAt = new Date().toISOString();

      // First check if layout already exists
      motherEmitter.emit(
        "dbSelect",
        {
          jwt,
          moduleName: "designer",
          moduleType: "community",
          table: "designer_layouts",
          where: { name: safeName },
        },
        (selectErr, rows) => {
          if (selectErr) {
            if (typeof callback === "function") callback(selectErr);
            return;
          }

          const exists = Array.isArray(rows) && rows.length > 0;
          const eventName = exists ? "dbUpdate" : "dbInsert";
          const payloadData = exists
            ? {
                jwt,
                moduleName: "designer",
                moduleType: "community",
                table: "designer_layouts",
                data: { layout_json: layoutJson, updated_at: updatedAt },
                where: { name: safeName },
              }
            : {
                jwt,
                moduleName: "designer",
                moduleType: "community",
                table: "designer_layouts",
                data: {
                  name: safeName,
                  layout_json: layoutJson,
                  updated_at: updatedAt,
                },
              };

          motherEmitter.emit(eventName, payloadData, (err) => {
            if (typeof callback !== "function") return;
            if (err) return callback(err);
            callback(null, { success: true });
          });
        },
      );
    });

    console.log("[DESIGNER MODULE] designer module initialized.");
  },
};
