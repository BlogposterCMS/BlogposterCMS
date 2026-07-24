/**
 * @jest-environment jsdom
 */

import { createColorPicker } from '../ui/shared/controls/colorPicker';

test('shared picker renders named saved colors and supports linked or detached selection', () => {
  const onSelect = jest.fn();
  const picker = createColorPicker({
    savedColors: [{
      id: '11111111-2222-4333-8444-555555555555',
      name: 'Brand Blue',
      value: '#0066CC',
      cssValue: 'var(--bp-color-11111111-2222-4333-8444-555555555555, #0066CC)'
    }],
    linkSavedColors: true,
    onSelect
  });
  document.body.appendChild(picker.el);

  expect(picker.el.querySelector('.saved-color-item strong')?.textContent).toBe('Default 1 · Brand Blue');
  expect(picker.el.querySelector('.saved-color-item small')?.textContent).toBe('#0066CC');

  (picker.el.querySelector('.saved-color-item') as HTMLButtonElement).click();
  expect(onSelect).toHaveBeenLastCalledWith(
    'var(--bp-color-11111111-2222-4333-8444-555555555555, #0066CC)',
    expect.objectContaining({
      source: 'saved',
      linked: true,
      refId: '11111111-2222-4333-8444-555555555555'
    })
  );

  const linkToggle = picker.el.querySelector(
    '.saved-color-library__link input'
  ) as HTMLInputElement;
  linkToggle.checked = false;
  linkToggle.dispatchEvent(new Event('change'));
  expect(onSelect).toHaveBeenLastCalledWith(
    '#0066CC',
    expect.objectContaining({ source: 'saved', linked: false })
  );
});

test('shared picker saves a custom color with a required visible name field', async () => {
  const onCreateSavedColor = jest.fn(async ({ name, value }) => ({
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name,
    value
  }));
  const picker = createColorPicker({
    initialColor: '#FF5500',
    onCreateSavedColor
  });
  document.body.appendChild(picker.el);

  (picker.el.querySelector('.saved-color-library__add') as HTMLButtonElement).click();
  const nameInput = picker.el.querySelector('.saved-color-form__name') as HTMLInputElement;
  const valueInput = picker.el.querySelector('.saved-color-form__value') as HTMLInputElement;
  expect(valueInput.value).toBe('#FF5500');
  nameInput.value = 'Accent';
  picker.el.querySelector('.saved-color-form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  expect(onCreateSavedColor).toHaveBeenCalledWith({
    name: 'Accent',
    value: '#FF5500'
  });
});
