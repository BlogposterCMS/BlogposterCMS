/**
 * @jest-environment jsdom
 */

import { bpDialog } from '../ui/shared/dialogs/bpDialog';

function clickAction(action: string): void {
  const button = document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) throw new Error(`BP_DIALOG_TEST_ACTION_MISSING: ${action}`);
  button.click();
}

async function waitForDialog(): Promise<void> {
  await Promise.resolve();
}

describe('bpDialog', () => {
  afterEach(() => {
    document.querySelectorAll('.bp-dialog-root').forEach(el => el.remove());
  });

  it('renders alert messages in the dashboard modal shell', async () => {
    const promise = bpDialog.alert('Saved');
    await waitForDialog();

    const dialog = document.querySelector<HTMLElement>('.bp-dialog');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.classList.contains('app-scope')).toBe(true);
    expect(document.querySelector('.bp-dialog__message')?.textContent).toBe('Saved');
    expect(window.bpDialog).toBe(bpDialog);

    clickAction('ok');
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves confirmation cancel actions as false', async () => {
    const promise = bpDialog.confirm('Delete page?');
    await waitForDialog();

    expect(document.querySelector('.bp-dialog__title')?.textContent).toBe('Please confirm');
    clickAction('cancel');

    await expect(promise).resolves.toBe(false);
  });

  it('returns prompt input values without using native window.prompt', async () => {
    const nativePrompt = jest.spyOn(window, 'prompt');
    const promise = bpDialog.prompt('New page title:', 'Draft');
    await waitForDialog();
    const input = document.querySelector<HTMLInputElement>('.bp-dialog__input');

    expect(input?.value).toBe('Draft');
    if (input) input.value = 'Published';
    clickAction('submit');

    await expect(promise).resolves.toBe('Published');
    expect(nativePrompt).not.toHaveBeenCalled();
    nativePrompt.mockRestore();
  });

  it('keeps required prompts open until a value is entered', async () => {
    const promise = bpDialog.prompt('New page title:', '', {
      prompt: { label: 'Page title', required: true }
    });
    await waitForDialog();

    clickAction('submit');
    expect(document.querySelector('.bp-dialog__error')?.textContent)
      .toContain('BP_DIALOG_PROMPT_REQUIRED');

    const input = document.querySelector<HTMLInputElement>('.bp-dialog__input');
    if (input) input.value = 'Home';
    clickAction('submit');

    await expect(promise).resolves.toBe('Home');
  });
});
