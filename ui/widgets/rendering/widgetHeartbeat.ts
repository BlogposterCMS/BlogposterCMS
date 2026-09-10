const INTERVAL_MS = 2000;
const TIMEOUT_MS = 10000;

/** Detect an unresponsive worker only while the host can actually schedule probes.
 * Hidden/frozen documents and delayed host timers need a fresh probe on return;
 * elapsed wall time alone cannot distinguish browser suspension from a worker hang.
 */
export function createWidgetHeartbeat(sendPing: () => void, onTimeout: () => void) {
  let disposed = false, frozen = false;
  let timer: number | undefined;
  let lastTick = performance.now(), lastReply = lastTick;

  function stopTimer() {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  }

  function probe() {
    lastTick = lastReply = performance.now();
    sendPing();
  }

  function tick() {
    if (disposed || document.hidden || frozen) return;
    const now = performance.now();
    // Sleep or a blocked host event loop delays both the timer and queued replies.
    // Give that queue a chance to run before deciding the worker has stopped.
    if (now - lastTick > INTERVAL_MS * 2) { probe(); return; }
    lastTick = now;
    if (now - lastReply >= TIMEOUT_MS) {
      dispose(); onTimeout(); return;
    }
    sendPing();
  }

  function refresh() {
    stopTimer();
    if (disposed || document.hidden || frozen) return;
    probe();
    timer = window.setInterval(tick, INTERVAL_MS);
  }
  function freeze() { frozen = true; stopTimer(); }
  function resume() { frozen = false; refresh(); }
  function dispose() {
    if (disposed) return;
    disposed = true; stopTimer();
    document.removeEventListener('visibilitychange', refresh);
    document.removeEventListener('freeze', freeze);
    document.removeEventListener('resume', resume);
  }

  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('freeze', freeze);
  document.addEventListener('resume', resume);
  refresh();
  return { reply: () => { lastReply = performance.now(); }, dispose };
}
