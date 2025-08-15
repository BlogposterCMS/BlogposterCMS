export const bpDialog = {
  alert(msg) {
    return new Promise(res => {
      if (window.uiEmitter && typeof window.uiEmitter.emit === 'function') {
        window.uiEmitter.emit('dialog:alert', {
          message: String(msg),
          onClose: res
        });
      } else {
        alert(String(msg));
        res();
      }
    });
  },
  confirm(msg) {
    return new Promise(res => {
      if (window.uiEmitter && typeof window.uiEmitter.emit === 'function') {
        window.uiEmitter.emit('dialog:confirm', {
          message: String(msg),
          onYes: () => res(true),
          onNo: () => res(false)
        });
      } else {
        res(window.confirm(String(msg)));
      }
    });
  },
  prompt(msg, def = '') {
    return new Promise(res => {
      if (window.uiEmitter && typeof window.uiEmitter.emit === 'function') {
        window.uiEmitter.emit('dialog:prompt', {
          message: String(msg),
          defaultValue: String(def),
          onSubmit: v => res(v),
          onCancel: () => res(null)
        });
      } else {
        const result = window.prompt(String(msg), String(def));
        res(result === null ? null : String(result));
      }
    });
  }
};
