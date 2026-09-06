/** @jest-environment jsdom */
import { openWidgetsPanel } from '../ui/widgets/panel/widgetsPanel';

jest.mock('../ui/widgets/panel/widgetPanelAddWidget', () => ({ addDashboardWidget: jest.fn() }));
jest.mock('../ui/widgets/panel/widgetPanelCatalog', () => ({ bindWidgetPanelCatalog: jest.fn() }));

it('focuses search on open and returns focus on Escape without keeping hidden controls active', () => {
  const toggle = document.createElement('button');
  toggle.id = 'widgets-toggle-inline';
  document.body.appendChild(toggle);
  openWidgetsPanel();
  const panel = document.getElementById('widgets-panel')!;
  expect(panel.inert).toBe(false);
  expect(document.activeElement).toBe(panel.querySelector('input'));
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(panel.inert).toBe(true);
  expect(panel.classList.contains('open')).toBe(false);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);
});
