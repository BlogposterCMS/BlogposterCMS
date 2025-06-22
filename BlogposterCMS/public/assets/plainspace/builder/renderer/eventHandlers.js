//public/assets/plainspace/builder/renderer/eventHandlers.js
export function registerBuilderEvents(gridEl, codeMap, { getRegisteredEditable }) {
  function handleHtmlUpdate(e) {
    const { instanceId, html } = e.detail || {};
    if (!instanceId || typeof html !== 'string') return;
    codeMap[instanceId] = codeMap[instanceId] || {};
    codeMap[instanceId].html = html;

    const wrapper = gridEl?.querySelector(`.canvas-item[data-instance-id="${instanceId}"]`);
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
      if (!codeMap[instId]) codeMap[instId] = {};
      codeMap[instId].html = editable.innerHTML.trim();
    });
  }

  return { updateAllWidgetContents };
}
