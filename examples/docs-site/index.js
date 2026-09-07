'use strict';

const fs = require('node:fs');
const path = require('node:path');
const template = require('./design.json');
const chapters = [
  { file: 'introduction.html', suffix: '', title: 'Introduction' },
  { file: 'layouts.html', suffix: '/layouts', title: 'Layouts & pages' },
  { file: 'agents.html', suffix: '/agents', title: 'Working with agents' }
];

/** Only repository-owned files are loaded. The importer never accepts user code
 * or file paths; the bounded slug can safely appear in URLs and menu identifiers. */
function buildDocsExample(rootSlug = 'docs-example') {
  if (typeof rootSlug !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(rootSlug)) {
    throw new Error('EXAMPLE_IMPORT_SLUG_INVALID: Use a lowercase address such as docs-example (up to 48 characters).');
  }
  const substitute = text => text.replaceAll('{{rootSlug}}', rootSlug);
  const design = JSON.parse(substitute(JSON.stringify(template)));
  const presentation = fs.readFileSync(path.join(__dirname, 'presentation.css'), 'utf8');
  const initialPresentation = fs.readFileSync(path.join(__dirname, 'initial-presentation.css'), 'utf8');
  // Studio still uses the demo's scoped stylesheet inside its own document.
  // Public articles carry the same CSS in the first HTML response, so their
  // typography never depends on executing the header widget first.
  design.widgets.find(widget => widget.id === 'docs-demo-header-widget').code.js =
    `const frame=this.closest('[data-node-id="docs-demo-root"]');if(frame&&!frame.querySelector('style[data-docs-presentation]')){const style=document.createElement('style');style.dataset.docsPresentation='true';style.textContent=${JSON.stringify(presentation)};frame.prepend(style);}`;
  const articleCss = presentation.replaceAll('[data-node-id="docs-demo-root"]',
    ':is([data-node-id="docs-demo-root"],body > #bp-initial-html)') + initialPresentation;
  const pages = chapters.map(chapter => ({
    slug: rootSlug + chapter.suffix,
    title: chapter.title,
    html: substitute(fs.readFileSync(path.join(__dirname, chapter.file), 'utf8')),
    css: articleCss
  }));
  return { id: 'docs', version: 1, rootSlug, menuKey: `example-${rootSlug}`, design, pages };
}

module.exports = { buildDocsExample };
