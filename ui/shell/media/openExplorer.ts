import {
  createMediaExplorerSurface,
  type MediaExplorerSelection
} from '../../shared/media/mediaExplorerSurface.js';

export interface OpenMediaExplorerOptions {
  jwt?: string;
  subPath?: string;
}

export interface OpenMediaExplorerResult {
  cancelled?: boolean;
  shareURL?: string;
  name?: string;
  objectId?: string;
}

export async function openMediaExplorer(opts: OpenMediaExplorerOptions = {}): Promise<OpenMediaExplorerResult> {
  const jwt = opts.jwt || window.ADMIN_TOKEN || window.PUBLIC_TOKEN;
  if (!jwt) throw new Error('openExplorer: missing JWT');
  const initialPath = opts.subPath || 'public';

  return new Promise(resolve => {
    let settled = false;

    function settle(result: OpenMediaExplorerResult): void {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'media-explorer-dialog';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'media-explorer-dialog__close';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    const closeIcon = document.createElement('img');
    closeIcon.src = '/assets/icons/x.svg';
    closeIcon.alt = '';
    closeIcon.setAttribute('aria-hidden', 'true');
    closeBtn.appendChild(closeIcon);
    closeBtn.onclick = () => {
      dialog.close();
      settle({ cancelled: true });
    };

    const surface = createMediaExplorerSurface({
      mode: 'picker',
      jwt,
      emit: window.meltdownEmit,
      uploadFetch: window.fetchWithTimeout,
      csrfToken: window.CSRF_TOKEN,
      initialPath,
      accept: 'image/*',
      enableMutations: false,
      onSelectFile: (selection: MediaExplorerSelection) => {
        settle({
          shareURL: selection.shareURL,
          name: selection.name,
          objectId: selection.shortToken
        });
        dialog.close();
      }
    });

    dialog.append(closeBtn, surface.element);
    dialog.addEventListener('close', () => {
      settle({ cancelled: true });
      dialog.remove();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

window._openMediaExplorer = openMediaExplorer;
