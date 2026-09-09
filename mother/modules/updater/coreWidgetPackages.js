'use strict';

// Project the canonical bundled-widget catalog; this is not an installation registry.
const { DEFAULT_WIDGETS } = require('../plainSpace/config/defaultWidgets');
const WIDGET_POLICY = Object.freeze(Object.fromEntries(DEFAULT_WIDGETS.map(widget => {
  if (!/^[A-Za-z0-9_-]+$/.test(widget.widgetId) || !/^\/ui\/widgets\/plainspace\/[A-Za-z0-9_./-]+\.js$/.test(widget.content)) {
    throw new Error('CORE_WIDGET_CATALOG_INVALID');
  }
  return [`widget-${widget.widgetId}`, Object.freeze({ kind: 'widget', widgetId: widget.widgetId,
    label: widget.label || widget.widgetId, entry: widget.content.slice(1), hostFiles: [] })];
})));

module.exports = { WIDGET_POLICY };
