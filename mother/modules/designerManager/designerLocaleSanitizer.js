'use strict';

const { localeDesign, localeWidget, readDesignLocalizations, resolveDesignLocale, saveDesignLocale } = require('../../../ui/shared/localization/designLocaleModel.js');

/** Locale content crosses exactly the same sanitizer as the base design before a versioned save. */
function sanitizeDesignLocalizations(layout, design, widgets, cleanWidgets, sanitizeColor, sanitizeUrl) {
  const localizations = readDesignLocalizations(layout);
  if (!layout?.localizations) return layout;
  const base = localeDesign({ design, widgets, layout });
  const sanitize = selected => {
    if (!selected || !Array.isArray(selected.widgets) || selected.widgets.length > 1000 || !selected.styles || (selected.layout && typeof selected.layout !== 'object')) throw new Error('DESIGN_LOCALE_DOCUMENT_INVALID');
    return {
      layout: selected.layout,
      widgets: cleanWidgets(selected.widgets).map(row => localeWidget({ ...row, id: row.instanceId, widgetId: row.widgetId,
        xPercent: row.x, yPercent: row.y, wPercent: row.wPerc, hPercent: row.hPerc, rotationDeg: row.rotation })),
      styles: { bgColor: sanitizeColor(selected.styles.bgColor), bgMediaId: String(selected.styles.bgMediaId || ''), bgMediaUrl: sanitizeUrl(selected.styles.bgMediaUrl) }
    };
  };
  const safeBase = sanitize(base);
  let cleaned = { ...localizations, variants: {} };
  for (const language of Object.keys(localizations.variants).sort((a, b) => a.length - b.length)) {
    cleaned = saveDesignLocale(safeBase, cleaned, language, sanitize(resolveDesignLocale(base, localizations, language))).localizations;
  }
  return { ...layout, localizations: cleaned };
}

module.exports = { sanitizeDesignLocalizations };
