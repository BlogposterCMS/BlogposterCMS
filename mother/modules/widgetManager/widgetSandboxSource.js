'use strict';

/** Append the UI-only host contract to a self-contained worker script declaring render(ui, context). */
function widgetSandboxSource(source) {
  return source + `\n;
const __bpActions = new Map(), __bpPending = new Map(), __bpStreams = new Map(); let __bpId = 0;
const __bpUI = Object.freeze({
  render(tree) { postMessage({type:'view',tree}); },
  navigate(path) { postMessage({type:'navigate',path}); },
  on(name, handler) { __bpActions.set(name, handler); }
});
function __bpCall(method, name, input) {
    if (__bpPending.size >= 4) return Promise.reject(new Error('WIDGET_SERVICE_BUSY'));
    const id = ++__bpId;
    return new Promise((resolve,reject) => {
      __bpPending.set(id,{resolve,reject}); postMessage({type:'service',id,method,name,input});
    });
}
const __bpServices = Object.freeze({
  request: (name, input = {}) => __bpCall('request',name,input),
  async subscribe(name, event, receive, onError) {
    // Register before requesting: a fast stream may arrive before its service result.
    const key = String(__bpId + 1);
    __bpStreams.set(key,{receive,onError});
    try { await __bpCall('subscribe', name, {event}); }
    catch (error) { __bpStreams.delete(key); throw error; }
    return Object.freeze({close() { __bpStreams.delete(key); return __bpCall('unsubscribe', null, key); }});
  },
  draft: Object.freeze({get: () => __bpCall('draft.get'), set: value => __bpCall('draft.set',null,value)}),
  preferences: Object.freeze({get: name => __bpCall('preferences.get',name), set: (name,value) => __bpCall('preferences.set',name,value)})
});
addEventListener('message', async ({data}) => {
  try {
    if (data.type === 'init') await render(__bpUI, Object.freeze({...data.context,services:__bpServices}));
    else if (data.type === 'ping') postMessage({type:'pong'});
    else if (data.type === 'action') await __bpActions.get(data.action)?.(data);
    else if (data.type === 'stream') {
      const stream = __bpStreams.get(data.key);
      if (data.error) { __bpStreams.delete(data.key); stream?.onError?.(data.error); }
      else stream?.receive?.(data.data);
    }
    else if (data.type === 'result') {
      const pending = __bpPending.get(data.id); __bpPending.delete(data.id);
      if (data.error) pending?.reject(Object.assign(new Error(data.error),{status:data.status})); else pending?.resolve(data.result);
    }
  } catch { postMessage({type:'error',code:'WIDGET_WORKER_FAILED'}); }
});`;
}

/** The same guard applies to old files after an upgrade: retain bytes, block incompatible execution. */
function assertWidgetSandboxContract(info) {
  if (info.uiContractVersion !== 2) throw Object.assign(new Error('[WIDGET_SANDBOX_MIGRATION_REQUIRED] Set uiContractVersion: 2 and migrate render to the UI-only worker contract.'), { code: 'WIDGET_SANDBOX_MIGRATION_REQUIRED' });
}

function validateWidgetSandboxSource(source) {
  // Parse only; never run the uploaded script during inspection or asset delivery.
  if (Buffer.byteLength(source) > 262144) throw new Error('[WIDGET_SANDBOX_SOURCE_LIMIT] Worker script exceeds 256 KiB.');
  try { new (require('vm').Script)(widgetSandboxSource(source)); }
  catch { throw new Error('[WIDGET_SANDBOX_SYNTAX] Use a bundled classic worker script declaring function render(ui, context); imports and exports are unsupported.'); }
}

module.exports = { widgetSandboxSource, assertWidgetSandboxContract, validateWidgetSandboxSource };
