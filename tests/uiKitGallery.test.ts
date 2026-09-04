/**
 * @jest-environment jsdom
 */

import { renderUiKitGallery } from '../ui/widgets/plainspace/admin/settings/uiKitGallery';
import { bpToast } from '../ui/shared/feedback/toast';

describe('Blogposter UI Kit gallery', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    bpToast.clear();
  });

  it('renders every canonical component family with live controls', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    renderUiKitGallery(host);

    expect(host.querySelector('[data-ui-kit-gallery="true"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-ui-kit-section]')).toHaveLength(8);
    expect(host.querySelector('[data-ui-kit-section="buttons"] .button.primary')).not.toBeNull();
    expect(host.querySelector('[data-ui-kit-section="fields"] textarea')).not.toBeNull();
    expect(host.querySelector('[data-ui-kit-section="pickers"] .custom-select')).not.toBeNull();
    expect(host.querySelector('[data-ui-kit-section="overlays"] [aria-haspopup="menu"]')).not.toBeNull();
    expect(host.querySelector('[data-ui-kit-section="loading"] [role="progressbar"]')).not.toBeNull();
    expect(host.querySelector('[data-ui-kit-section="data"] [role="tablist"]')).not.toBeNull();
    expect(host.querySelector('.bp-table')).not.toBeNull();
    expect(host.querySelector('.bp-empty-state')).not.toBeNull();
  });

  it('opens the shared toast from a gallery example', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderUiKitGallery(host);

    const infoButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent === 'Info toast');
    infoButton?.click();

    expect(document.querySelector('.bp-toast--info .bp-toast__message')?.textContent)
      .toBe('A neutral update is available.');
  });
});
