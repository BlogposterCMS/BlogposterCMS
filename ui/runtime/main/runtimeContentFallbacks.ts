import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';

export function appendRuntimeHtmlContent(
  target: HTMLElement,
  html: unknown
): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = sanitizeHtml(String(html || ''));
  target.appendChild(div);
  return div;
}

export function appendRuntimeEmptyState(
  target: HTMLElement,
  message = 'No widgets configured.'
): HTMLElement {
  const msg = document.createElement('p');
  msg.className = 'empty-state';
  msg.textContent = message;
  target.appendChild(msg);
  return msg;
}
