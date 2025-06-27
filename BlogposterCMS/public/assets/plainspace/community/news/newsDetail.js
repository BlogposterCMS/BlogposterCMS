'use strict';

/**
 * Admin‑/PlainSpace‑Widget: News‑Detailansicht
 * ------------------------------------------------------------
 * Erwartet ?id=<news_history.id> in der URL.
 * Greift über meltdownEmit("news.getById") auf das Backend zu.
 * Die gespeicherten Items enthalten ab jetzt **direkt geparstes JSON**
 * nach folgendem Schema (Kurzform):
 *   {
 *     assets: [
 *       {
 *         asset: "Brent-Öl" | "Spot-Gold" | …,
 *         news: [ { headline, source, timestamp, impact_score, probability, …} ],
 *         insider_rumors: [],
 *         current_price_usd: <number>,
 *         last_15min_trend_percent: <number>,
 *         priced_in: <bool>,
 *         potenzial_percent: <number>,
 *         recommendation: { … }
 *       }
 *     ],
 *     meta: { … }
 *   }
 * ------------------------------------------------------------
 */

import { sanitizeHtml } from '../../builder/editor/editor.js';

/* ---------------------------------------------------------- */
/*  Hilfsfunktionen                                          */
/* ---------------------------------------------------------- */

// Fischt das **erste** JSON‑Objekt aus einem evtl. verschachtelten String
function robustExtractJSON(str) {
  const match = str.match(/\{[\s\S]*}/);
  if (!match) throw new Error('No valid JSON found');
  return JSON.parse(match[0]);
}

function formatTimeAgo(unixTimestamp) {
  const diff = Math.floor(Date.now() / 1000) - Number(unixTimestamp);
  if (diff < 60) return `${diff} Sek.`;
  if (diff < 3600) return `${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} Std.`;
  const days = Math.floor(diff / 86400);
  return `${days} Tag${days > 1 ? 'e' : ''}`;
}

/* ---------------------------------------------------------- */
/*  Haupt‑Render Funktion                                     */
/* ---------------------------------------------------------- */

export async function render(el) {
  const meltdownEmit = window.meltdownEmit;
  const jwt          = window.ADMIN_TOKEN || window.PUBLIC_TOKEN;
  const params       = new URLSearchParams(window.location.search);
  const id           = Number(params.get('id'));

  if (!id) {
    el.textContent = 'Invalid news id';
    return;
  }

  // Basis‑Layout
  const card = document.createElement('div');
  card.className = 'news-detail-card';

  const title = document.createElement('h2');
  title.className = 'news-detail-title';
  title.textContent = 'News';
  card.appendChild(title);

  const content = document.createElement('div');
  content.className = 'news-json';
  card.appendChild(content);

  el.innerHTML = '';
  el.appendChild(card);

  /* -------------------------------------------------- */
  /*   Daten holen                                      */
  /* -------------------------------------------------- */
  try {
    const item = await meltdownEmit('news.getById', {
      jwt,
      moduleName: 'news',
      moduleType: 'community',
      id
    });

    if (!item) {
      content.textContent = 'News item not found.';
      return;
    }

    // Überschrift = Zeitstempel
    const date = item.created_at ? new Date(item.created_at * 1000) : new Date();
    title.textContent = date.toLocaleString();

    /* ---------------------------------------------- */
    /*   Cleaning / Parsing                           */
    /* ---------------------------------------------- */
    let parsed = null;
    let raw    = null;

    // Neuere Einträge: schon geparst
    if (item?.assets) {
      parsed = item;
    } else if (typeof item === 'string') {
      raw = item;
    } else if (item?.output) {
      const txt = item.output[1]?.content?.[0]?.text ||
                  item.output[0]?.content?.[0]?.text ||
                  item.output[0]?.text;
      raw = txt;
    }

    if (!parsed && typeof raw === 'string') {
      try {
        parsed = robustExtractJSON(raw);
      } catch (err) {
        console.error('JSON-Parsing-Fehler:', err);
        content.innerHTML = `<pre>Ungültiges JSON:\n${sanitizeHtml(raw)}</pre>`;
        return;
      }
    }

    /* ---------------------------------------------- */
    /*   Darstellung                                  */
    /* ---------------------------------------------- */
    if (parsed?.assets) {
      content.innerHTML = '';
      renderAssets(parsed.assets, content);
    } else {
      // Fallback – rohes JSON
      content.innerHTML = `<pre>${sanitizeHtml(JSON.stringify(parsed || raw, null, 2))}</pre>`;
    }

  } catch (err) {
    console.error('Fehler:', err);
    content.textContent = 'Fehler: ' + err.message;
  }
}

/* ---------------------------------------------------------- */
/*  Assets‑Renderer                                           */
/* ---------------------------------------------------------- */

function renderAssets(assets, parent) {
  assets.forEach(asset => {
    const section = document.createElement('section');
    section.className = 'news-asset';

    /* --- Kopf --------------------------------------------------------- */
    const h3 = document.createElement('h3');
    h3.className = 'news-asset-name';
    h3.textContent = asset.asset;
    section.appendChild(h3);

    /* --- News Headlines ---------------------------------------------- */
    if (Array.isArray(asset.news) && asset.news.length) {
      const ul = document.createElement('ul');
      ul.className = 'asset-news';

      asset.news.forEach(n => {
        const li = document.createElement('li');

        const headline = document.createElement('div');
        headline.className = 'headline';
        headline.textContent = n.headline;
        li.appendChild(headline);

        const meta = document.createElement('div');
        meta.className = 'news-meta';
        meta.innerHTML = `
          <strong>Quelle:</strong> ${n.source}<br>
          <strong>Alter:</strong> ${formatTimeAgo(Number(n.timestamp))}<br>
          <strong>Einfluss:</strong> ${n.impact_score}<br>
          <strong>W'keit:</strong> ${n.probability}%<br>
          <strong>Ampel:</strong> ${n.ampel}
        `;
        li.appendChild(meta);
        ul.appendChild(li);
      });

      section.appendChild(ul);
    }

    /* --- Insider‑Rumors ---------------------------------------------- */
    if (asset.insider_rumors?.length) {
      const rumorBlock = document.createElement('div');
      rumorBlock.className = 'rumors-section';
      rumorBlock.innerHTML = `<h4>Insider‑Rumors</h4><ul>${asset.insider_rumors.map(r => `<li>${r}</li>`).join('')}</ul>`;
      section.appendChild(rumorBlock);
    }

    /* --- Kennzahlen --------------------------------------------------- */
    const details = document.createElement('div');
    details.className = 'asset-details';
    details.innerHTML = `
      <p><strong>Kurs (USD):</strong> ${asset.current_price_usd}</p>
      <p><strong>Trend 15 Min (%):</strong> ${asset.last_15min_trend_percent}</p>
      <p><strong>Eingepreist:</strong> ${asset.priced_in ? 'Ja' : 'Nein'}</p>
      <p><strong>Rest‑Potenzial (%):</strong> ${asset.potenzial_percent}</p>
    `;
    section.appendChild(details);

    /* --- Empfehlung --------------------------------------------------- */
    const r = asset.recommendation || {};
    const rec = document.createElement('div');
    rec.className = 'asset-recommendation';
    rec.innerHTML = `
      <h4>Handelsempfehlung</h4>
      <p><strong>Richtung:</strong> ${r.richtung}</p>
      <p><strong>Zeithorizont:</strong> ${r.zeithorizont}</p>
      <p><strong>Chance:</strong> ${r.chance_percent}%</p>
      <p><strong>Grund:</strong> ${r.grund}</p>
      <p><strong>Entry:</strong> ${r.entry_range_usd?.from} – ${r.entry_range_usd?.to}</p>
      <p><strong>SL / TP:</strong> ${r.stop_loss_usd} / ${r.take_profit_usd}</p>
      <p><strong>CRV:</strong> ${r.crv} &nbsp;|&nbsp; <strong>Ticks:</strong> ${r.ticks_duration}</p>
    `;
    section.appendChild(rec);

    parent.appendChild(section);
  });
}
