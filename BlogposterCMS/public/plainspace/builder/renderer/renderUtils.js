//public//plainspace/builder/renderer/renderUtils.js
export function extractCssProps(el) {
  if (!el) return '';
  const style = getComputedStyle(el);
  const props = [
    'color', 'background', 'background-color', 'font-size', 'font-weight',
    'padding', 'margin', 'border', 'border-radius', 'display'
  ];
  return props.map(p => `${p}: ${style.getPropertyValue(p)};`).join('\n');
}

export function makeSelector(el) {
  if (!el) return '';
  if (el.id) return `#${el.id}`;
  const cls = [...el.classList].join('.');
  const tag = el.tagName.toLowerCase();
  return cls ? `${tag}.${cls}` : tag;
}

export function getWidgetIcon(w, iconMap = {}) {
  const iconName = w.metadata?.icon || iconMap[w.id] || w.id;
  return window.featherIcon
    ? window.featherIcon(iconName)
    : `<img src="/assets/icons/${iconName}.svg" alt="${iconName}" />`;
}
