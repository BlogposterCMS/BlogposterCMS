'use strict';

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../../contracts/backendEventContracts');
const { buildHtmlDesignerDraft } = require('./htmlVisualMapper');

/** Reuse Importer's permission checks and Designer's canonical save transaction. */
module.exports = {
  name: 'htmlPage',
  description: 'Convert a measured HTML capture into an editable Design Studio draft.',
  async import(options = {}) {
    const draft = buildHtmlDesignerDraft(options.capture);
    const plan = { importer: 'htmlPage', title: draft.title, summary: draft.summary, draft };
    if (options.dryRun !== false) return { dryRun: true, plan };
    if (!options.motherEmitter || !options.jwt) throw new Error('[HTML_IMPORT_CONTEXT_MISSING] Importer authorization context is required.');
    const result = await requestBackendEvent(options.motherEmitter, BACKEND_EVENTS.DESIGNER_SAVE_DESIGN, {
      jwt: options.jwt, moduleName: 'designerManager', moduleType: 'core',
      design: { title: draft.title, description: 'Imported HTML capture. Review measured viewports and import warnings.', isDraft: true },
      widgets: draft.widgets, layout: draft.layout
    });
    return { dryRun: false, plan, result };
  }
};
