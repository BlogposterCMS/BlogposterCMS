// toolbar/fontFamily.js
// Utility helpers for the font family dropdown
export function populateFonts(optionsContainer, label) {
  const fonts = Array.isArray(window.AVAILABLE_FONTS) ? window.AVAILABLE_FONTS : [];
  optionsContainer.innerHTML = fonts
    .map(f => `<span data-font="${f}" style="font-family:'${f}'">${f}</span>`) 
    .join('');
  if (fonts.length && label) label.textContent = fonts[0];
}

export function selectFont(font, label) {
  if (label) label.textContent = font;
}
