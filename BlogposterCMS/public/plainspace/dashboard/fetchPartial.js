export async function fetchPartial(partialName, partialType = '') {
  const safeName = String(partialName).replace(/[^a-zA-Z0-9_-]/g, '');
  const typePath = partialType ? `${partialType}/` : '';
  const base = '/plainspace/partials/';
  const url = base + `${typePath}${safeName}.html`;
  const resp = await window.fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} while fetching ${url}`);
  }
  return await resp.text();
}
