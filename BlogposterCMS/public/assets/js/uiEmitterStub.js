(function () {
  class Emitter {
    constructor() {
      this.map = new Map();
    }
    on(ev, cb) {
      const list = this.map.get(ev) || [];
      list.push(cb);
      this.map.set(ev, list);
    }
    emit(ev, payload) {
      (this.map.get(ev) || []).forEach(fn => {
        try {
          fn(payload);
        } catch (err) {
          console.error('[uiEmitter]', err);
        }
      });
    }
  }
  window.uiEmitter = window.uiEmitter || new Emitter();
})();
