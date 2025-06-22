/**
 * public/assets/plainspace/dashboard/fetchPartial.js
 * Provides a function to load partial HTML from your server.
 * Example usage: `await fetchPartial('default-header', 'headers');`
 */
export async function fetchPartial(partialName, partialType = '') {
  const typePath = partialType ? `${partialType}/` : '';
  const url = `/assets/plainspace/partials/${partialName}.html`;
  const resp = await window.fetchWithTimeout(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} while fetching ${url}`);
  }
  return await resp.text();
}
