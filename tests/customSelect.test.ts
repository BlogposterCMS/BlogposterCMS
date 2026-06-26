/**
 * @jest-environment jsdom
 */

async function loadEnhancer(): Promise<typeof import('../ui/shared/controls/customSelect').default> {
  jest.resetModules();
  const mod = await import('../ui/shared/controls/customSelect');
  return mod.default;
}

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('global custom select control', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('enhances regular single selects without data attributes', async () => {
    document.body.innerHTML = `
      <label for="status">Status</label>
      <select id="status" name="status">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>
    `;

    const enhanceSelects = await loadEnhancer();
    enhanceSelects(document);

    const select = document.querySelector<HTMLSelectElement>('select[name="status"]')!;
    const customSelect = document.querySelector<HTMLElement>('.custom-select')!;
    const display = customSelect.querySelector<HTMLButtonElement>('.display')!;

    expect(select.classList.contains('custom-select__native')).toBe(true);
    expect(select.dataset.customSelectEnhanced).toBe('true');
    expect(display.getAttribute('role')).toBe('combobox');
    expect(display.getAttribute('aria-label')).toBe('Status');
    expect(display.textContent).toContain('Draft');
  });

  it('syncs selection changes back to the native select and form change event', async () => {
    document.body.innerHTML = `
      <select name="layout">
        <option value="default">Default</option>
        <option value="focus">Focus</option>
      </select>
    `;

    const enhanceSelects = await loadEnhancer();
    enhanceSelects(document);

    const select = document.querySelector<HTMLSelectElement>('select[name="layout"]')!;
    const customSelect = document.querySelector<HTMLElement>('.custom-select')!;
    const display = customSelect.querySelector<HTMLButtonElement>('.display')!;
    const option = customSelect.querySelector<HTMLButtonElement>('.option[data-option-index="1"]')!;
    const onChange = jest.fn();

    select.addEventListener('change', onChange);

    click(display);
    expect(customSelect.classList.contains('open')).toBe(true);

    click(option);

    expect(select.value).toBe('focus');
    expect(display.textContent).toContain('Focus');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(customSelect.classList.contains('open')).toBe(false);
  });

  it('keeps native select behavior for explicit escape hatches', async () => {
    document.body.innerHTML = `
      <select name="native" data-native-select="true">
        <option>Native</option>
      </select>
      <select name="multiple" multiple>
        <option>One</option>
      </select>
    `;

    const enhanceSelects = await loadEnhancer();
    enhanceSelects(document);

    expect(document.querySelectorAll('.custom-select')).toHaveLength(0);
    expect(document.querySelector<HTMLSelectElement>('select[name="native"]')?.dataset.customSelectEnhanced).toBeUndefined();
    expect(document.querySelector<HTMLSelectElement>('select[name="multiple"]')?.dataset.customSelectEnhanced).toBeUndefined();
  });

  it('enhances selects inserted after initial dashboard content loads', async () => {
    const enhanceSelects = await loadEnhancer();
    enhanceSelects(document);

    const host = document.createElement('div');
    host.innerHTML = `
      <select name="dynamic">
        <option value="one">One</option>
      </select>
    `;
    document.body.appendChild(host);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.querySelector<HTMLSelectElement>('select[name="dynamic"]')?.dataset.customSelectEnhanced).toBe('true');
    expect(host.querySelector('.custom-select')).not.toBeNull();
  });
});
