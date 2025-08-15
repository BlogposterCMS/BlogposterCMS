(function () {
  if (!window.uiEmitter) return;
  uiEmitter.on('dialog:alert', ({ message, onClose }) => {
    console.log('[custom alert]', message);
    if (typeof onClose === 'function') onClose();
  });
  uiEmitter.on('dialog:confirm-preview', ({ message }) => {
    console.log('[preview confirm]', message);
  });
  uiEmitter.on('dialog:prompt-preview', ({ message, defaultValue }) => {
    console.log('[preview prompt]', message, defaultValue);
  });
})();
