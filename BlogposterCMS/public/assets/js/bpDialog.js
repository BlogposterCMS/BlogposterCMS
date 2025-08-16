export const bpDialog = {
  alert(msg) {
    return new Promise(res => {
      alert(String(msg));
      res();
    });
  },
  confirm(msg) {
    return Promise.resolve(window.confirm(String(msg)));
  },
  prompt(msg, def = '') {
    return Promise.resolve(
      (function () {
        const result = window.prompt(String(msg), String(def));
        return result === null ? null : String(result);
      })()
    );
  }
};
