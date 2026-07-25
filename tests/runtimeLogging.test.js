const {
  isRuntimeEventTraceEnabled,
  traceRuntimeEvent
} = require('../mother/utils/runtimeLogging');

describe('runtime event logging', () => {
  const originalTraceSetting = process.env.BLOGPOSTER_EVENT_TRACE;

  afterEach(() => {
    if (originalTraceSetting === undefined) {
      delete process.env.BLOGPOSTER_EVENT_TRACE;
    } else {
      process.env.BLOGPOSTER_EVENT_TRACE = originalTraceSetting;
    }
    jest.restoreAllMocks();
  });

  test('keeps routine event traces silent by default', () => {
    delete process.env.BLOGPOSTER_EVENT_TRACE;
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(traceRuntimeEvent('[MotherEmitter] routine event')).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('emits routine traces only after the explicit opt-in', () => {
    process.env.BLOGPOSTER_EVENT_TRACE = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(isRuntimeEventTraceEnabled()).toBe(true);
    expect(traceRuntimeEvent('[MotherEmitter] routine event', 2)).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('[MotherEmitter] routine event', 2);
  });
});
