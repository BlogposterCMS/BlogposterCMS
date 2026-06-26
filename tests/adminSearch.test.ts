/**
 * @jest-environment jsdom
 */

describe('adminSearch', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="search-container">
        <button id="search-toggle" type="button">Search</button>
        <input id="admin-search-input" />
        <div>
          <ul id="admin-search-results"></ul>
        </div>
      </div>
      <button id="outside" type="button">Outside</button>
    `;
    Object.assign(window, {
      ADMIN_TOKEN: 'test-token',
      meltdownEmit: jest.fn().mockResolvedValue({ pages: [] })
    });
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete'
    });
  });

  afterEach(() => {
    delete (window as Window & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
    delete (window as Window & { meltdownEmit?: unknown }).meltdownEmit;
  });

  it('keeps the expanding search chip open until the user clicks outside it', async () => {
    await import('../ui/shell/search/adminSearch');

    const container = document.querySelector('.search-container');
    const input = document.getElementById('admin-search-input');
    const toggle = document.getElementById('search-toggle');
    const outside = document.getElementById('outside');

    expect(container).not.toBeNull();
    expect(input).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(outside).not.toBeNull();

    input?.dispatchEvent(new Event('focus', { bubbles: true }));
    expect(container?.classList.contains('open')).toBe(true);
    expect(container?.classList.contains('is-expanded')).toBe(true);
    expect((container as HTMLElement | null)?.style.getPropertyValue('width')).toBe('240px');
    expect((container as HTMLElement | null)?.style.getPropertyPriority('width')).toBe('important');
    expect((input as HTMLInputElement | null)?.style.getPropertyValue('opacity')).toBe('1');

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(container?.classList.contains('open')).toBe(true);
    expect(container?.classList.contains('is-expanded')).toBe(true);

    outside?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(container?.classList.contains('open')).toBe(false);
    expect(container?.classList.contains('is-expanded')).toBe(false);
    expect((container as HTMLElement | null)?.style.getPropertyValue('width')).toBe('');
    expect((container as HTMLElement | null)?.style.getPropertyPriority('width')).toBe('');
    expect((input as HTMLInputElement | null)?.style.getPropertyValue('opacity')).toBe('');
  });
});
