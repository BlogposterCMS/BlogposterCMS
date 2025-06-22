
//public/assets/plainspace/builder/allowedTags.js
export const allowedTags = [
  'div', 'section', 'article', 'aside', 'main', 'nav',
  'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong', 'em', 'blockquote', 'code', 'pre',
  'img', 'picture', 'video', 'audio', 'canvas', 'iframe', 'svg',
  'form', 'input', 'textarea', 'button', 'select', 'option', 'label',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'header', 'footer', 'address', 'figure', 'figcaption',
  'script', 'noscript', 'template', 'slot', 'style'
];

export function isValidTag(tag) {
  return allowedTags.includes(String(tag).toLowerCase());
}
