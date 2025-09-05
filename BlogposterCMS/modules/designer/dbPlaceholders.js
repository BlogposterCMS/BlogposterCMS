"use strict";

const { ObjectId } = require("mongodb");

async function handleSaveDesignPlaceholder({ dbClient, params }) {
  const { design = {}, widgets = [] } = params[0] || {};
  const dbType = (process.env.CONTENT_DB_TYPE || "").toLowerCase();
  const now = design.now || new Date().toISOString();
  let designId = design.id || null;
  const version = Number(design.version) || 0;
  // ensure is_draft is a proper boolean (caller may send true/false, 0/1, or "1"/"0")
  const isDraft =
    design.is_draft === true ||
    design.is_draft === 1 ||
    design.is_draft === "1";

  if (dbType === "postgres") {
    const client = dbClient;
    const tblDesigns = "designer.designer_designs";
    const tblWidgets = "designer.designer_design_widgets";
    const tblMeta = "designer.designer_widget_meta";
    const tblVersions = "designer.designer_versions";
    await client.query("BEGIN");
    try {
      if (designId) {
        const res = await client.query(
          `
            UPDATE ${tblDesigns}
               SET title=$1, description=$2, thumbnail=$3,
                   bg_color=$4, bg_media_id=$5, bg_media_url=$6,
                   updated_at=$7, published_at=$8, owner_id=$9,
                   is_draft=$10, version=$11
             WHERE id=$12 AND version=$13
             RETURNING id;
          `,
          [
            design.title,
            design.description,
            design.thumbnail,
            design.bg_color,
            design.bg_media_id,
            design.bg_media_url,
            now,
            design.published_at,
            design.owner_id,
            isDraft,
            version + 1,
            designId,
            version,
          ],
        );
        if (res.rowCount === 0) throw new Error("Version conflict");
        await client.query(`DELETE FROM ${tblWidgets} WHERE design_id=$1`, [designId]);
        await client.query(`DELETE FROM ${tblMeta} WHERE design_id=$1`, [designId]);
        designId = res.rows[0].id;
        design.version = version + 1;
      } else {
        const ins = await client.query(
          `
            INSERT INTO ${tblDesigns}
              (title, description, thumbnail, bg_color, bg_media_id, bg_media_url,
               created_at, updated_at, published_at, owner_id, version, is_draft)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,1,$10)
            RETURNING id;
          `,
          [
            design.title,
            design.description,
            design.thumbnail,
            design.bg_color,
            design.bg_media_id,
            design.bg_media_url,
            now,
            design.published_at,
            design.owner_id,
            isDraft,
          ],
        );
        designId = ins.rows[0].id;
        design.version = 1;
      }

      for (const w of Array.isArray(widgets) ? widgets : []) {
        await client.query(
          `
            INSERT INTO ${tblWidgets}
              (design_id, instance_id, widget_id, x_percent, y_percent, w_percent, h_percent, z_index, rotation_deg, opacity)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
          `,
          [
            designId,
            w.instanceId,
            w.widgetId,
            w.x,
            w.y,
            w.wPerc,
            w.hPerc,
            w.zIndex,
            w.rotation,
            w.opacity,
          ],
        );
        if (w.html || w.css || w.js || w.metadata) {
          await client.query(
            `
              INSERT INTO ${tblMeta}
                (design_id, instance_id, html, css, js, metadata)
              VALUES ($1,$2,$3,$4,$5,$6);
            `,
            [designId, w.instanceId, w.html, w.css, w.js, w.metadata],
          );
        }
      }

      await client.query(
        `
          INSERT INTO ${tblVersions} (design_id, layout_json, created_at)
          VALUES ($1,$2,$3);
        `,
        [designId, JSON.stringify(widgets), now],
      );

      await client.query("COMMIT");
      return { id: designId, version: design.version, updated_at: now };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  } else if (dbType === "sqlite") {
    const db = dbClient;
    await db.run("BEGIN");
    try {
      if (designId) {
        const res = await db.run(
          `
        UPDATE designer_designs
           SET title = ?, description = ?, thumbnail = ?,
               bg_color = ?, bg_media_id = ?, bg_media_url = ?,
               updated_at = ?, published_at = ?, owner_id = ?,
               is_draft = ?, version = ?
         WHERE id = ? AND version = ?;
      `,
          [
            design.title,
            design.description,
            design.thumbnail,
            design.bg_color,
            design.bg_media_id,
            design.bg_media_url,
            now,
            design.published_at,
            design.owner_id,
            isDraft ? 1 : 0,
            version + 1,
            designId,
            version,
          ],
        );
        if (!res.changes) throw new Error("Version conflict");
        await db.run(`DELETE FROM designer_design_widgets WHERE design_id = ?;`, [designId]);
        await db.run(`DELETE FROM designer_widget_meta WHERE design_id = ?;`, [designId]);
        design.version = version + 1;
      } else {
        const res = await db.run(
          `
        INSERT INTO designer_designs
          (title, description, thumbnail, bg_color, bg_media_id, bg_media_url,
           created_at, updated_at, published_at, owner_id, version, is_draft)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,?);
      `,
          [
            design.title,
            design.description,
            design.thumbnail,
            design.bg_color,
            design.bg_media_id,
            design.bg_media_url,
            now,
            now,
            design.published_at,
            design.owner_id,
            isDraft ? 1 : 0,
          ],
        );
        designId = res.lastID;
        design.version = 1;
      }

      for (const w of Array.isArray(widgets) ? widgets : []) {
        await db.run(
          `
        INSERT INTO designer_design_widgets
          (design_id, instance_id, widget_id, x_percent, y_percent, w_percent, h_percent, z_index, rotation_deg, opacity)
        VALUES (?,?,?,?,?,?,?,?,?,?);
      `,
          [
            designId,
            w.instanceId,
            w.widgetId,
            w.x,
            w.y,
            w.wPerc,
            w.hPerc,
            w.zIndex,
            w.rotation,
            w.opacity,
          ],
        );
        if (w.html || w.css || w.js || w.metadata) {
          await db.run(
            `
          INSERT INTO designer_widget_meta
            (design_id, instance_id, html, css, js, metadata)
          VALUES (?,?,?,?,?,?);
        `,
            [designId, w.instanceId, w.html, w.css, w.js, w.metadata],
          );
        }
      }

      await db.run(
        `
      INSERT INTO designer_versions (design_id, layout_json, created_at)
      VALUES (?,?,?);
    `,
        [designId, JSON.stringify(widgets), now],
      );

      await db.run("COMMIT");
      return { id: designId, version: design.version, updated_at: now };
    } catch (e) {
      await db.run("ROLLBACK");
      throw e;
    }
  } else if (dbType === "mongodb") {
    const db = dbClient;
    const designs = db.collection("designer_designs");
    const widgetsCol = db.collection("designer_design_widgets");
    const metaCol = db.collection("designer_widget_meta");
    const versionsCol = db.collection("designer_versions");
    const session = db.client && typeof db.client.startSession === "function" ? db.client.startSession() : null;

    const runOps = async (sess) => {
      let objId = designId && ObjectId.isValid(designId) ? new ObjectId(designId) : null;
      if (objId) {
        const res = await designs.updateOne(
          { _id: objId, version },
          {
            $set: {
              title: design.title,
              description: design.description,
              thumbnail: design.thumbnail,
              bg_color: design.bg_color,
              bg_media_id: design.bg_media_id,
              bg_media_url: design.bg_media_url,
              updated_at: now,
              published_at: design.published_at,
              owner_id: design.owner_id,
              is_draft: isDraft,
            },
            $inc: { version: 1 },
          },
          { session: sess }
        );
        if (!res.matchedCount) throw new Error("Version conflict");
        await widgetsCol.deleteMany({ design_id: objId }, { session: sess });
        await metaCol.deleteMany({ design_id: objId }, { session: sess });
        design.version = version + 1;
      } else {
        const res = await designs.insertOne(
          {
            title: design.title,
            description: design.description,
            thumbnail: design.thumbnail,
            bg_color: design.bg_color,
            bg_media_id: design.bg_media_id,
            bg_media_url: design.bg_media_url,
            created_at: now,
            updated_at: now,
            published_at: design.published_at,
            owner_id: design.owner_id,
            version: 1,
            is_draft: isDraft,
          },
          { session: sess }
        );
        objId = res.insertedId;
        design.version = 1;
      }

      for (const w of Array.isArray(widgets) ? widgets : []) {
        await widgetsCol.insertOne(
          {
            design_id: objId,
            instance_id: w.instanceId,
            widget_id: w.widgetId,
            x_percent: w.x,
            y_percent: w.y,
            w_percent: w.wPerc,
            h_percent: w.hPerc,
            z_index: w.zIndex,
            rotation_deg: w.rotation,
            opacity: w.opacity,
          },
          { session: sess }
        );
        if (w.html || w.css || w.js || w.metadata) {
          await metaCol.insertOne(
            {
              design_id: objId,
              instance_id: w.instanceId,
              html: w.html,
              css: w.css,
              js: w.js,
              metadata: w.metadata,
            },
            { session: sess }
          );
        }
      }

      await versionsCol.insertOne(
        { design_id: objId, layout_json: widgets, created_at: now },
        { session: sess }
      );

      designId = objId;
    };

    if (session) {
      try {
        await session.withTransaction(async () => {
          await runOps(session);
        });
      } finally {
        await session.endSession();
      }
    } else {
      await runOps();
    }

    return { id: String(designId), version: design.version, updated_at: now };
  } else {
    throw new Error("DESIGNER_SAVE_DESIGN not supported for this DB");
  }
}

async function handleGetDesignPlaceholder({ dbClient, params }) {
  const opts = params[0] || {};
  const designId = opts.id;
  if (!designId) throw new Error("Missing design id");
  const dbType = (process.env.CONTENT_DB_TYPE || "").toLowerCase();

  if (dbType === "postgres") {
    const metaRes = await dbClient.query(
      `SELECT id, title, description, thumbnail, bg_color, bg_media_id, bg_media_url, created_at, updated_at, published_at, owner_id, version, is_draft FROM designer.designer_designs WHERE id=$1 AND deleted_at IS NULL`,
      [designId]
    );
    if (!metaRes.rows[0]) return null;
    const widgetsRes = await dbClient.query(
      `SELECT w.instance_id, w.widget_id, w.x_percent, w.y_percent, w.w_percent, w.h_percent, w.z_index, w.rotation_deg, w.opacity, m.html, m.css, m.js, m.metadata FROM designer.designer_design_widgets w LEFT JOIN designer.designer_widget_meta m ON w.design_id = m.design_id AND w.instance_id = m.instance_id WHERE w.design_id=$1 ORDER BY w.instance_id`,
      [designId]
    );
    return {
      design: metaRes.rows[0],
      widgets: widgetsRes.rows,
    };
  } else if (dbType === "sqlite") {
    const meta = await dbClient.get(
      `SELECT id, title, description, thumbnail, bg_color, bg_media_id, bg_media_url, created_at, updated_at, published_at, owner_id, version, is_draft FROM designer_designs WHERE id=? AND deleted_at IS NULL`,
      [designId]
    );
    if (!meta) return null;
    const rows = await dbClient.all(
      `SELECT w.instance_id, w.widget_id, w.x_percent, w.y_percent, w.w_percent, w.h_percent, w.z_index, w.rotation_deg, w.opacity, m.html, m.css, m.js, m.metadata FROM designer_design_widgets w LEFT JOIN designer_widget_meta m ON w.design_id = m.design_id AND w.instance_id = m.instance_id WHERE w.design_id=? ORDER BY w.instance_id`,
      [designId]
    );
    return { design: meta, widgets: rows };
  } else if (dbType === "mongo" || dbType === "mongodb") {
    const objId =
      designId && ObjectId.isValid(designId) ? new ObjectId(designId) : null;
    if (!objId) return null;
    const designs = dbClient.collection("designer_designs");
    const widgetsCol = dbClient.collection("designer_design_widgets");
    const design = await designs.findOne({
      _id: objId,
      deleted_at: { $exists: false },
    });
    if (!design) return null;
    const widgets = await widgetsCol
      .aggregate([
        { $match: { design_id: objId } },
        {
          $lookup: {
            from: "designer_widget_meta",
            let: { design_id: "$design_id", instance_id: "$instance_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$design_id", "$$design_id"] },
                      { $eq: ["$instance_id", "$$instance_id"] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  html: 1,
                  css: 1,
                  js: 1,
                  metadata: 1,
                },
              },
            ],
            as: "meta",
          },
        },
        { $unwind: { path: "$meta", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            instance_id: 1,
            widget_id: 1,
            x_percent: 1,
            y_percent: 1,
            w_percent: 1,
            h_percent: 1,
            z_index: 1,
            rotation_deg: 1,
            opacity: 1,
            html: "$meta.html",
            css: "$meta.css",
            js: "$meta.js",
            metadata: "$meta.metadata",
          },
        },
      ])
      .toArray();
    return { design: { ...design, id: String(design._id) }, widgets };
  } else {
    throw new Error("DESIGNER_GET_DESIGN not supported for this DB");
  }
}

async function handleListDesignsPlaceholder({ dbClient, params }) {
  const opts = params[0] || {};
  const includeDrafts = !!opts.includeDrafts;
  const dbType = (process.env.CONTENT_DB_TYPE || "").toLowerCase();

  if (dbType === "postgres") {
    const res = await dbClient.query(
      `SELECT id, title, description, thumbnail, bg_color, bg_media_id, bg_media_url, created_at, updated_at, published_at, owner_id, version, is_draft FROM designer.designer_designs WHERE deleted_at IS NULL ${includeDrafts ? "" : "AND (is_draft IS NULL OR is_draft = false)"} ORDER BY updated_at DESC;`
    );
    return res.rows;
  } else if (dbType === "sqlite") {
    const rows = await dbClient.all(
      `SELECT id, title, description, thumbnail, bg_color, bg_media_id, bg_media_url, created_at, updated_at, published_at, owner_id, version, is_draft FROM designer_designs WHERE deleted_at IS NULL ${includeDrafts ? "" : "AND (is_draft IS NULL OR is_draft = 0)"} ORDER BY updated_at DESC;`
    );
    return rows.map(r => ({ ...r, is_draft: !!r.is_draft }));
  } else if (dbType === "mongo" || dbType === "mongodb") {
    const coll = dbClient.collection("designer_designs");
    const query = { deleted_at: { $exists: false } };
    if (!includeDrafts) {
      query.$or = [{ is_draft: { $eq: false } }, { is_draft: { $exists: false } }];
    }
    const rows = await coll
      .find(query)
      .sort({ updated_at: -1 })
      .toArray();
    return rows.map(r => ({ ...r, id: String(r._id) }));
  } else {
    throw new Error("DESIGNER_LIST_DESIGNS not supported for this DB");
  }
}

module.exports = {
  handleSaveDesignPlaceholder,
  handleGetDesignPlaceholder,
  handleListDesignsPlaceholder,
};
