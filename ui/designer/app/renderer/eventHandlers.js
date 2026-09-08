// Native rich text keeps its module renderer and stylesheet after edits/save.
export function storeEditableWidgetContent(widget, codeMap, editable, html) {
  const id = widget?.dataset.instanceId;
  if (!id) return;
  const existing = codeMap[id] || {};
  if (widget.dataset.widgetId === 'textBox' && editable?.classList.contains('widget-rich-text') && !existing.meta?.htmlImport) {
    const parsed = document.createElement('template');
    parsed.innerHTML = html;
    const root = parsed.content.querySelector('[data-text-editable]');
    const content = root ? root.innerHTML : html;
    const locale = editable.dataset.contentLocale;
    const meta = { ...existing.meta };
    if (locale && meta.translations?.[locale]) {
      meta.translations = { ...meta.translations, [locale]: { ...meta.translations[locale], html: content } };
    } else meta.html = content;
    codeMap[id] = { ...existing, html: null, meta };
  } else {
    codeMap[id] = { ...existing, html };
  }
}

export function registerBuilderEvents(gridEl, codeMap, { getRegisteredEditable }) {
  function handleHtmlUpdate(e) {
    const { instanceId, html } = e.detail || {};
    if (!instanceId || typeof html !== 'string') return;
    const wrapper = gridEl?.querySelector(`.canvas-item[data-instance-id="${instanceId}"]`);
    if (wrapper) storeEditableWidgetContent(wrapper, codeMap, getRegisteredEditable(wrapper), html);
    if (wrapper && wrapper.__codeEditor && wrapper.__codeEditor.style.display !== 'none') {
      const htmlField = wrapper.__codeEditor.querySelector('.editor-html');
      if (htmlField) htmlField.value = html;
    }
  }
  document.addEventListener('widgetHtmlUpdate', handleHtmlUpdate);

  function updateAllWidgetContents() {
    if (!gridEl) return;
    gridEl.querySelectorAll('.canvas-item').forEach(widget => {
      const editable = getRegisteredEditable(widget);
      if (!editable) return;
      const instId = widget.dataset.instanceId;
      if (!instId) return;
      storeEditableWidgetContent(widget, codeMap, editable, editable.outerHTML.trim());
    });
  }

  return { updateAllWidgetContents };
}
