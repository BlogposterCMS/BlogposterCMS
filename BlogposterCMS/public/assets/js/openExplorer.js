;(function(window) {
  async function openMediaExplorer(opts = {}) {
    const jwt = opts.jwt || window.ADMIN_TOKEN || window.PUBLIC_TOKEN;
    if (!jwt) throw new Error('openExplorer: missing JWT');
    const initialPath = opts.subPath || 'public';

    return new Promise((resolve) => {
      let settled = false;
      let currentPath = initialPath;
      let parentPath = '';

      const dialog = document.createElement('dialog');
      dialog.className = 'media-explorer';

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.className = 'close-btn';
      closeBtn.onclick = () => {
        dialog.close();
        if (!settled) {
          settled = true;
          resolve({ cancelled: true });
        }
      };

      const navBar = document.createElement('div');
      navBar.className = 'media-nav';
      const backBtn = document.createElement('button');
      backBtn.textContent = '←';
      const pathLabel = document.createElement('span');
      pathLabel.className = 'path-display';
      navBar.appendChild(backBtn);
      navBar.appendChild(pathLabel);

      const uploadBtn = document.createElement('button');
      uploadBtn.textContent = 'Upload';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      uploadBtn.onclick = () => fileInput.click();
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        try {
          const resp = await window.fetchWithTimeout(
            '/admin/api/upload?subPath=' + encodeURIComponent(currentPath),
            {
              method: 'POST',
              headers: { 'X-CSRF-Token': window.CSRF_TOKEN },
              body: form,
              credentials: 'same-origin'
            }
          );
          const json = await resp.json();
          if (!resp.ok || json.error) throw new Error(json.error || resp.statusText);
          await loadList(currentPath);
        } catch (err) {
          alert('Upload failed: ' + err.message);
        }
      };

      const grid = document.createElement('div');
      grid.className = 'media-grid';

      dialog.appendChild(closeBtn);
      dialog.appendChild(navBar);
      dialog.appendChild(uploadBtn);
      dialog.appendChild(fileInput);
      dialog.appendChild(grid);

      backBtn.onclick = () => {
        if (parentPath !== undefined) {
          loadList(parentPath);
        }
      };

      async function choose(fullPath) {
        try {
          const { shareURL, shortToken } = await window.meltdownEmit('createShareLink', {
            jwt,
            moduleName: 'shareManager',
            moduleType: 'core',
            filePath: fullPath
          });
          dialog.close();
          if (!settled) {
            settled = true;
            resolve({ shareURL, name: fullPath, objectId: shortToken });
          }
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }

      async function loadList(path = '') {
        currentPath = path;
        try {
          const res = await window.meltdownEmit('listLocalFolder', {
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

          folders.forEach((name) => {
            const item = document.createElement('div');
            item.className = 'media-item folder';
            item.innerHTML =
              '<div class="media-icon">📁</div><div class="media-name"></div>';
            item.querySelector('.media-name').textContent = name;
            item.onclick = () => loadList(currentPath ? currentPath + '/' + name : name);
            grid.appendChild(item);
          });

          files.forEach((name) => {
            const item = document.createElement('div');
            item.className = 'media-item file';
            item.innerHTML =
              '<div class="media-icon">🖼️</div><div class="media-name"></div>';
            item.querySelector('.media-name').textContent = name;
            const full = currentPath ? currentPath + '/' + name : name;
            item.onclick = () => choose(full);
            grid.appendChild(item);
          });
        } catch (err) {
          grid.innerHTML = '';
          const pEl = document.createElement('p');
          pEl.textContent = 'Error: ' + err.message;
          grid.appendChild(pEl);
        }
      }

      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => dialog.remove());
      loadList(initialPath);
      dialog.showModal();
    });
  }

  window._openMediaExplorer = openMediaExplorer;
})(window);
