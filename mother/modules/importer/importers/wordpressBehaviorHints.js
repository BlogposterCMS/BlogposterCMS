'use strict';

const SCRIPT_NAME_PATTERNS = [
  { type: 'jquery', pattern: /jquery/i, rebuildAs: 'native-widget-or-drop-if-unused' },
  { type: 'swiper', pattern: /swiper/i, rebuildAs: 'gallery' },
  { type: 'slick', pattern: /slick/i, rebuildAs: 'gallery' },
  { type: 'owl-carousel', pattern: /owl\.?carousel|owl-carousel/i, rebuildAs: 'gallery' },
  { type: 'gsap', pattern: /gsap|greensock/i, rebuildAs: 'scene-effects' },
  { type: 'aos', pattern: /aos/i, rebuildAs: 'scene-effects' },
  { type: 'wow', pattern: /wow(?:\.min)?\.js/i, rebuildAs: 'scene-effects' },
  { type: 'lottie', pattern: /lottie|bodymovin/i, rebuildAs: 'embed-or-widget' },
  { type: 'contact-form-7', pattern: /contact-form-7|wpcf7/i, rebuildAs: 'form-widget' },
  { type: 'elementor', pattern: /elementor/i, rebuildAs: 'designer-widgets' },
  { type: 'divi', pattern: /et-core|divi|et-builder/i, rebuildAs: 'designer-widgets' }
];

const HTML_PATTERNS = [
  { type: 'form', pattern: /<form\b|wpcf7|contact-form/i, rebuildAs: 'form-widget' },
  { type: 'slider', pattern: /swiper|slick|carousel|splide|slider/i, rebuildAs: 'gallery-or-custom-widget' },
  { type: 'animation', pattern: /data-aos|wow\b|animate__|has-animation|scroll-reveal|reveal/i, rebuildAs: 'scene-effects' },
  { type: 'iframe-embed', pattern: /<iframe\b/i, rebuildAs: 'embed-widget' },
  { type: 'video', pattern: /<video\b|wp-block-video/i, rebuildAs: 'mediaBlock' },
  { type: 'map', pattern: /google-map|leaflet|mapbox|data-lat|data-lng/i, rebuildAs: 'map-widget' }
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueByType(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = `${item.type}:${item.rebuildAs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function classifyScript(scriptPath = '') {
  const match = SCRIPT_NAME_PATTERNS.find(item => item.pattern.test(scriptPath));
  return match
    ? {
      type: match.type,
      source: scriptPath,
      rebuildAs: match.rebuildAs,
      confidence: 0.74
    }
    : {
      type: 'custom-script',
      source: scriptPath,
      rebuildAs: 'review-widget-or-module',
      confidence: 0.32
    };
}

function detectHtmlBehaviors(html = '') {
  const source = String(html || '');
  const behaviors = [];
  for (const item of HTML_PATTERNS) {
    if (item.pattern.test(source)) {
      behaviors.push({
        type: item.type,
        source: 'html',
        rebuildAs: item.rebuildAs,
        confidence: item.type === 'form' || item.type === 'iframe-embed' ? 0.82 : 0.62
      });
    }
  }
  if (/\son[a-z]+\s*=/i.test(source)) {
    behaviors.push({
      type: 'inline-event-handler',
      source: 'html',
      rebuildAs: 'review-widget-or-module',
      confidence: 0.7
    });
  }
  return behaviors;
}

function behaviorSummary(behaviors) {
  const scriptCount = behaviors.filter(item => item.source !== 'html').length;
  const customScriptCount = behaviors.filter(item => item.type === 'custom-script').length;
  const nativeCandidates = behaviors.filter(item =>
    ['gallery', 'scene-effects', 'form-widget', 'embed-widget', 'mediaBlock'].includes(item.rebuildAs)
  ).length;
  return {
    total: behaviors.length,
    scriptCount,
    customScriptCount,
    nativeCandidates,
    needsManualReview: customScriptCount > 0 || behaviors.some(item => item.rebuildAs === 'review-widget-or-module')
  };
}

function buildBehaviorHints({ renderedHtml = '', normalizedHtml = '', scripts = [] } = {}) {
  const scriptBehaviors = asArray(scripts)
    .filter(script => typeof script === 'string' && script.trim())
    .map(classifyScript);
  const htmlBehaviors = [
    ...detectHtmlBehaviors(renderedHtml),
    ...detectHtmlBehaviors(normalizedHtml)
  ];
  const behaviors = uniqueByType([...scriptBehaviors, ...htmlBehaviors]);
  const warnings = behaviors
    .filter(item => item.type === 'custom-script' || item.type === 'inline-event-handler')
    .map(item => `BEHAVIOR_REVIEW_REQUIRED: ${item.type} should be rebuilt as ${item.rebuildAs}.`);

  return {
    source: 'wordpress-behavior-hints',
    behaviors,
    summary: behaviorSummary(behaviors),
    warnings
  };
}

module.exports = {
  _internals: {
    classifyScript,
    detectHtmlBehaviors
  },
  buildBehaviorHints
};
