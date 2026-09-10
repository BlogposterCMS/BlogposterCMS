/** @jest-environment jsdom */
import { createWidgetHeartbeat } from '../ui/widgets/rendering/widgetHeartbeat';

let hidden = false;
let heartbeat: ReturnType<typeof createWidgetHeartbeat>;
let send: jest.Mock, timeout: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  hidden = false;
  jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  send = jest.fn(); timeout = jest.fn();
});
afterEach(() => {
  heartbeat?.dispose();
  jest.restoreAllMocks(); jest.useRealTimers();
});
function visibility(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

test('a foreground worker that never replies still times out after ten seconds', () => {
  heartbeat = createWidgetHeartbeat(send, timeout);
  jest.advanceTimersByTime(9999);
  expect(timeout).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(timeout).toHaveBeenCalledTimes(1);
  const count = send.mock.calls.length;
  jest.advanceTimersByTime(30000);
  expect(send).toHaveBeenCalledTimes(count);
  expect(jest.getTimerCount()).toBe(0);
});

test('normal replies keep the worker alive without depending on the system clock', () => {
  heartbeat = createWidgetHeartbeat(send, timeout);
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(2000);
    heartbeat.reply();
  }
  jest.setSystemTime(Date.now() + 3600000);
  jest.advanceTimersByTime(2000);
  expect(timeout).not.toHaveBeenCalled();
});

test('a hidden tab sends no probes and gets a fresh response window on return', () => {
  heartbeat = createWidgetHeartbeat(send, timeout);
  jest.advanceTimersByTime(8000);
  visibility(true);
  const count = send.mock.calls.length;
  jest.advanceTimersByTime(120000);
  expect(send).toHaveBeenCalledTimes(count);
  expect(timeout).not.toHaveBeenCalled();
  visibility(false);
  expect(send).toHaveBeenCalledTimes(count + 1);
  jest.advanceTimersByTime(8000);
  expect(timeout).not.toHaveBeenCalled();
  // Resuming does not disable failure detection if the worker really is stuck.
  jest.advanceTimersByTime(2000);
  expect(timeout).toHaveBeenCalledTimes(1);
});

test('a mount that starts hidden waits until visible before probing', () => {
  hidden = true;
  heartbeat = createWidgetHeartbeat(send, timeout);
  jest.advanceTimersByTime(120000);
  expect(send).not.toHaveBeenCalled();
  visibility(false);
  expect(send).toHaveBeenCalledTimes(1);
  heartbeat.reply();
  expect(timeout).not.toHaveBeenCalled();
});

test('browser freeze and resume retain the worker and resume bounded probes', () => {
  heartbeat = createWidgetHeartbeat(send, timeout);
  document.dispatchEvent(new Event('freeze'));
  const count = send.mock.calls.length;
  jest.advanceTimersByTime(120000);
  expect(send).toHaveBeenCalledTimes(count);
  document.dispatchEvent(new Event('resume'));
  heartbeat.reply();
  jest.advanceTimersByTime(8000);
  expect(timeout).not.toHaveBeenCalled();
  expect(send.mock.calls.length).toBeGreaterThan(count);
});

test('a suspended host event loop probes again before judging a queued worker reply', () => {
  let clock = 0;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  heartbeat = createWidgetHeartbeat(send, timeout);
  clock = 120000; // One callback after sleep, not sixty normally scheduled ticks.
  jest.advanceTimersByTime(2000);
  expect(timeout).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(2);
  heartbeat.reply();
  for (let i = 0; i < 4; i++) { clock += 2000; jest.advanceTimersByTime(2000); }
  expect(timeout).not.toHaveBeenCalled();
  clock += 2000; jest.advanceTimersByTime(2000);
  expect(timeout).toHaveBeenCalledTimes(1);
});

test('disposing removes lifecycle listeners and cannot restart probes', () => {
  heartbeat = createWidgetHeartbeat(send, timeout);
  heartbeat.dispose(); heartbeat.dispose();
  visibility(true); visibility(false);
  document.dispatchEvent(new Event('resume'));
  jest.advanceTimersByTime(20000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(timeout).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
