'use strict';

const { ObjectId } = require('mongodb');

const REDIRECT_PLACEHOLDERS = new Set([
  'INIT_REDIRECT_SCHEMA',
  'INIT_REDIRECT_TABLES',
  'UPSERT_REDIRECT_RULE',
  'GET_REDIRECT_RULE',
  'LIST_REDIRECT_RULES',
  'DELETE_REDIRECT_RULE',
  'RESOLVE_REDIRECT',
  'RECORD_REDIRECT_HIT',
  'LIST_REDIRECT_HITS'
]);

function isRedirectPlaceholder(operation) {
  return REDIRECT_PLACEHOLDERS.has(operation);
}

function paramsObject(params) {
  return Array.isArray(params) ? (params[0] || {}) : (params || {});
}

function jsonString(value, fallback = {}) {
  return JSON.stringify((typeof value === 'undefined' ? fallback : value) ?? fallback);
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    fromPath: row.from_path,
    toPath: row.to_path,
    statusCode: row.status_code,
    matchType: row.match_type,
    hitCount: row.hit_count,
    lastHitAt: row.last_hit_at,
    startAt: row.start_at,
    endAt: row.end_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    active: row.active === true || row.active === 1,
    meta: parseJson(row.meta, {})
  }));
}

function normalizeHitRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    ruleId: row.rule_id,
    fromPath: row.from_path,
    userAgentHash: row.user_agent_hash,
    createdAt: row.created_at
  }));
}

function mongoDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.fromPath = out.from_path;
  out.toPath = out.to_path;
  out.statusCode = out.status_code;
  out.matchType = out.match_type;
  out.hitCount = out.hit_count;
  out.lastHitAt = out.last_hit_at;
  out.startAt = out.start_at;
  out.endAt = out.end_at;
  out.createdAt = out.created_at;
  out.updatedAt = out.updated_at;
  out.active = out.active !== false;
  return out;
}

function mongoHitDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.ruleId = out.rule_id;
  out.fromPath = out.from_path;
  out.userAgentHash = out.user_agent_hash;
  out.createdAt = out.created_at;
  return out;
}

function sqliteListWhere(p) {
  const where = [];
  const values = [];
  if (typeof p.active === 'boolean') {
    where.push('active = ?');
    values.push(p.active ? 1 : 0);
  }
  if (p.language) {
    where.push('language = ?');
    values.push(p.language);
  }
  if (p.matchType) {
    where.push('match_type = ?');
    values.push(p.matchType);
  }
  return { where: where.length ? where.join(' AND ') : '1 = 1', values };
}

function postgresWhereBuilder() {
  const values = [];
  const add = value => {
    values.push(value);
    return `$${values.length}`;
  };
  return { values, add };
}

async function handleRedirectSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_REDIRECT_SCHEMA':
      return { done: true };

    case 'INIT_REDIRECT_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS redirectManager_redirect_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_path TEXT NOT NULL,
          to_path TEXT NOT NULL,
          status_code INTEGER NOT NULL DEFAULT 301,
          match_type TEXT NOT NULL DEFAULT 'exact',
          priority INTEGER DEFAULT 0,
          language TEXT DEFAULT '',
          active INTEGER DEFAULT 1,
          start_at DATETIME,
          end_at DATETIME,
          hit_count INTEGER DEFAULT 0,
          last_hit_at DATETIME,
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(from_path, language)
        );

        CREATE TABLE IF NOT EXISTS redirectManager_redirect_hits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rule_id INTEGER,
          from_path TEXT NOT NULL,
          user_agent_hash TEXT DEFAULT '',
          referer TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(rule_id) REFERENCES redirectManager_redirect_rules(id) ON DELETE SET NULL
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS redirect_rules_lookup ON redirectManager_redirect_rules(active, language, match_type, priority);');
      await db.run('CREATE INDEX IF NOT EXISTS redirect_hits_rule_created ON redirectManager_redirect_hits(rule_id, created_at DESC);');
      return { done: true };

    case 'UPSERT_REDIRECT_RULE':
      await db.run(`
        INSERT INTO redirectManager_redirect_rules
          (from_path, to_path, status_code, match_type, priority, language, active,
           start_at, end_at, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(from_path, language) DO UPDATE SET
          to_path=excluded.to_path,
          status_code=excluded.status_code,
          match_type=excluded.match_type,
          priority=excluded.priority,
          active=excluded.active,
          start_at=excluded.start_at,
          end_at=excluded.end_at,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [
        p.fromPath,
        p.toPath,
        Number(p.statusCode) || 301,
        p.matchType || 'exact',
        Number(p.priority) || 0,
        p.language || '',
        p.active === false ? 0 : 1,
        p.startAt || null,
        p.endAt || null,
        jsonString(p.meta, {})
      ]);
      return normalizeRows(await db.get(
        'SELECT * FROM redirectManager_redirect_rules WHERE from_path = ? AND language = ?',
        [p.fromPath, p.language || '']
      ))[0] || null;

    case 'GET_REDIRECT_RULE':
      if (p.id) {
        return normalizeRows(await db.get('SELECT * FROM redirectManager_redirect_rules WHERE id = ?', [p.id]))[0] || null;
      }
      return normalizeRows(await db.get(
        'SELECT * FROM redirectManager_redirect_rules WHERE from_path = ? AND language = ?',
        [p.fromPath, p.language || '']
      ))[0] || null;

    case 'LIST_REDIRECT_RULES': {
      const built = sqliteListWhere(p);
      built.values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeRows(await db.all(`
        SELECT * FROM redirectManager_redirect_rules
         WHERE ${built.where}
         ORDER BY priority DESC, updated_at DESC, id DESC
         LIMIT ? OFFSET ?;
      `, built.values));
    }

    case 'DELETE_REDIRECT_RULE':
      if (p.id) {
        await db.run('DELETE FROM redirectManager_redirect_rules WHERE id = ?', [p.id]);
        return { done: true, id: p.id };
      }
      await db.run('DELETE FROM redirectManager_redirect_rules WHERE from_path = ? AND language = ?', [p.fromPath, p.language || '']);
      return { done: true, fromPath: p.fromPath, language: p.language || '' };

    case 'RESOLVE_REDIRECT': {
      const values = [];
      let languageWhere = "language = ''";
      if (p.language) {
        languageWhere = "(language = '' OR language = ?)";
        values.push(p.language);
      }
      values.push(p.now, p.now, Number(p.limit) || 200);
      return normalizeRows(await db.all(`
        SELECT * FROM redirectManager_redirect_rules
         WHERE active = 1
           AND ${languageWhere}
           AND (start_at IS NULL OR start_at <= ?)
           AND (end_at IS NULL OR end_at > ?)
         ORDER BY priority DESC, length(from_path) DESC, id DESC
         LIMIT ?;
      `, values));
    }

    case 'RECORD_REDIRECT_HIT':
      await db.run(`
        INSERT INTO redirectManager_redirect_hits(rule_id, from_path, user_agent_hash, referer, created_at)
        VALUES(?,?,?,?,CURRENT_TIMESTAMP);
      `, [p.ruleId || null, p.fromPath || '', p.userAgentHash || '', p.referer || '']);
      if (p.ruleId) {
        await db.run(`
          UPDATE redirectManager_redirect_rules
             SET hit_count = COALESCE(hit_count, 0) + 1,
                 last_hit_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?;
        `, [p.ruleId]);
      }
      return { done: true, ruleId: p.ruleId || null, fromPath: p.fromPath || '' };

    case 'LIST_REDIRECT_HITS': {
      const where = [];
      const values = [];
      if (p.ruleId) {
        where.push('rule_id = ?');
        values.push(p.ruleId);
      }
      if (p.fromPath) {
        where.push('from_path = ?');
        values.push(p.fromPath);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeHitRows(await db.all(`
        SELECT * FROM redirectManager_redirect_hits
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?;
      `, values));
    }

    default:
      return null;
  }
}

async function handleRedirectPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_REDIRECT_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS redirectManager;');
      return { done: true };

    case 'INIT_REDIRECT_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS redirectManager.redirect_rules (
          id SERIAL PRIMARY KEY,
          from_path TEXT NOT NULL,
          to_path TEXT NOT NULL,
          status_code INTEGER NOT NULL DEFAULT 301,
          match_type TEXT NOT NULL DEFAULT 'exact',
          priority INTEGER DEFAULT 0,
          language TEXT DEFAULT '',
          active BOOLEAN DEFAULT true,
          start_at TIMESTAMP,
          end_at TIMESTAMP,
          hit_count INTEGER DEFAULT 0,
          last_hit_at TIMESTAMP,
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(from_path, language)
        );

        CREATE TABLE IF NOT EXISTS redirectManager.redirect_hits (
          id SERIAL PRIMARY KEY,
          rule_id INTEGER REFERENCES redirectManager.redirect_rules(id) ON DELETE SET NULL,
          from_path TEXT NOT NULL,
          user_agent_hash TEXT DEFAULT '',
          referer TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS redirect_rules_lookup ON redirectManager.redirect_rules(active, language, match_type, priority);');
      await client.query('CREATE INDEX IF NOT EXISTS redirect_hits_rule_created ON redirectManager.redirect_hits(rule_id, created_at DESC);');
      return { done: true };

    case 'UPSERT_REDIRECT_RULE': {
      const { rows } = await client.query(`
        INSERT INTO redirectManager.redirect_rules
          (from_path, to_path, status_code, match_type, priority, language, active,
           start_at, end_at, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
        ON CONFLICT(from_path, language) DO UPDATE SET
          to_path=EXCLUDED.to_path,
          status_code=EXCLUDED.status_code,
          match_type=EXCLUDED.match_type,
          priority=EXCLUDED.priority,
          active=EXCLUDED.active,
          start_at=EXCLUDED.start_at,
          end_at=EXCLUDED.end_at,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [
        p.fromPath,
        p.toPath,
        Number(p.statusCode) || 301,
        p.matchType || 'exact',
        Number(p.priority) || 0,
        p.language || '',
        p.active !== false,
        p.startAt || null,
        p.endAt || null,
        jsonString(p.meta, {})
      ]);
      return normalizeRows(rows)[0] || null;
    }

    case 'GET_REDIRECT_RULE': {
      if (p.id) {
        const { rows } = await client.query('SELECT * FROM redirectManager.redirect_rules WHERE id = $1', [p.id]);
        return normalizeRows(rows)[0] || null;
      }
      const { rows } = await client.query(
        'SELECT * FROM redirectManager.redirect_rules WHERE from_path = $1 AND language = $2',
        [p.fromPath, p.language || '']
      );
      return normalizeRows(rows)[0] || null;
    }

    case 'LIST_REDIRECT_RULES': {
      const built = postgresWhereBuilder();
      const where = [];
      if (typeof p.active === 'boolean') where.push(`active = ${built.add(p.active)}`);
      if (p.language) where.push(`language = ${built.add(p.language)}`);
      if (p.matchType) where.push(`match_type = ${built.add(p.matchType)}`);
      const limitRef = built.add(Number(p.limit) || 50);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM redirectManager.redirect_rules
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY priority DESC, updated_at DESC, id DESC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeRows(rows);
    }

    case 'DELETE_REDIRECT_RULE':
      if (p.id) {
        await client.query('DELETE FROM redirectManager.redirect_rules WHERE id = $1', [p.id]);
        return { done: true, id: p.id };
      }
      await client.query('DELETE FROM redirectManager.redirect_rules WHERE from_path = $1 AND language = $2', [p.fromPath, p.language || '']);
      return { done: true, fromPath: p.fromPath, language: p.language || '' };

    case 'RESOLVE_REDIRECT': {
      const built = postgresWhereBuilder();
      let languageWhere = "language = ''";
      if (p.language) {
        languageWhere = `(language = '' OR language = ${built.add(p.language)})`;
      }
      const nowStartRef = built.add(p.now);
      const nowEndRef = built.add(p.now);
      const limitRef = built.add(Number(p.limit) || 200);
      const { rows } = await client.query(`
        SELECT * FROM redirectManager.redirect_rules
         WHERE active = true
           AND ${languageWhere}
           AND (start_at IS NULL OR start_at <= ${nowStartRef})
           AND (end_at IS NULL OR end_at > ${nowEndRef})
         ORDER BY priority DESC, char_length(from_path) DESC, id DESC
         LIMIT ${limitRef};
      `, built.values);
      return normalizeRows(rows);
    }

    case 'RECORD_REDIRECT_HIT':
      await client.query(`
        INSERT INTO redirectManager.redirect_hits(rule_id, from_path, user_agent_hash, referer, created_at)
        VALUES($1,$2,$3,$4,NOW());
      `, [p.ruleId || null, p.fromPath || '', p.userAgentHash || '', p.referer || '']);
      if (p.ruleId) {
        await client.query(`
          UPDATE redirectManager.redirect_rules
             SET hit_count = COALESCE(hit_count, 0) + 1,
                 last_hit_at = NOW(),
                 updated_at = NOW()
           WHERE id = $1;
        `, [p.ruleId]);
      }
      return { done: true, ruleId: p.ruleId || null, fromPath: p.fromPath || '' };

    case 'LIST_REDIRECT_HITS': {
      const built = postgresWhereBuilder();
      const where = [];
      if (p.ruleId) where.push(`rule_id = ${built.add(p.ruleId)}`);
      if (p.fromPath) where.push(`from_path = ${built.add(p.fromPath)}`);
      const limitRef = built.add(Number(p.limit) || 50);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM redirectManager.redirect_hits
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeHitRows(rows);
    }

    default:
      return null;
  }
}

function mongoIdQuery(id) {
  if (ObjectId.isValid(id)) return { _id: new ObjectId(id) };
  return { id };
}

async function handleRedirectMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_REDIRECT_SCHEMA':
      return { done: true };

    case 'INIT_REDIRECT_TABLES':
      await db.createCollection('redirect_rules').catch(() => {});
      await db.createCollection('redirect_hits').catch(() => {});
      await db.collection('redirect_rules').createIndex({ from_path: 1, language: 1 }, { unique: true }).catch(() => {});
      await db.collection('redirect_rules').createIndex({ active: 1, language: 1, match_type: 1, priority: -1 }).catch(() => {});
      await db.collection('redirect_hits').createIndex({ rule_id: 1, created_at: -1 }).catch(() => {});
      return { done: true };

    case 'UPSERT_REDIRECT_RULE':
      await db.collection('redirect_rules').updateOne(
        { from_path: p.fromPath, language: p.language || '' },
        {
          $set: {
            from_path: p.fromPath,
            to_path: p.toPath,
            status_code: Number(p.statusCode) || 301,
            match_type: p.matchType || 'exact',
            priority: Number(p.priority) || 0,
            language: p.language || '',
            active: p.active !== false,
            start_at: p.startAt || null,
            end_at: p.endAt || null,
            meta: p.meta || {},
            updated_at: new Date().toISOString()
          },
          $setOnInsert: {
            _id: new ObjectId(),
            hit_count: 0,
            last_hit_at: null,
            created_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('redirect_rules').findOne({ from_path: p.fromPath, language: p.language || '' }));

    case 'GET_REDIRECT_RULE':
      if (p.id) {
        return mongoDoc(await db.collection('redirect_rules').findOne(mongoIdQuery(p.id)));
      }
      return mongoDoc(await db.collection('redirect_rules').findOne({ from_path: p.fromPath, language: p.language || '' }));

    case 'LIST_REDIRECT_RULES': {
      const query = {};
      if (typeof p.active === 'boolean') query.active = p.active;
      if (p.language) query.language = p.language;
      if (p.matchType) query.match_type = p.matchType;
      return (await db.collection('redirect_rules')
        .find(query)
        .sort({ priority: -1, updated_at: -1, _id: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(mongoDoc);
    }

    case 'DELETE_REDIRECT_RULE':
      if (p.id) {
        await db.collection('redirect_rules').deleteOne(mongoIdQuery(p.id));
        return { done: true, id: p.id };
      }
      await db.collection('redirect_rules').deleteOne({ from_path: p.fromPath, language: p.language || '' });
      return { done: true, fromPath: p.fromPath, language: p.language || '' };

    case 'RESOLVE_REDIRECT': {
      const and = [
        { active: true },
        p.language ? { language: { $in: ['', p.language] } } : { language: '' },
        { $or: [{ start_at: null }, { start_at: '' }, { start_at: { $lte: p.now } }] },
        { $or: [{ end_at: null }, { end_at: '' }, { end_at: { $gt: p.now } }] }
      ];
      const rows = await db.collection('redirect_rules')
        .find({ $and: and })
        .sort({ priority: -1, _id: -1 })
        .limit(Number(p.limit) || 200)
        .toArray();
      return rows
        .map(mongoDoc)
        .sort((a, b) => (b.priority - a.priority) || String(b.from_path || '').length - String(a.from_path || '').length);
    }

    case 'RECORD_REDIRECT_HIT':
      await db.collection('redirect_hits').insertOne({
        _id: new ObjectId(),
        rule_id: p.ruleId || null,
        from_path: p.fromPath || '',
        user_agent_hash: p.userAgentHash || '',
        referer: p.referer || '',
        created_at: new Date().toISOString()
      });
      if (p.ruleId) {
        await db.collection('redirect_rules').updateOne(
          mongoIdQuery(p.ruleId),
          {
            $inc: { hit_count: 1 },
            $set: {
              last_hit_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          }
        );
      }
      return { done: true, ruleId: p.ruleId || null, fromPath: p.fromPath || '' };

    case 'LIST_REDIRECT_HITS': {
      const query = {};
      if (p.ruleId) query.rule_id = p.ruleId;
      if (p.fromPath) query.from_path = p.fromPath;
      return (await db.collection('redirect_hits')
        .find(query)
        .sort({ created_at: -1, _id: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(mongoHitDoc);
    }

    default:
      return null;
  }
}

module.exports = {
  handleRedirectMongo,
  handleRedirectPostgres,
  handleRedirectSqlite,
  isRedirectPlaceholder
};
