/** @jest-environment jsdom */
import { mountTooltips } from '../ui/shared/overlays/tooltip';
import { openPopover, bpPopover } from '../ui/shared/overlays/popover';
import { contentEditorHeader } from '../ui/shared/article/contentEditorHeader';
import { createContentLanguageControl } from '../ui/shared/localization/languageControl';

const disposers: Array<() => void> = [];
function control(disabled = false) {
  const root = document.createElement('div');
  const button = document.createElement('button'); button.dataset.bpTooltip = 'Bold'; button.disabled = disabled;
  root.append(button); document.body.append(root);
  const tips = mountTooltips(root); disposers.push(tips.stop);
  return { root, button, tips };
}
const panel = () => document.querySelector<HTMLElement>('.bp-tooltip:not(.is-leaving)');
const hover = (element: HTMLElement, type = 'pointerover') => element.dispatchEvent(new Event(type, { bubbles: true }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => { disposers.splice(0).forEach(stop => stop()); bpPopover.close(); jest.runOnlyPendingTimers(); jest.useRealTimers(); document.body.replaceChildren(); });

test('mouse hints wait briefly, remain hoverable, and clean up their description', () => {
  const { button } = control(); button.setAttribute('aria-describedby', 'existing');
  hover(button); jest.advanceTimersByTime(219); expect(panel()).toBeNull();
  jest.advanceTimersByTime(1); expect(panel()?.textContent).toBe('Bold');
  expect(button.getAttribute('aria-describedby')).toContain('existing bp-popover-');
  hover(button, 'pointerout'); panel()!.dispatchEvent(new Event('pointerenter'));
  jest.advanceTimersByTime(150); expect(panel()).not.toBeNull();
  panel()!.dispatchEvent(new Event('pointerleave')); jest.advanceTimersByTime(121);
  expect(panel()).toBeNull(); expect(button.getAttribute('aria-describedby')).toBe('existing');
});

test('keyboard focus opens immediately; Escape keeps the containing dialog and focus', () => {
  const { button } = control(); const outerEscape = jest.fn();
  document.addEventListener('keydown', outerEscape);
  button.focus(); expect(panel()).not.toBeNull();
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(panel()).toBeNull(); expect(document.activeElement).toBe(button); expect(outerEscape).not.toHaveBeenCalled();
  document.removeEventListener('keydown', outerEscape);
});

test('disabled controls explain availability and a click clears the hint', () => {
  const { button } = control(true); hover(button); jest.advanceTimersByTime(220);
  expect(panel()?.textContent).toContain('unavailable in the current context');
  button.dispatchEvent(new Event('pointerdown', { bubbles: true })); expect(panel()).toBeNull();
});

test('hover never replaces an interactive picker and removed scopes cancel delayed hints', () => {
  const { button, tips, root } = control();
  const picker = openPopover(button, { content: 'Language picker', role: 'dialog' });
  hover(button); jest.advanceTimersByTime(250); expect(panel()).toBeNull(); expect(picker.panel.classList.contains('is-leaving')).toBe(false);
  picker.close(); hover(button); tips.stop(); root.remove(); jest.advanceTimersByTime(250); expect(panel()).toBeNull();
});

test('header and language icons keep accessible names without native title attributes', () => {
  const header = contentEditorHeader({ title: 'Draft' }, () => {}, () => {});
  const language = createContentLanguageControl(() => 'en', () => 'en', async () => {});
  expect(header.studio.hasAttribute('title')).toBe(false);
  expect(header.studio.getAttribute('aria-label')).toBe('Open in Design Studio');
  expect(language.button.hasAttribute('title')).toBe(false);
  expect(language.button.dataset.bpTooltip).toBe('Content language');
  header.destroy(); language.close();
});
