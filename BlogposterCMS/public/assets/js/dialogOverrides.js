'use strict';
(function(window){
  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);

  function hasEmitter() {
    return window.motherEmitter && typeof window.motherEmitter.emit === 'function';
  }

  window.alert = function(msg) {
    if (hasEmitter()) {
      window.motherEmitter.emit('ui:showPopup', {
        title: 'Hinweis',
        content: String(msg)
      });
    } else {
      nativeAlert(String(msg));
    }
  };

  window.confirm = function(msg) {
    if (hasEmitter()) {
      return new Promise(resolve => {
        window.motherEmitter.emit('ui:showConfirm', {
          title: 'Bitte bestätigen',
          content: String(msg),
          onYes: () => resolve(true),
          onNo: () => resolve(false)
        });
      });
    }
    return nativeConfirm(String(msg));
  };

  window.prompt = function(msg, def = '') {
    if (hasEmitter()) {
      return new Promise(resolve => {
        window.motherEmitter.emit('ui:showPrompt', {
          title: 'Eingabe erforderlich',
          content: String(msg),
          defaultValue: String(def),
          onSubmit: value => resolve(value),
          onCancel: () => resolve(null)
        });
      });
    }
    return nativePrompt(String(msg), String(def));
  };
})(window);
