/**
 * @jest-environment node
 */

const modulePath = '../ui/designer/app/managers/designerState.js';

describe('designer state storage boundaries', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  afterEach(() => {
    jest.resetModules();
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      delete globalThis.localStorage;
    }
  });

  function installBlockedLocalStorage() {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw Object.assign(new Error('Storage is blocked'), { name: 'SecurityError' });
      }
    });
  }

  test('boots with default opacity when sandbox blocks localStorage access', () => {
    installBlockedLocalStorage();

    expect(() => require(modulePath)).not.toThrow();
    const { designerState } = require(modulePath);

    expect(designerState.defaultOpacity).toBe(1);
  });

  test('keeps opacity updates in memory when sandbox storage is unavailable', () => {
    installBlockedLocalStorage();
    const { designerState, setDefaultOpacity } = require(modulePath);

    expect(() => setDefaultOpacity(0.42)).not.toThrow();

    expect(designerState.defaultOpacity).toBe(0.42);
  });
});
