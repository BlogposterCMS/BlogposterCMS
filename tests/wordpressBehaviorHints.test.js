const assert = require('assert');

const { buildBehaviorHints, _internals } = require('../mother/modules/importer/importers/wordpressBehaviorHints');

test('WordPress behavior hints classify known script libraries and HTML behaviors', () => {
  const hints = buildBehaviorHints({
    renderedHtml: '<section class="swiper" data-aos="fade-up"><form action="/contact"></form><iframe src="/embed"></iframe></section>',
    normalizedHtml: '<section class="swiper"><h1>Hero</h1></section>',
    scripts: ['assets/scripts/swiper.js', 'assets/scripts/custom-theme.js']
  });

  assert(hints.behaviors.some(item => item.type === 'swiper' && item.rebuildAs === 'gallery'));
  assert(hints.behaviors.some(item => item.type === 'form' && item.rebuildAs === 'form-widget'));
  assert(hints.behaviors.some(item => item.type === 'iframe-embed' && item.rebuildAs === 'embed-widget'));
  assert(hints.behaviors.some(item => item.type === 'animation' && item.rebuildAs === 'scene-effects'));
  assert(hints.summary.needsManualReview);
  assert(hints.warnings.some(item => item.includes('custom-script')));
});

test('WordPress behavior hints keeps unknown scripts reviewable', () => {
  const classified = _internals.classifyScript('assets/scripts/theme-runtime.js');

  assert.strictEqual(classified.type, 'custom-script');
  assert.strictEqual(classified.rebuildAs, 'review-widget-or-module');
});
