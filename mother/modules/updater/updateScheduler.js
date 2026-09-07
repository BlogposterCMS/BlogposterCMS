'use strict';

const { requestHost } = require('./coreUpdateService');

function startUpdateChecks({ request = requestHost, timers = globalThis, onError = code => console.warn(code) } = {}) {
  let pending = false;
  const tick = async () => {
    if (pending) return;
    pending = true;
    try {
      // The executor retains durable installation progress across CMS restarts.
      const state = await request('status');
      if (!['checking', 'installing', 'downloading', 'backing_up', 'restarting', 'verifying', 'rolling_back', 'recovery_failed'].includes(state.phase)) {
        await request('check');
      }
    } catch {
      // An unavailable host must never disable the CMS or leak transport details.
      onError('CORE_UPDATE_BACKGROUND_CHECK_FAILED');
    } finally { pending = false; }
  };
  const initial = timers.setTimeout(tick, 10000);
  const recurring = timers.setInterval(tick, 6 * 60 * 60 * 1000);
  initial.unref?.(); recurring.unref?.();
  return () => { timers.clearTimeout(initial); timers.clearInterval(recurring); };
}

module.exports = { startUpdateChecks };
