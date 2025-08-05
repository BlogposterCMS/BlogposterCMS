export function styleMatches(val, prop, target, styleObj = null) {
  switch (prop) {
    case 'textDecoration': {
      const hasUnderline = String(val).includes('underline');
      const wavy = styleObj && styleObj.textDecorationStyle === 'wavy';
      return hasUnderline && !wavy;
    }
    case 'fontWeight': {
      const num = parseInt(val, 10);
      return val === 'bold' || (!isNaN(num) && num >= 600);
    }
    case 'fontStyle':
      return /(italic|oblique)/.test(val);
    default:
      return String(val) === String(target);
  }
}

export function elementHasStyle(el, prop, value) {
  const style = getComputedStyle(el);
  return styleMatches(style[prop], prop, value, style);
}
