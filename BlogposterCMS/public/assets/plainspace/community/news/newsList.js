export async function render(el) {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN || window.PUBLIC_TOKEN;

  const card = document.createElement('div');
  card.className = 'news-list-card';

  const titleBar = document.createElement('div');
  titleBar.className = 'news-title-bar';

  const title = document.createElement('div');
  title.className = 'news-title';
  title.textContent = 'News';

  const controls = document.createElement('div');
  controls.className = 'news-controls';

  const select = document.createElement('select');
  [0, 15, 30, 60].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v ? `${v} min` : 'off';
    select.appendChild(opt);
  });

  select.addEventListener('change', async () => {
    await meltdownEmit('news.setCron', {
      jwt,
      moduleName: 'news',
      moduleType: 'community',
      minutes: Number(select.value)
    });
  });

  const btn = document.createElement('button');
  btn.textContent = 'Fetch Now';
  
  btn.addEventListener('click', async () => {
    const pendingLi = appendPendingItem();
    try {
      await meltdownEmit('news.fetchNow', { jwt, moduleName: 'news', moduleType: 'community' });
      await loadHistory();
    } catch (err) {
      pendingLi.textContent = `Fetch failed: ${err.message}`;
    }
  });

  controls.appendChild(select);
  controls.appendChild(btn);
  titleBar.appendChild(title);
  titleBar.appendChild(controls);
  card.appendChild(titleBar);

  const list = document.createElement('ul');
  list.className = 'news-list';
  card.appendChild(list);

  el.innerHTML = '';
  el.appendChild(card);

  async function loadHistory() {
    try {
      const history = await meltdownEmit('news.listHistory', {
        jwt,
        moduleName: 'news',
        moduleType: 'community',
        limit: 10
      });
      renderList(Array.isArray(history) ? history : []);
    } catch (err) {
      list.innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  function renderList(items) {
    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No news yet.';
      list.appendChild(empty);
      return;
    }
    items
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .forEach(it => {
        const created = it.created_at ? new Date(it.created_at * 1000) : new Date();
        appendItem(it, created);
      });
  }

  function appendItem(data, date) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `/admin/news/news-details?id=${encodeURIComponent(data.id)}`;

    const p = document.createElement('p');
    p.className = 'news-text';
    p.textContent = `News from ${date.toLocaleString()}`;

    link.appendChild(p);
    li.appendChild(link);
    list.appendChild(li);
  }

  function appendPendingItem() {
    const li = document.createElement('li');
    li.className = 'loading-item';
    li.textContent = '⏳ Warte auf Antwort...';
    list.insertBefore(li, list.firstChild);
    return li;
  }

  await loadHistory();
}
