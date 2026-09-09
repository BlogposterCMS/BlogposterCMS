/** @jest-environment jsdom */
import { openMediaExplorer } from '../ui/shell/media/openExplorer';
import { createMediaExplorerSurface } from '../ui/shared/media/mediaExplorerSurface';
jest.mock('../ui/shared/media/mediaExplorerSurface', () => ({ createMediaExplorerSurface: jest.fn(() => ({ element: document.createElement('div') })) }));

it('keeps image selection as default and supports videos in the same media picker', async () => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = function () { this.dispatchEvent(new Event('close')); };
  for (const accept of [undefined, 'video/*'] as const) {
    const pending = openMediaExplorer({ jwt: 'test', accept, publicUrlOnly: true });
    expect(createMediaExplorerSurface).toHaveBeenLastCalledWith(expect.objectContaining({ accept: accept || 'image/*', publicUrlOnly: true }));
    document.querySelector<HTMLDialogElement>('dialog')!.close();
    await expect(pending).resolves.toEqual({ cancelled: true });
  }
});
