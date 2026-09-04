/**
 * @jest-environment jsdom
 */

import { createFormField, createFormSwitch } from '../ui/shared/forms/formField';
import { createLoader, createProgress, setButtonLoading } from '../ui/shared/feedback/loading';
import { bpToast } from '../ui/shared/feedback/toast';
import { createTabSystem } from '../ui/shared/navigation/tabs';
import { bpPopover } from '../ui/shared/overlays/popover';

describe('admin UI kit primitives', () => {
  afterEach(() => {
    bpPopover.close();
    bpToast.clear();
    document.body.replaceChildren();
    jest.useRealTimers();
  });

  it('wires form labels, help, errors and switch semantics', () => {
    const input = document.createElement('input');
    input.type = 'url';
    const field = createFormField('Canonical URL', input, {
      hint: 'Include the protocol.',
      error: 'BP_FORM_URL_INVALID: Enter a complete URL.'
    });
    const switchInput = document.createElement('input');
    const switchLabel = createFormSwitch('Live preview', switchInput);
    document.body.append(field, switchLabel);

    expect(field.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Canonical URL');
    expect(input.getAttribute('aria-describedby')).toContain(`${input.id}-hint`);
    expect(input.getAttribute('aria-describedby')).toContain(`${input.id}-error`);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(switchInput.type).toBe('checkbox');
    expect(switchLabel.querySelector('.form-switch__track')).not.toBeNull();
  });

  it('supports keyboard navigation for the shared tab system', () => {
    const tabsHost = document.createElement('nav');
    const panelsHost = document.createElement('div');
    const tabs = createTabSystem(panelsHost, tabsHost);
    tabs.addTab('Overview');
    tabs.addTab('Activity');
    document.body.append(tabsHost, panelsHost);

    const buttons = tabsHost.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabsHost.getAttribute('role')).toBe('tablist');
    expect(buttons[0]?.getAttribute('aria-selected')).toBe('true');
    buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(buttons[1]?.getAttribute('aria-selected')).toBe('true');
    expect(panelsHost.querySelectorAll('[role="tabpanel"]')[1]?.hasAttribute('hidden')).toBe(false);
  });

  it('creates loaders, updates progress and restores button state', () => {
    const loader = createLoader({ variant: 'skeleton', label: 'Loading cards', lines: 3 });
    const progress = createProgress('Uploading', 35);
    const button = document.createElement('button');
    button.textContent = 'Save';

    setButtonLoading(button, true, 'Saving');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    setButtonLoading(button, false);
    progress.update(150);

    expect(button.disabled).toBe(false);
    expect(loader.querySelectorAll('.bp-loader__skeleton-line')).toHaveLength(3);
    expect(progress.element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('renders dismissible semantic toasts and anchored popovers', () => {
    jest.useFakeTimers();
    const toast = bpToast.success('Saved', { title: 'Page', duration: 0 });
    expect(toast.element?.getAttribute('role')).toBe('status');
    expect(document.querySelector('.bp-toast__message')?.textContent).toBe('Saved');

    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({
      x: 20, y: 20, top: 20, left: 20, right: 120, bottom: 60,
      width: 100, height: 40, toJSON: () => ({})
    });
    document.body.appendChild(anchor);
    const handle = bpPopover.open(anchor, { content: 'Actions', ariaLabel: 'Page actions' });

    expect(anchor.getAttribute('aria-expanded')).toBe('true');
    expect(handle.panel.getAttribute('aria-label')).toBe('Page actions');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(anchor.hasAttribute('aria-expanded')).toBe(false);
    jest.runOnlyPendingTimers();
  });
});
