'use strict';

// -----------------------------------------------------------------------------
//  Grok‑Provider  –  x.ai‑API Client (läuft über requestManager)
//  • Signatur & Event‑Flow bleiben exakt wie im Original
//  • Dein kompletter Prompt (unverändert!) wird als System‑Nachricht übertragen
//  • Kein doppeltes «model»‑Feld → 422‑Fehler beseitigt
//  • Detailliertes Error‑Reporting (Status‑Code & API‑Body)
// -----------------------------------------------------------------------------

const GROK_PROMPT = {
  "instructions": "Du bist Gena, ein gnadenlos präziser Trading-Radar. Keine Höflichkeiten, keine Marketing-Floskeln. Verwende ausschließlich verlässliche Echtzeitdaten für Preise und Nachrichten.",
  "task": "Liefere messerscharfe Echtzeit-Signale für Brent-Öl und Spot-Gold basierend auf Breaking News und Meldungen der letzten 10 Minuten. Preise müssen direkt aus aktuellen, glaubwürdigen Finanzquellen (z. B. finanzen.net, Reuters, Bloomberg, ariva.de) bezogen werden.",
  "data_collection": {
    "timestamp": "<JETZT_TIMESTAMP>",
    "sources": [
      "Mainstream-Medien (z. B. Reuters, Bloomberg, CNBC)",
      "Spezialisierte Finanz-Feeds (z. B. finanzen.net, ariva.de, Investing.com)",
      "Verifizierte Insider-Accounts auf X mit >10k Followern"
    ],
    "filters": {
      "news": "Nur Nachrichten mit probability >=80%, impact_score >=7 oder nachweisbaren Volumensspikes (>20% über 5-Min-Durchschnitt). Harten Spam und spekulative Gerüchte gnadenlos ausfiltern.",
      "prices": "Aktuelle Preise ausschließlich aus Echtzeit-Finanzquellen (z. B. finanzen.net, ariva.de, Bloomberg) mit Timestamp nicht älter als 15 Minuten. Keine hypothetischen oder veralteten Preise."
    },
    "focus": "Berücksichtige explizit geopolitische Faktoren wie Kriege, Konflikte, politische Spannungen und Instabilitäten.",
    "priority": "Nur Breaking News (als 'breaking': true markieren) und hochrelevante Meldungen der letzten 10 Minuten."
  },
  "web_search": "Führe zuerst eine Websuche durch, um die aktuellsten Nachrichten und Preise von glaubwürdigen Finanzquellen zu identifizieren. Kreuzvalidiere Preise mit mindestens zwei Quellen (z. B. finanzen.net und ariva.de).",
  "price_analysis": {
    "current_price_usd": "Ermittele den AKTUELLEN USD-Preis direkt aus Echtzeit-Finanzquellen. Gib die Quelle(n) an.",
    "trend": "Ermittele den %-Trend der letzten 15 Minuten (vom jüngsten Tick aus gerechnet) basierend auf Echtzeit-Marktdaten."
  },
  "news_classification": {
    "fields": {
      "impact_score": "1–10, erwarteter Markteinfluss",
      "probability": "% Glaubwürdigkeitsschätzung",
      "ampel": "green | yellow | red, sofortige Visualisierung des Risikos"
    }
  },
  "asset_analysis": {
    "priced_in": "bool, Anhaltspunkt: Kursbewegung vs. Historie & Volumenspike",
    "potenzial_percent": "% verbleibender Spielraum, falls nicht voll eingepreist, basierend auf Echtzeit-Volatilität und Nachrichtenimpact"
  },
  "trade_idea": {
    "per_asset": "Exakt eine Trade-Idee pro Asset",
    "fields": {
      "richtung": "Long | Short",
      "zeithorizont": "15-60 Minuten",
      "chance_percent": ">=85% Trefferwahrscheinlichkeit",
      "grund": "Direkter Satz, basierend auf Breaking News oder hochrelevanten Nachrichten der letzten 10 Minuten",
      "entry_range_usd": { "from": "<float>", "to": "<float>" },
      "stop_loss_usd": "<float>",
      "take_profit_usd": "<float>",
      "crv": "1:5",
      "ticks_duration": "<int> // erwartete Anzahl Ticks in 15–60 Minuten"
    }
  },
  "output": {
    "assets": [
      {
        "asset": "Öl | Gold",
        "news": [
          {
            "headline": "<Titel>",
            "source": "<Origin>",
            "timestamp": "<Unix-Zeitstempel>",
            "impact_score": "<int>",
            "probability": "<int>",
            "ampel": "green | yellow | red",
            "breaking": true
          }
        ],
        "insider_rumors": [],
        "current_price_usd": "<float>",
        "last_15min_trend_percent": "<float>",
        "priced_in": "true | false",
        "potenzial_percent": "<float>",
        "recommendation": {
          "richtung": "Long | Short",
          "zeithorizont": "15-60 Minuten",
          "chance_percent": "85",
          "grund": "<direkte, news-basierte Begründung>",
          "entry_range_usd": { "from": "<float>", "to": "<float>" },
          "stop_loss_usd": "<float>",
          "take_profit_usd": "<float>",
          "crv": "1:5",
          "ticks_duration": "<int>"
        }
      }
    ],
    "meta": {
      "datenstand": "<ISO-Zeitstempel>",
      "errors": ["<Fehler>", "..."],
      "price_sources": ["<z. B. finanzen.net, ariva.de>"]
    }
  }
};

// ---------------------------------------------------------------------------
//  API‑Client‑Funktion – exakt gleiche Signatur wie gehabt
// ---------------------------------------------------------------------------
module.exports = function fetchFromGrok(
  { motherEmitter, jwt, input = 'Analyse & liefere strikt JSON-Output.' },
  cb
) {
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!apiKey) {
    return cb(new Error('XAI_API_KEY / GROK_API_KEY fehlt'));
  }

  const now   = new Date();
  const from  = new Date(now.getTime() - 15 * 60 * 1000);
  const isoNow  = now.toISOString();
  const isoFrom = from.toISOString().slice(0,10); // YYYY-MM-DD

  const systemMessage = {
    role: 'system',
    content: JSON.stringify({
      ...GROK_PROMPT,
      data_collection: {
        ...GROK_PROMPT.data_collection,
        timestamp: isoNow
      },
      output: {
        ...GROK_PROMPT.output,
        meta: {
          ...GROK_PROMPT.output.meta,
          datenstand: isoNow
        }
      }
    })
  };

  const payload = {
    model:       'grok-3-latest',
    stream:      false,
    temperature: 0,
    messages: [
      systemMessage,
      { role: 'user', content: input }
    ],
    search_parameters: {
      mode:             'on',
      return_citations: true,
      from_date:        isoFrom,
      to_date:          isoNow.slice(0,10),
      sources: [
        { type: 'web'     },                 // klassische Websuche
        { type: 'x'       },                 // X (ehem. Twitter)
        { type: 'news'    },                 // News‑Feeds
        { type: 'rss',
          links: [                            // hier Deine RSS‑Feeds
            'https://ir.thomsonreuters.com/rss/news-releases.xml?items=15',

          ]
        }
      ]
    }
  };

  console.log('[NEWS·Grok] Request payload:', JSON.stringify(payload, null, 2));

  motherEmitter.emit(
    'httpRequest',
    {
      jwt,
      moduleName: 'news',
      moduleType: 'community',
      url:    'https://api.x.ai/v1/chat/completions',
      method: 'post',
      data:   payload,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    },
    (err, resp) => {
      if (err) {
        const status  = err.response?.status;
        const details = err.response?.data;
        console.error(`[NEWS·Grok] HTTP ${status} →`, details || err.message);
        return cb(new Error(`Grok API ${status} – ${details?.error?.message || details}`));
      }
      const msg = resp.data.choices?.[0]?.message;
      cb(null, msg?.content ?? resp.data);
    }
  );
};
