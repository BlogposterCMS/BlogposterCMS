/**
 * @jest-environment jsdom
 */

import { executeJs } from '../ui/shared/scripts/executeJs';

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function restoreUrlObjectUrlApi(): void {
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL
    });
  } else {
    delete (URL as typeof URL & { createObjectURL?: unknown }).createObjectURL;
  }

  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL
    });
  } else {
    delete (URL as typeof URL & { revokeObjectURL?: unknown }).revokeObjectURL;
  }
}

describe('executeJs', () => {
  let wrapper: HTMLElement;
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<main id="root"></main>';
    wrapper = document.createElement('section');
    root = document.getElementById('root') as HTMLElement;
    delete window.NONCE;
    delete window.__scriptRoot;
    delete window.__scriptWrapper;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreUrlObjectUrlApi();
    delete window.NONCE;
    delete window.__scriptRoot;
    delete window.__scriptWrapper;
  });

  it('requires a nonce before executing inline scripts', () => {
    const append = jest.spyOn(document.body, 'appendChild');
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    executeJs('window.__ran = true;', wrapper, root, 'Widget');

    expect(append).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('[Widget] missing nonce');
  });

  it('wraps inline scripts with nonce and always clears temporary globals', () => {
    window.NONCE = 'nonce-test';
    let appended: HTMLScriptElement | null = null;
    const remove = jest.spyOn(HTMLScriptElement.prototype, 'remove').mockImplementation(() => undefined);
    jest.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
      appended = node as HTMLScriptElement;
      expect(window.__scriptRoot).toBe(root);
      expect(window.__scriptWrapper).toBe(wrapper);
      return node;
    });

    executeJs('window.__ran = true;', wrapper, root, 'Widget');

    expect(appended?.getAttribute('nonce')).toBe('nonce-test');
    expect(appended?.textContent).toContain('window.__ran = true;');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(window.__scriptRoot).toBeUndefined();
    expect(window.__scriptWrapper).toBeUndefined();
  });

  it('clears temporary globals when inline script insertion fails', () => {
    window.NONCE = 'nonce-test';
    jest.spyOn(HTMLScriptElement.prototype, 'remove').mockImplementation(() => undefined);
    jest.spyOn(document.body, 'appendChild').mockImplementation(() => {
      throw new Error('append failed');
    });

    expect(() => executeJs('window.__ran = true;', wrapper, root, 'Widget')).toThrow('append failed');
    expect(window.__scriptRoot).toBeUndefined();
    expect(window.__scriptWrapper).toBeUndefined();
  });

  it('treats indented import/export statements as module scripts and revokes their blob URL', async () => {
    window.NONCE = 'nonce-test';
    const append = jest.spyOn(document.body, 'appendChild');
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn(() => '/missing-module.js')
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn()
    });

    executeJs('  export function render() {}', wrapper, root, 'Widget');
    await flushPromises();

    expect(append).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('/missing-module.js');
    expect(error).toHaveBeenCalledWith(
      '[Widget] module import error',
      expect.objectContaining({ message: expect.stringContaining('/missing-module.js') })
    );
  });
});
