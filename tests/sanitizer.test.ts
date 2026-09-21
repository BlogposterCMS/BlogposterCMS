/** @jest-environment jsdom */

import { sanitizeHtml } from '../ui/shared/sanitize/sanitizer';

function sanitizedDocument(html: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = sanitizeHtml(html);
  return root;
}

describe('sanitizeHtml', () => {
  test('removes executable URL schemes, including entity-encoded variants', () => {
    const root = sanitizedDocument(`
      <a id="direct" href="javascript:alert(1)">direct</a>
      <a id="entity" href="jav&#x61;script:alert(1)">entity</a>
      <a id="control" href="java&#10;script:alert(1)">control</a>
      <a id="data" href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">data</a>
      <form><button formaction="javascript:alert(1)">send</button></form>
    `);

    expect(root.querySelector('#direct')?.hasAttribute('href')).toBe(false);
    expect(root.querySelector('#entity')?.hasAttribute('href')).toBe(false);
    expect(root.querySelector('#control')?.hasAttribute('href')).toBe(false);
    expect(root.querySelector('#data')?.hasAttribute('href')).toBe(false);
    expect(root.querySelector('button')?.hasAttribute('formaction')).toBe(false);
  });

  test('removes event handlers, iframe srcdoc, and active malformed SVG markup', () => {
    const sanitized = sanitizeHtml(`
      <img src="/safe.png" onerror="alert(1)">
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <svg><g onload="alert(1)"><a xlink:href="javascript:alert(1)">x</a></g></svg>
      <svg><p><style><g title="</style><img src=x onerror=alert(1)>">
    `);

    expect(sanitized).not.toMatch(/\bon\w+\s*=/i);
    expect(sanitized).not.toMatch(/javascript\s*:/i);
    expect(sanitized).not.toMatch(/\bsrcdoc\s*=/i);
    expect(sanitized).not.toMatch(/<\/?iframe\b/i);
    expect(sanitized).not.toMatch(/<script\b/i);
  });

  test('preserves ordinary CMS markup, links, controls, data, aria, and safe CSS', () => {
    const root = sanitizedDocument(`
      <section class="hero" data-layout-id="hero-1" aria-label="Hero" style="color: red; background-image: url(https://cdn.example/image.png); width: expression(alert(1))">
        <h2>Welcome</h2>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1h14v14H1z"></path></svg>
        <a href="https://example.com/docs" target="_blank" rel="noopener">Docs</a>
        <form action="/subscribe" method="post">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required>
          <select name="locale"><option value="de" selected>Deutsch</option></select>
          <button type="submit">Subscribe</button>
        </form>
        <style>.hero { color: red; background-image: url(https://cdn.example/image.png); width: expression(alert(1)); }</style>
      </section>
    `);

    const section = root.querySelector('section');
    expect(section?.className).toBe('hero');
    expect(section?.getAttribute('data-layout-id')).toBe('hero-1');
    expect(section?.getAttribute('aria-label')).toBe('Hero');
    expect(section?.getAttribute('style')).toContain('color: red');
    expect(section?.getAttribute('style')).toContain('https://cdn.example/image.png');
    expect(section?.getAttribute('style')).not.toMatch(/expression/i);
    expect(root.querySelector('svg path')?.getAttribute('d')).toBe('M1 1h14v14H1z');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com/docs');
    expect(root.querySelector('a')?.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('form')?.getAttribute('action')).toBe('/subscribe');
    expect(root.querySelector<HTMLInputElement>('#email')?.required).toBe(true);
    expect(root.querySelector<HTMLOptionElement>('option')?.selected).toBe(true);
    expect(root.querySelector('style')?.textContent).toContain('color: red');
    expect(root.querySelector('style')?.textContent).not.toMatch(/expression/i);
  });

  test('preserves a sanitized style block at the start of an HTML fragment', () => {
    const root = sanitizedDocument('<style>.sample { color: green; width: expression(alert(1)); }</style><p>Text</p>');

    expect(root.firstElementChild?.tagName).toBe('STYLE');
    expect(root.querySelector('style')?.textContent).toContain('color: green');
    expect(root.querySelector('style')?.textContent).not.toMatch(/expression/i);
    expect(root.querySelector('p')?.textContent).toBe('Text');
  });

  test('drops unsafe CSS URLs without discarding safe neighboring declarations', () => {
    const root = sanitizedDocument('<div style="color: green; background: url(javascript:alert(1)); padding: 1rem">safe</div>');
    const style = root.querySelector('div')?.getAttribute('style') ?? '';

    expect(style).toContain('color: green');
    expect(style).toContain('padding: 1rem');
    expect(style).not.toMatch(/javascript|background/i);
  });
});
