/**
 * Routine event traces are useful while debugging module boundaries, but they
 * are too noisy for the normal development loop. Keep them behind one explicit
 * opt-in flag while warnings and errors continue to use their existing paths.
 */
function isRuntimeEventTraceEnabled(env = process.env) {
  return String(env.BLOGPOSTER_EVENT_TRACE || '').trim().toLowerCase() === 'true';
}

function traceRuntimeEvent(...args) {
  if (!isRuntimeEventTraceEnabled()) return false;
  console.log(...args);
  return true;
}

module.exports = {
  isRuntimeEventTraceEnabled,
  traceRuntimeEvent
};
