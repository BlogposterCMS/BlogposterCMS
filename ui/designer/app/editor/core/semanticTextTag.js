export const SEMANTIC_TEXT_TAG_OPTIONS = Object.freeze([
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'h5', label: 'Heading 5' },
  { value: 'h6', label: 'Heading 6' },
  { value: 'p', label: 'Paragraph' },
  { value: 'div', label: 'Text block' },
  { value: 'span', label: 'Inline text' },
  { value: 'blockquote', label: 'Quote' },
  { value: 'pre', label: 'Code block' }
]);

const SEMANTIC_TEXT_TAG_NAMES = new Set(
  SEMANTIC_TEXT_TAG_OPTIONS.map(option => option.value)
);

const SEMANTIC_BLOCK_TYPOGRAPHY_PROPERTIES = Object.freeze([
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'text-transform'
]);

function semanticElementFromNode(editable, node) {
  let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (element && element !== editable) {
    if (SEMANTIC_TEXT_TAG_NAMES.has(element.tagName.toLowerCase())) return element;
    element = element.parentElement;
  }
  return null;
}

export function isSemanticTextTag(tagName) {
  return SEMANTIC_TEXT_TAG_NAMES.has(String(tagName || '').trim().toLowerCase());
}

export function resolveSemanticTextElement(editable, selection = window.getSelection?.()) {
  if (!editable) return null;
  if (
    selection &&
    selection.rangeCount &&
    editable.contains(selection.anchorNode) &&
    editable.contains(selection.focusNode)
  ) {
    const startElement = semanticElementFromNode(editable, selection.anchorNode);
    const endElement = semanticElementFromNode(editable, selection.focusNode);
    // A tag change must never silently merge or rewrite two text blocks.
    if (startElement && startElement === endElement) return startElement;
    if (startElement || endElement) return null;
  }

  const directSemanticChildren = Array.from(editable.children)
    .filter(child => isSemanticTextTag(child.tagName));
  return directSemanticChildren.length === 1 ? directSemanticChildren[0] : null;
}

export function resolveTextStyleElement(editable, selection = window.getSelection?.()) {
  if (!editable) return null;
  if (
    selection &&
    selection.rangeCount &&
    editable.contains(selection.anchorNode) &&
    editable.contains(selection.focusNode)
  ) {
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      const carrier = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
      if (carrier && carrier !== editable && editable.contains(carrier)) {
        return carrier;
      }
    } else {
      let walkerRoot = range.commonAncestorContainer;
      if (walkerRoot.nodeType === Node.TEXT_NODE) {
        walkerRoot = walkerRoot.parentNode;
      }
      const walker = editable.ownerDocument.createTreeWalker(
        walkerRoot,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: node => range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT
        }
      );
      while (walker.nextNode()) {
        const carrier = walker.currentNode?.parentElement;
        if (carrier && editable.contains(carrier)) return carrier;
      }
    }
  }

  // A selected one-block Rich Text widget has no caret yet. Its sole semantic
  // block is still the meaningful style carrier, not the 16px editor wrapper.
  return resolveSemanticTextElement(editable, selection) || editable;
}

function textOffset(root, node, offset) {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function captureSemanticTextSelection(element, selection = window.getSelection?.()) {
  if (
    !element ||
    !selection ||
    !selection.rangeCount ||
    !element.contains(selection.anchorNode) ||
    !element.contains(selection.focusNode)
  ) {
    return null;
  }
  const range = selection.getRangeAt(0);
  return {
    start: textOffset(element, range.startContainer, range.startOffset),
    end: textOffset(element, range.endContainer, range.endOffset),
    collapsed: range.collapsed
  };
}

function textPointAtOffset(root, requestedOffset) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, requestedOffset);
  let lastTextNode = null;
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    lastTextNode = textNode;
    const length = textNode.textContent?.length || 0;
    if (remaining <= length) return { node: textNode, offset: remaining };
    remaining -= length;
  }
  if (lastTextNode) {
    return { node: lastTextNode, offset: lastTextNode.textContent?.length || 0 };
  }
  return { node: root, offset: root.childNodes.length };
}

export function restoreSemanticTextSelection(
  element,
  snapshot,
  selection = window.getSelection?.()
) {
  if (!element || !snapshot || !selection) return false;
  const start = textPointAtOffset(element, snapshot.start);
  const end = textPointAtOffset(element, snapshot.end);
  const range = element.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  if (snapshot.collapsed) range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function replaceSemanticTextElement(element, nextTagName) {
  const normalizedTag = String(nextTagName || '').trim().toLowerCase();
  if (!isSemanticTextTag(normalizedTag)) {
    throw new Error(
      `DESIGNER_TEXT_TAG_UNSUPPORTED: "${normalizedTag || 'empty'}" is not an editable text role.`
    );
  }
  if (!element || element.nodeType !== Node.ELEMENT_NODE || !element.parentNode) {
    throw new Error(
      'DESIGNER_TEXT_TAG_TARGET_INVALID: A mounted semantic text element is required.'
    );
  }
  if (element.tagName.toLowerCase() === normalizedTag) return element;

  const replacement = element.ownerDocument.createElement(normalizedTag);
  // The selected role is also the typography preset for this block. Keeping an
  // old H1 font size on a paragraph would make the role switch visually inert,
  // so only block-level typography overrides are reset. Nested spans, links,
  // colors, spacing and editor metadata remain attached to the same content.
  Array.from(element.attributes).forEach(attribute => {
    replacement.setAttribute(attribute.name, attribute.value);
  });
  SEMANTIC_BLOCK_TYPOGRAPHY_PROPERTIES.forEach(property => {
    replacement.style.removeProperty(property);
  });
  if (!replacement.getAttribute('style')?.trim()) {
    replacement.removeAttribute('style');
  }
  replacement.append(...Array.from(element.childNodes));
  element.replaceWith(replacement);
  return replacement;
}
