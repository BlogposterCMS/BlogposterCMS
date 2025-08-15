'use strict';
(function(window){
  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);

  function hasEmitter() {
    return window.uiEmitter && typeof window.uiEmitter.emit === 'function';
  }

  window.alert = function(msg) {
    if (hasEmitter()) {
      window.uiEmitter.emit('dialog:alert', {
        title: 'Hinweis',
        message: String(msg)
      });
      return;
    }
    nativeAlert(String(msg));
  };

  window.confirm = function(msg) {
    if (hasEmitter()) {
      window.uiEmitter.emit('dialog:confirm-preview', {
        message: String(msg)
      });
    }
    return nativeConfirm(String(msg));
  };

  window.prompt = function(msg, def = '') {
    if (hasEmitter()) {
      window.uiEmitter.emit('dialog:prompt-preview', {
        message: String(msg),
        defaultValue: String(def)
      });
    }
    return nativePrompt(String(msg), String(def));
  };
})(window);
