/** @jest-environment jsdom */
import { readPublicBootstrap } from '../ui/runtime/publicBootstrap';

afterEach(() => {
  delete (window as any).BP_PUBLIC_BOOTSTRAP;
  delete window.LANG;
  jest.restoreAllMocks();
});

test('accepts the exact pathname while preserving the server-normalized nested slug', () => {
  window.history.replaceState({}, '', '/Guides/Install/');
  const bootstrap = { version: 1, pathname: '/Guides/Install/', slug: 'guides/install', language: 'en', envelope: { attachments: [] } };
  (window as any).BP_PUBLIC_BOOTSTRAP = bootstrap;
  expect(readPublicBootstrap()).toBe(bootstrap);
});

test('a stale route or language discards initial DOM before falling back to CSR', () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  window.history.replaceState({}, '', '/new');
  document.body.innerHTML = '<div id="bp-initial-html">Old</div>';
  (window as any).BP_PUBLIC_BOOTSTRAP = { version: 1, pathname: '/old', slug: 'old', language: 'en', envelope: { attachments: [] } };
  expect(readPublicBootstrap()).toBeNull();
  expect(document.getElementById('bp-initial-html')).toBeNull();
});

test('compact HTML handoff restores the existing descriptor from initial DOM without changing the wire snapshot', () => {
  window.history.replaceState({}, '', '/page');
  document.body.innerHTML = '<div id="bp-initial-html"><h1>Published</h1></div>';
  const bootstrap = { version: 2, pathname: '/page', slug: 'page', language: 'en', htmlRendered: true,
    envelope: { attachments: [{ type: 'html', descriptor: { htmlFromInitialResponse: true, inline: { js: 'init()' } } }] } };
  (window as any).BP_PUBLIC_BOOTSTRAP = bootstrap;
  expect(readPublicBootstrap()?.envelope.attachments?.[0]?.descriptor).toMatchObject({
    inline: { html: '<h1>Published</h1>', js: 'init()' }
  });
  expect(bootstrap.envelope.attachments[0]?.descriptor.inline).not.toHaveProperty('html');
});

test('compact handoffs without their DOM fall back to canonical CSR discovery', () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  window.history.replaceState({}, '', '/page');
  document.body.innerHTML = '';
  (window as any).BP_PUBLIC_BOOTSTRAP = { version: 2, pathname: '/page', slug: 'page', language: 'en', htmlRendered: true, envelope: { attachments: [] } };
  expect(readPublicBootstrap()).toBeNull();
});
