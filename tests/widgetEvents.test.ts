/** @jest-environment jsdom */
import { normalizeWidgetApiActions } from '../ui/widgets/rendering/widgetEvents';

describe('descriptive widget API dependencies', () => {
  it('normalizes valid descriptors without authorizing or registering them', () => {
    window.meltdownEmit = jest.fn();
    expect(normalizeWidgetApiActions({ apiActions: [
      { resource: ' content ', action: 'list' },
      { resource: 'bad event', action: 'list' },
      { resource: 'content', action: 'list' },
      { resource: 'content', action: 'a'.repeat(65) }, null
    ] })).toEqual([{ resource: 'content', action: 'list' }]);
    expect(window.meltdownEmit).not.toHaveBeenCalled();
    delete window.meltdownEmit;
  });
  it('treats missing or malformed metadata as no declared dependencies', () => {
    expect(normalizeWidgetApiActions({})).toEqual([]);
    expect(normalizeWidgetApiActions({ apiActions: 'content.list' })).toEqual([]);
  });
});
