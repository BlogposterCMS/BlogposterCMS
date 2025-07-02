import { debounce } from './utils/debounce.js';

const queue = [];

async function flushQueue() {
  const batch = queue.splice(0, queue.length);
  if (batch.length === 0) return;

  if (batch.length === 1) {
    const { eventName, payload, timeout, resolve, reject } = batch[0];
    window.meltdownEmitRaw(eventName, payload, timeout).then(resolve).catch(reject);
    return;
  }

  const events  = batch.map(item => ({ eventName: item.eventName, payload: item.payload }));
  const timeout = batch[0].timeout;
  window.meltdownEmitBatch(events, null, timeout)
    .then(results => results.forEach((res, idx) => batch[idx].resolve(res)))
    .catch(err => batch.forEach(item => item.reject(err)));
}

const scheduleFlush = debounce(flushQueue, 50);

window.meltdownEmitRaw = window.meltdownEmit;
window.meltdownEmit = function(eventName, payload = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    queue.push({ eventName, payload, timeout, resolve, reject });
    scheduleFlush();
  });
};
