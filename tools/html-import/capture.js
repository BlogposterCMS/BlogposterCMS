'use strict';

/** Read an already rendered document. This function is also evaluated in a browser. */
async function captureHtmlPage() {
  await document.fonts.ready;
  // Allow viewport layout to settle before measuring, without a guessed time delay.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const round = n => Math.round(n * 100) / 100;
  const bounds = el => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x + scrollX), y: round(r.y + scrollY), w: round(r.width), h: round(r.height) };
  };
  const properties = ['color', 'background-color', 'background-image', 'background-size', 'background-position',
    'background-repeat', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
    'box-shadow', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
    'text-align', 'text-transform', 'text-decoration', 'white-space', 'word-break', 'overflow-wrap',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'object-fit', 'object-position',
    'display', 'align-items', 'justify-content', 'gap', 'flex-direction', 'opacity'];
  const style = el => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(properties.map(key => [key, cs.getPropertyValue(key)]));
  };
  const elements = Array.from(document.body.querySelectorAll('*'));
  const ids = new Map(elements.map((el, index) => [el, `node-${index + 1}`]));
  const warnings = [];
  const leaves = [];
  const consumed = new Set();
  const stackingOrder = el => {
    let current = el, z = 0;
    // Preserve the outer explicit stacking context (for example a fixed header above the hero).
    while (current && current !== document.body) {
      const value = Number.parseInt(getComputedStyle(current).zIndex, 10);
      if (Number.isFinite(value) && value !== 0) z = value;
      current = current.parentElement;
    }
    return Math.max(-10000, Math.min(10000, z));
  };
  const visible = el => {
    const r = bounds(el), cs = getComputedStyle(el);
    if (!(r.w > 0 && r.h > 0) || cs.display === 'none' || cs.visibility === 'hidden') return false;
    // Opacity is not inherited: a hidden dropdown can still have measurable, opaque children.
    for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
      if (Number(getComputedStyle(ancestor).opacity || '1') === 0) return false;
    }
    return true;
  };
  // Keep inline text runs together; block-level children remain independent editable objects.
  const atomic = el => /^(H[1-6]|P|A|BUTTON|IMG|SVG|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
    || (!el.children.length && el.textContent.trim())
    || (Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())
      && !el.querySelector('div,section,article,p,h1,h2,h3,ul,ol'));
  function markup(el, root = false) {
    if (/^(SCRIPT|STYLE|SVG|IFRAME|VIDEO|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return '';
    const clone = el.cloneNode(false);
    Array.from(clone.attributes).forEach(a => clone.removeAttribute(a.name));
    if (el.tagName === 'IMG') { clone.setAttribute('src', el.currentSrc || el.src); clone.setAttribute('alt', el.alt || ''); }
    if (el.tagName === 'A') clone.setAttribute('href', el.href);
    const values = style(el);
    if (root) Object.assign(values, { margin: '0', width: '100%', height: '100%', 'box-sizing': 'border-box' });
    clone.setAttribute('style', Object.entries(values).map(([k, v]) => `${k}:${v}`).join(';'));
    if (root && el.tagName !== 'IMG') { clone.className = 'editable'; clone.setAttribute('data-text-editable', ''); }
    for (const child of el.childNodes) {
      if (child.nodeType === 3) clone.appendChild(document.createTextNode(child.textContent));
      else if (child.nodeType === 1) clone.insertAdjacentHTML('beforeend', markup(child));
    }
    return clone.outerHTML;
  }
  for (const el of elements) {
    if (consumed.has(el) || !visible(el) || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT)$/.test(el.tagName)) continue;
    const id = ids.get(el), rect = bounds(el), css = style(el);
    const isAtomic = atomic(el);
    if (isAtomic) {
      el.querySelectorAll('*').forEach(child => consumed.add(child));
      const unsupported = /^(SVG|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const nestedUnsupported = el.querySelector('svg,video,iframe,input,select,textarea');
      if (unsupported || nestedUnsupported) warnings.push({ code: 'HTML_IMPORT_UNSUPPORTED_ELEMENT', nodeId: id, tag: el.tagName });
      if (el.tagName === 'BUTTON') warnings.push({ code: 'HTML_IMPORT_BEHAVIOR_REVIEW', nodeId: id });
      if (el.tagName === 'IMG' && !/^https?:/i.test(el.currentSrc || el.src)) warnings.push({ code: 'HTML_IMPORT_ASSET_URL_UNSUPPORTED', nodeId: id });
      leaves.push({ id, kind: unsupported ? 'unsupported' : el.tagName === 'IMG' ? 'image' : /^(A|BUTTON)$/.test(el.tagName) ? 'button' : 'text',
        rect, stackingOrder: stackingOrder(el), html: markup(el, true), css, label: (el.innerText || el.getAttribute('alt') || el.tagName).slice(0, 100) });
    } else if ((css['background-color'] !== 'rgba(0, 0, 0, 0)' && css['background-color'] !== 'transparent')
      || css['background-image'] !== 'none' || css['box-shadow'] !== 'none'
      || ['border-top','border-right','border-bottom','border-left'].some(k => !css[k].startsWith('0px'))) {
      leaves.push({ id: `${id}-decoration`, kind: 'decoration', rect, stackingOrder: stackingOrder(el), css, html: '', label: 'Background' });
    }
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content !== 'none' && cs.content !== 'normal') warnings.push({ code: 'HTML_IMPORT_PSEUDO_ELEMENT_REVIEW', nodeId: id, pseudo });
    }
  }
  const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  // Retain semantic page sections and their real DOM containers, rather than a flat screenshot-like canvas.
  const sectionElements = elements.filter(el => /^(SECTION|FOOTER|ARTICLE)$/.test(el.tagName)
    && visible(el) && !el.parentElement.closest('section,footer,article'));
  const label = el => (el.getAttribute('aria-label') || el.querySelector('h1,h2,h3')?.textContent
    || el.id || (el.tagName === 'FOOTER' ? 'Footer' : el.tagName === 'HEADER' ? 'Navigation' : 'Container')).trim().slice(0, 100);
  const sections = sectionElements.map((el, i) => ({ id: ids.get(el), title: label(el),
    rect: { x: 0, y: i ? bounds(el).y : 0, w: innerWidth,
      h: (i + 1 < sectionElements.length ? bounds(sectionElements[i + 1]).y : pageHeight) - (i ? bounds(el).y : 0) } }));
  const sectionByElement = new Map(sectionElements.map((el, i) => [el, sections[i]]));
  const sectionFor = el => {
    let current = el;
    while (current) { if (sectionByElement.has(current)) return sectionByElement.get(current); current = current.parentElement; }
    const y = bounds(el).y;
    return sections.find(s => y >= s.rect.y && y < s.rect.y + s.rect.h) || sections[0];
  };
  const containerElements = sections.length ? elements.filter(el => !sectionByElement.has(el)
    && /^(DIV|NAV|HEADER|ASIDE|UL|OL)$/.test(el.tagName) && !consumed.has(el) && visible(el)
    && (el.closest('section,footer,article,header'))
    && el.querySelector('h1,h2,h3,p,a,img,button,li')) : [];
  const containerSet = new Set(containerElements);
  const parentFor = el => {
    let current = el.parentElement;
    while (current) {
      if (containerSet.has(current) || sectionByElement.has(current)) return ids.get(current);
      current = current.parentElement;
    }
    return sectionFor(el)?.id;
  };
  const containers = containerElements.map(el => ({ id: ids.get(el), title: label(el),
    sectionId: sectionFor(el).id, parentId: parentFor(el), rect: bounds(el), stackingOrder: stackingOrder(el) }));
  leaves.forEach(leaf => {
    const el = elements[Number(leaf.id.match(/\d+/)?.[0]) - 1];
    if (!sections.length || !el) return;
    leaf.sectionId = sectionFor(el).id;
    // A container's background belongs inside that container, behind its own content.
    leaf.parentId = leaf.kind === 'decoration' && containerSet.has(el) ? ids.get(el)
      : sectionByElement.has(el) ? ids.get(el) : parentFor(el);
  });
  // A page-spanning background cannot grow the first Section to full-page height.
  // Clip its measured surface into each covered Section while retaining the paint order.
  const sectionLeaves = leaves.flatMap(leaf => {
    const el = elements[Number(leaf.id.match(/\d+/)?.[0]) - 1];
    const covered = leaf.kind === 'decoration' && el
      ? sectionElements.filter(section => el !== section && el.contains(section)) : [];
    if (covered.length < 2) return [leaf];
    return covered.map(sectionEl => {
      const section = sectionByElement.get(sectionEl);
      const y = Math.max(leaf.rect.y, section.rect.y);
      const bottom = Math.min(leaf.rect.y + leaf.rect.h, section.rect.y + section.rect.h);
      return { ...leaf, id: `${leaf.id}-${section.id}`, parentId: section.id, sectionId: section.id,
        rect: { ...leaf.rect, y, h: Math.max(1, bottom - y) } };
    });
  });
  return { version: 1, title: document.title, sourceUrl: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    pageHeight, structure: { sections, containers },
    background: getComputedStyle(document.body).backgroundColor, elements: sectionLeaves, warnings };
}

module.exports = { captureHtmlPage };
