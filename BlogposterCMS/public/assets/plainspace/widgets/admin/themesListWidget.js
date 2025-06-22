export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;

  try {
    const res = await meltdownEmit('listThemes', {
      jwt,
      moduleName: 'themeManager',
      moduleType: 'core'
    });
    const themes = Array.isArray(res) ? res : (res?.data ?? []);

    const list = document.createElement('ul');
    list.className = 'themes-list';

    if (!themes.length) {
      const empty = document.createElement('li');
      empty.textContent = 'No themes found.';
      list.appendChild(empty);
    } else {
      themes.forEach(t => {
        const li = document.createElement('li');
        const ver = t.version ? ` v${t.version}` : '';
        const desc = t.description ? ` - ${t.description}` : '';
        li.textContent = `${t.name || t.theme || 'Unknown'}${ver}${desc}`;
        list.appendChild(li);
      });
    }

    el.innerHTML = '';
    el.appendChild(list);
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load themes: ${err.message}</div>`;
  }
}
