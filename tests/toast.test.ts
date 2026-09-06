/** @jest-environment jsdom */
import { bpToast, showToast } from '../ui/shared/feedback/toast';

beforeEach(() => { jest.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { bpToast.clear(); jest.clearAllTimers(); jest.useRealTimers(); });

test('keeps at most the three newest cards, including during exit animations', () => {
  const first = showToast({ message: 'First' });
  showToast({ message: 'Second' });
  showToast({ message: 'Third' });
  first.dismiss();
  const newest = showToast({ message: 'Fourth' });
  expect(first.element?.isConnected).toBe(false);
  expect(Array.from(document.querySelectorAll('.bp-toast__message'), el => el.textContent)).toEqual(['Fourth', 'Third', 'Second']);
  jest.advanceTimersByTime(200);
  expect(newest.element?.isConnected).toBe(true);
});

test('expires after three seconds and clears the empty region', () => {
  const toast = showToast({ message: 'Saved' });
  jest.advanceTimersByTime(2999);
  expect(toast.element?.classList.contains('is-leaving')).toBe(false);
  jest.advanceTimersByTime(1);
  expect(toast.element?.classList.contains('is-leaving')).toBe(true);
  jest.advanceTimersByTime(160);
  expect(document.querySelector('#bp-toast-region')).toBeNull();
});

test('hover and keyboard focus pause the remaining time without starting overlapping timers', () => {
  const toast = showToast({ message: 'Read me' }).element!;
  jest.advanceTimersByTime(1000);
  toast.dispatchEvent(new Event('mouseenter'));
  toast.dispatchEvent(new FocusEvent('focusin'));
  jest.advanceTimersByTime(10000);
  toast.dispatchEvent(new Event('mouseleave'));
  jest.advanceTimersByTime(10000);
  expect(toast.classList.contains('is-leaving')).toBe(false);
  toast.dispatchEvent(new FocusEvent('focusout'));
  jest.advanceTimersByTime(1999);
  expect(toast.classList.contains('is-leaving')).toBe(false);
  jest.advanceTimersByTime(1);
  expect(toast.classList.contains('is-leaving')).toBe(true);
});

test('clear also disposes pending cards and cannot remove a later notification', () => {
  const pending = showToast({ message: 'Working', duration: 0 });
  jest.advanceTimersByTime(10000);
  expect(pending.element?.isConnected).toBe(true);
  bpToast.clear();
  expect(pending.element?.isConnected).toBe(false);
  const next = showToast({ message: 'Next', duration: 0 });
  pending.dismiss();
  jest.advanceTimersByTime(10000);
  expect(next.element?.isConnected).toBe(true);
});

test('invalid duration falls back to three seconds and messages stay plain text', () => {
  const toast = showToast({ message: '<img src=x onerror=alert(1)>', duration: NaN }).element!;
  expect(toast.querySelector('.bp-toast__message')?.children).toHaveLength(0);
  jest.advanceTimersByTime(3160);
  expect(toast.isConnected).toBe(false);
});

test('actions run once and synchronous failures are reported without an unhandled exception', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const onClick = jest.fn(() => { throw new Error('Action failed'); });
  const toast = showToast({ message: 'Undo available', action: { label: 'Undo', onClick } }).element!;
  const action = toast.querySelector<HTMLButtonElement>('.bp-toast__action')!;
  action.click(); action.click();
  await Promise.resolve(); await Promise.resolve();
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('BP_TOAST_ACTION_FAILED'), expect.any(Error));
  log.mockRestore();
});

test('an older card without the disposal hook cannot block a new bundle', () => {
  showToast({ message: 'Current' });
  const region = document.querySelector('#bp-toast-region')!;
  region.append(document.createElement('article'), document.createElement('article'), document.createElement('article'));
  showToast({ message: 'New' });
  expect(region.childElementCount).toBe(3);
});
