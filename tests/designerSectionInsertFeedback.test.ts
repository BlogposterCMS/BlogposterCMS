/** @jest-environment jsdom */

import { revealInsertedSection } from '../ui/designer/app/ux/sectionInsertFeedback';

function createSection() {
  const section = document.createElement('section');
  section.className = 'layout-section';
  section.dataset.sectionId = 'content';
  section.scrollIntoView = jest.fn();
  document.body.appendChild(section);
  return section;
}

describe('Design Studio Section insertion feedback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      })
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('reveals and scrolls the inserted Section below the clicked edge', () => {
    const section = createSection();

    expect(revealInsertedSection(section, { source: 'section-edge' })).toBe(true);
    expect(section.classList.contains('layout-section--inserting')).toBe(true);
    expect(section.dataset.sectionInsertState).toBe('entering');
    expect(section.dataset.sectionInsertSource).toBe('section-edge');
    expect(section.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth'
    });

    const animationEnd = new Event('animationend');
    Object.defineProperty(animationEnd, 'animationName', {
      value: 'designer-section-insert-highlight'
    });
    section.dispatchEvent(animationEnd);

    expect(section.classList.contains('layout-section--inserting')).toBe(false);
    expect(section.dataset.sectionInsertState).toBeUndefined();
  });

  it('honours reduced motion and clears transient feedback without animation events', () => {
    (window.matchMedia as jest.Mock).mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
    const section = createSection();

    revealInsertedSection(section, {
      source: 'stage-storyboard',
      feedbackDuration: 800
    });

    expect(section.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({
      behavior: 'auto'
    }));
    jest.advanceTimersByTime(500);
    expect(section.classList.contains('layout-section--inserting')).toBe(false);
    expect(section.dataset.sectionInsertSource).toBeUndefined();
  });

  it('rejects non-Section targets so the renderer can publish a searchable error', () => {
    expect(revealInsertedSection(document.createElement('div'))).toBe(false);
  });
});
