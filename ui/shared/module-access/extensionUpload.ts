/** Shared file picker; the owning module/widget client performs inspection and installation. */
export function openExtensionUpload(install: (zipData: string, fileName: string, status: HTMLElement) => Promise<boolean>): void {
  const overlay = document.createElement('div');
  overlay.className = 'module-upload-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Install extension');
  const box = document.createElement('div');
  box.className = 'module-upload-box';
  const label = document.createElement('label');
  label.textContent = 'Drop one ZIP file here or choose a file (up to 10 MiB)';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.zip,application/zip';
  label.append(input);
  const status = document.createElement('p');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const cancel = document.createElement('button');
  cancel.className = 'button secondary sm'; cancel.textContent = 'Cancel';
  let busy = false;
  const previous = document.activeElement as HTMLElement | null;
  const close = () => { if (!busy) { overlay.remove(); previous?.focus(); } };
  cancel.addEventListener('click', close);
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  async function handle(files: FileList | null): Promise<void> {
    if (busy || !files?.length) return;
    if (files.length !== 1 || !/\.zip$/i.test(files[0]!.name) || files[0]!.size > 10 * 1024 * 1024) {
      status.textContent = 'EXTENSION_FILE_INVALID: Choose one ZIP up to 10 MiB.';
      return;
    }
    busy = true; input.disabled = true; cancel.disabled = true;
    status.textContent = 'Inspecting package…';
    try {
      const file = files[0]!;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('EXTENSION_FILE_READ_FAILED'));
        reader.onabort = () => reject(new Error('EXTENSION_FILE_READ_ABORTED'));
        reader.readAsDataURL(file);
      });
      if (await install(data, file.name, status)) { overlay.remove(); previous?.focus(); }
      else status.textContent = 'Installation cancelled. No access granted.';
    } catch (err) {
      status.setAttribute('role', 'alert');
      status.textContent = err instanceof Error ? err.message : String(err);
    } finally { busy = false; input.disabled = false; cancel.disabled = false; }
  }
  input.addEventListener('change', () => void handle(input.files));
  box.addEventListener('dragover', event => { event.preventDefault(); box.classList.add('dragover'); });
  box.addEventListener('dragleave', () => box.classList.remove('dragover'));
  box.addEventListener('drop', event => { event.preventDefault(); box.classList.remove('dragover'); void handle(event.dataTransfer?.files || null); });
  box.append(label, status, cancel); overlay.append(box); document.body.append(overlay); input.focus();
}
