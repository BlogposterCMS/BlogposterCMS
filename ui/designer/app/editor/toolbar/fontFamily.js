// toolbar/fontFamily.js
// Utility helpers for the font family dropdown
export function populateFonts(optionsContainer, label) {
  const fonts = Array.isArray(window.AVAILABLE_FONTS) ? window.AVAILABLE_FONTS : [];
  optionsContainer.innerHTML = [
    '<span data-font="" data-font-default="true">Default</span>',
    ...fonts
    .map(f => `<span data-font="${f}" style="font-family:'${f}'">${f}</span>`)
  ].join('');
  if (label) label.textContent = 'Default';
}

export function selectFont(font, label) {
  if (label) label.textContent = font || 'Default';
}
