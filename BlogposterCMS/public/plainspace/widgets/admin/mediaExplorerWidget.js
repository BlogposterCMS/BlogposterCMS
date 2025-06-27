export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const emitter = window.meltdownEmit;

  const container = document.createElement('div');
  container.className = 'media-explorer';

  const navBar = document.createElement('div');
  navBar.className = 'media-nav';
  const backBtn = document.createElement('button');
  backBtn.textContent = '←';
  const pathLabel = document.createElement('span');
  pathLabel.className = 'path-display';
  navBar.appendChild(backBtn);
  navBar.appendChild(pathLabel);

  const controlBar = document.createElement('div');
  controlBar.className = 'media-controls';
  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = '+';
  uploadBtn.title = 'Upload file';
  const folderBtn = document.createElement('button');
  folderBtn.textContent = '📁+';
  folderBtn.title = 'New folder';
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'file';
  hiddenInput.style.display = 'none';
  controlBar.appendChild(uploadBtn);
  controlBar.appendChild(folderBtn);
  controlBar.appendChild(hiddenInput);

  const grid = document.createElement('div');
  grid.className = 'media-grid';

  container.appendChild(navBar);
  container.appendChild(controlBar);
  container.appendChild(grid);

  let currentPath = '';
  let parentPath = '';

  uploadBtn.onclick = () => hiddenInput.click();
  hiddenInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const resp = await window.fetchWithTimeout('/admin/api/upload?subPath=' + encodeURIComponent(currentPath), {
        method: 'POST',
        headers: { 'X-CSRF-Token': window.CSRF_TOKEN },
        body: form,
        credentials: 'same-origin'
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || resp.statusText);
      await load(currentPath);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };

  folderBtn.onclick = async () => {
    const name = prompt('New folder name:');
    if (!name) return;
    try {
      await emitter('createLocalFolder', {
        jwt,
        moduleName: 'mediaManager',
        moduleType: 'core',
        currentPath,
        newFolderName: name
      });
      await load(currentPath);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  backBtn.onclick = () => {
    if (parentPath !== undefined) {
      load(parentPath);
    }
  };

  async function share(fullPath) {
    try {
      const { shareURL } = await emitter('createShareLink', {
        jwt,
        moduleName: 'shareManager',
        moduleType: 'core',
        filePath: fullPath
      });
      prompt('Share link', shareURL);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function load(path = '') {
    currentPath = path;
    try {
      const res = await emitter('listLocalFolder', {
        jwt,
        moduleName: 'mediaManager',
        moduleType: 'core',
        subPath: path
      });
      const { folders = [], files = [], parentPath: p = '' } = res || {};
      parentPath = p;
      pathLabel.textContent = '/' + (currentPath || '');
      backBtn.disabled = !currentPath;
      grid.innerHTML = '';
      if (folders.length === 0 && files.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'This folder is empty.';
        grid.appendChild(empty);
      }
      folders.forEach(name => {
        const item = document.createElement('div');
        item.className = 'media-item folder';
        item.innerHTML = '<div class="media-icon">📁</div><div class="media-name"></div>';
        item.querySelector('.media-name').textContent = name;
        item.onclick = () => load(path ? path + '/' + name : name);
        const shareBtn = document.createElement('button');
        shareBtn.textContent = 'share';
        shareBtn.onclick = (ev) => {
          ev.stopPropagation();
          const full = (path ? path + '/' + name : name);
          share(full);
        };
        item.appendChild(shareBtn);
        grid.appendChild(item);
      });
      files.forEach(name => {
        const item = document.createElement('div');
        item.className = 'media-item file';
        item.innerHTML = '<div class="media-icon">🖼️</div><div class="media-name"></div>';
        item.querySelector('.media-name').textContent = name;
        const shareBtn = document.createElement('button');
        shareBtn.textContent = 'share';
        shareBtn.onclick = (ev) => {
          ev.stopPropagation();
          const full = path ? path + '/' + name : name;
          share(full);
        };
        item.appendChild(shareBtn);
        grid.appendChild(item);
      });
    } catch (err) {
      grid.innerHTML = `<p>Error: ${err.message}</p>`;
    }
  }

  el.innerHTML = '';
  el.appendChild(container);
  load();
}
