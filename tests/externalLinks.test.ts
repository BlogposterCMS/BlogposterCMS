/**
 * @jest-environment jsdom
 */

async function loadEnhancer(): Promise<typeof import('../ui/shared/controls/externalLinks').default> {
  jest.resetModules();
  const mod = await import('../ui/shared/controls/externalLinks');
  return mod.default;
}

describe('global external link enhancer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', 'http://localhost/admin/home');
  });

  it('marks only cross-origin http links as external', async () => {
    document.body.innerHTML = `
      <main>
        <a id="external" href="https://example.com/docs">External</a>
        <a id="same-origin" href="http://localhost/admin/pages">Same origin</a>
        <a id="relative" href="/admin/pages">Relative</a>
        <a id="mail" href="mailto:hello@example.com">Mail</a>
      </main>
    `;

    const enhanceExternalLinks = await loadEnhancer();
    enhanceExternalLinks(document);

    expect(document.getElementById('external')?.dataset.externalLink).toBe('true');
    expect(document.getElementById('same-origin')?.dataset.externalLink).toBeUndefined();
    expect(document.getElementById('relative')?.dataset.externalLink).toBeUndefined();
    expect(document.getElementById('mail')?.dataset.externalLink).toBeUndefined();
  });

  it('updates links inserted or changed after startup', async () => {
    const enhanceExternalLinks = await loadEnhancer();
    enhanceExternalLinks(document);

    const host = document.createElement('div');
    host.innerHTML = '<a id="dynamic" href="https://docs.example.com">Docs</a>';
    document.body.appendChild(host);

    await new Promise(resolve => setTimeout(resolve, 0));

    const dynamicLink = document.getElementById('dynamic') as HTMLAnchorElement;
    expect(dynamicLink.dataset.externalLink).toBe('true');

    dynamicLink.href = '/admin/home';
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dynamicLink.dataset.externalLink).toBeUndefined();
  });
});
