/*
 * News‑Modul – 2025‑06‑27
 * --------------------------------------------------------------
 *  ▸ Trennt Core‑Felder (predictions_core) von Raw‑Payload (predictions_raw)
 *  ▸ Behält *news_history* als Kompatibilitätsschicht (nur Raw‑Blob)
 *  ▸ Events `news.listHistory`, `news.getLatest`, `news.getById` lesen jetzt
 *    aus den neuen Tabellen (JOIN) – UI sieht wieder Daten.
 * --------------------------------------------------------------
*/
'use strict';
const crypto       = require('crypto');
const path         = require('path');
const providers    = { chatgpt: require('./ai/chatgpt'), grok: require('./ai/grok') };

// --------------------------------------------------------------
//  Aktives Modell ermitteln
// --------------------------------------------------------------
const DEFAULT_MODEL = 'grok';
let activeModel = (process.env.NEWS_MODEL || DEFAULT_MODEL).toLowerCase();
if (!providers[activeModel]) activeModel = DEFAULT_MODEL;
function setActiveModel(name='') {
  name = String(name).toLowerCase();
  if (providers[name]) { activeModel = name; return true; }
  return false;
}

// --------------------------------------------------------------
//  Initialisierung
// --------------------------------------------------------------
module.exports = {
  async initialize({ motherEmitter, jwt }) {
    console.log('[NEWS MODULE] Booting with model →', activeModel);
    await ensureDatabase(motherEmitter, jwt);

    let cronTimer = null;
    let lastResponseId = null;

    // ----------------------------------------------------------
    //  Persist‑Helper
    // ----------------------------------------------------------
    async function persist(rawString, parsed, promptHash) {
      const ts   = Math.floor(Date.now()/1000);
      const ok   = !!parsed && Array.isArray(parsed.assets);

      /* RAW ▸ predictions_raw */
      const rawRes = await db(`INSERT INTO predictions_raw (ts_open, raw_response, parse_ok, prompt_hash)
                               VALUES ($1,$2,$3,$4) RETURNING id`,
                               [ts, rawString, ok, promptHash]);
      const rawId  = rawRes?.rows?.[0]?.id;

      /* Abwärtskompatibilität */
      await db(`INSERT INTO news_history(data, created_at) VALUES($1,$2)`, [rawString, ts]);

      if (!ok) return; // parse failed

      for (const a of parsed.assets) {
        const rec = a.recommendation || {};
        if (!rec.entry_range_usd) continue;
        const dir = /^l/i.test(rec.richtung||'') ? 'L' : 'S';
        const horizon = Number((rec.zeithorizont||'').match(/\d+/)?.[0] || 0);
        await db(`INSERT INTO predictions_core (raw_id, asset, direction, entry_from, entry_to, sl, tp, horizon_min, meta)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                  [rawId, a.asset, dir, rec.entry_range_usd.from, rec.entry_range_usd.to,
                   rec.stop_loss_usd, rec.take_profit_usd, horizon, JSON.stringify(a)]);
      }
    }

    // ----------------------------------------------------------
    //  Fetch & Process
    // ----------------------------------------------------------
    function fetchNews(input='analyse jetzt json only', cb) {
      const ts      = Math.floor(Date.now()/1000);
      const prompt  = `${input}\nAktueller Unix-Zeitstempel: ${ts}`;
      const pHash   = crypto.createHash('sha256').update(prompt).digest('hex');

      providers[activeModel]({ motherEmitter, jwt, input: prompt, lastResponseId }, async (err, data) => {
        if (err) { console.error('[NEWS] Provider‑Fehler', err); return cb?.(err); }
        const rawString = typeof data === 'string' ? data : JSON.stringify(data);
        let parsed=null;
        try {
          if (typeof data==='string') parsed = JSON.parse(data);
          else if (data?.choices) parsed = JSON.parse(data.choices[0]?.message?.content||'');
        }catch{/* noop */}
        await persist(rawString, parsed, pHash);
        cb?.(null, parsed||rawString);
      });
    }

    // ----------------------------------------------------------
    //  Event‑Wiring
    // ----------------------------------------------------------
    const on=(e,f)=>{ if(!motherEmitter.listenerCount(e)) motherEmitter.on(e,f); };
    on('news.fetchNow', (p,cb)=>fetchNews(p?.input,cb));
    on('news.setCron',  (p,cb)=>{ if(cronTimer)clearInterval(cronTimer); const ms=(p?.minutes||0)*60000; cronTimer=ms?setInterval(()=>fetchNews(),ms):null; cb?.(null,{active:!!cronTimer});});
    on('news.setModel', (p,cb)=>{const ok=setActiveModel(p?.model);cb?.(ok?null:new Error('unknown model'),{activeModel});});

    /* History (neu) */
    on('news.listHistory', (p,cb)=> db(`SELECT pr.id, pr.ts_open, pr.parse_ok,
                                               pc.asset, pc.direction, pc.entry_from, pc.entry_to,
                                               pc.sl, pc.tp, pc.horizon_min
                                        FROM predictions_raw pr
                                        LEFT JOIN predictions_core pc ON pc.raw_id=pr.id
                                        ORDER BY pr.ts_open DESC LIMIT $1`,
                                        [Number(p?.limit||10)]).then(r=>cb(null,r?.rows||[])).catch(cb));

    on('news.getById', (p,cb)=> db(`SELECT * FROM predictions_raw WHERE id=$1`,[Number(p?.id)]).then(async r=>{
      if(!r?.rows?.length) return cb(null,null);
      const raw = r.rows[0];
      const core = await db(`SELECT * FROM predictions_core WHERE raw_id=$1`, [raw.id]);
      cb(null, { raw, core: core?.rows || [] });
    }).catch(cb));

    on('news.getLatest',(_p,cb)=> db(`SELECT pr.*, pc.*
                                      FROM predictions_raw pr
                                      LEFT JOIN predictions_core pc ON pc.raw_id=pr.id
                                      ORDER BY pr.ts_open DESC LIMIT 1`).then(r=>cb(null,r?.rows?.[0]||null)).catch(cb));
  }
};

// --------------------------------------------------------------
//  Hilfs‑DB‑Wrapper
// --------------------------------------------------------------
let db = () => Promise.reject(new Error('DB not initialized'));

function createDbHelper(motherEmitter, dbArgs) {
  return function(sql, params = []) {
    return new Promise((res, rej) => {
      motherEmitter.emit(
        'performDbOperation',
        { ...dbArgs, operation: sql, params },
        (e, r) => (e ? rej(e) : res(r))
      );
    });
  };
}

async function ensureDatabase(motherEmitter, jwt) {
  const dbArgs = { jwt, moduleName: 'news', moduleType: 'community' };
  db = createDbHelper(motherEmitter, dbArgs);

  await new Promise((res, rej) => {
    motherEmitter.emit('createDatabase', { jwt, moduleName: 'news', moduleType: 'community' }, (e, info) => e ? rej(e) : res(info));
  });

  const schemaPath = path.join(__dirname, 'dbSchema.json');
  await new Promise((res, rej) => {
    motherEmitter.emit('applySchemaFile', { jwt, moduleName: 'news', moduleType: 'community', filePath: schemaPath }, (e, r) => e ? rej(e) : res(r));
  });
}
