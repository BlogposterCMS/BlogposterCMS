/**
 * Builder dashboard fetchPartial.js
 * Provides a function to load partial HTML from the server.
 */
export async function fetchPartial(partialName, partialType = '') {
  const typePath = partialType ? `${partialType}/` : '';
  const base = '/apps/' + 'plainspace' + '/partials/';
  const url = base + `${typePath}${partialName}.html`;
  const resp = await window.fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} while fetching ${url}`);
  }
  return await resp.text();
}
