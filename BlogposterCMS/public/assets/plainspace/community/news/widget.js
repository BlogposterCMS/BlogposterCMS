export async function render(el) {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN || window.PUBLIC_TOKEN;
  const container = document.createElement('div');

  const select = document.createElement('select');
  [0,15,30,60].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v ? `${v} min` : 'off';
    select.appendChild(opt);
  });
  select.addEventListener('change', async () => {
    await meltdownEmit('news.setCron', { jwt, moduleName: 'news', moduleType: 'community', minutes: Number(select.value) });
  });

  const btn = document.createElement('button');
  btn.textContent = 'Fetch Now';
  btn.addEventListener('click', async () => {
    const data = await meltdownEmit('news.fetchNow', { jwt, moduleName: 'news', moduleType: 'community' });
    output.textContent = JSON.stringify(data, null, 2);
  });

  const output = document.createElement('pre');
  output.style.whiteSpace = 'pre-wrap';

  container.appendChild(select);
  container.appendChild(btn);
  container.appendChild(output);
  el.appendChild(container);

  try {
    const latest = await meltdownEmit('news.getLatest', { jwt, moduleName: 'news', moduleType: 'community' });
    if (latest) output.textContent = JSON.stringify(latest, null, 2);
  } catch (e) {
    output.textContent = e.message;
  }
}
