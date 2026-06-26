export async function fetchPartial(partialName: string, partialType = ''): Promise<string> {
  const safeName = String(partialName).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeType = String(partialType).replace(/[^a-zA-Z0-9_-]/g, '');
  const typePath = safeType ? `${safeType}/` : '';
  const base = '/plainspace/partials/';
  const url = base + `${typePath}${safeName}.html`;
  const request = window.fetchWithTimeout ?? ((resource: RequestInfo | URL, options?: RequestInit) => fetch(resource, options));
  const resp = await request(url);

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} while fetching ${url}`);
  }

  return await resp.text();
}
