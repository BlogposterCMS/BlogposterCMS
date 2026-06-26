export function createPreviewHeader(displayPorts) {
  let previewHeader = null;
  let viewportSelect = null;

  function showPreviewHeader() {
    if (previewHeader) return;
    previewHeader = document.createElement('div');
    previewHeader.id = 'previewHeader';
    previewHeader.className = 'preview-header';
    viewportSelect = document.createElement('select');
    displayPorts.forEach(port => {
      const option = document.createElement('option');
      option.value = port.class;
      option.textContent = port.label;
      viewportSelect.appendChild(option);
    });
    viewportSelect.addEventListener('change', () => {
      document.body.classList.remove('preview-mobile', 'preview-tablet', 'preview-desktop');
      const cls = viewportSelect.value;
      if (cls) document.body.classList.add(cls);
    });
    previewHeader.appendChild(viewportSelect);
    document.body.prepend(previewHeader);
    viewportSelect.dispatchEvent(new Event('change'));
  }

  function hidePreviewHeader() {
    if (previewHeader) {
      previewHeader.remove();
      previewHeader = null;
      viewportSelect = null;
    }
    document.body.classList.remove('preview-mobile', 'preview-tablet', 'preview-desktop');
  }

  return { showPreviewHeader, hidePreviewHeader };
}
