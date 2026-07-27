const DEFAULT_FEEDBACK_DURATION = 1100;
const insertionCleanup = new WeakMap();

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function clearInsertionFeedback(section) {
  const pending = insertionCleanup.get(section);
  if (pending?.timer) window.clearTimeout(pending.timer);
  if (pending?.finish) section.removeEventListener('animationend', pending.finish);
  insertionCleanup.delete(section);
  section.classList.remove('layout-section--inserting');
  delete section.dataset.sectionInsertState;
  delete section.dataset.sectionInsertSource;
}

/**
 * Makes a newly-created canonical Section visible without changing its layout
 * geometry. LayoutTree still owns the Section; this helper only adds the
 * short-lived paint and scroll feedback used after an insert command.
 */
export function revealInsertedSection(section, {
  source = 'section-edge',
  scroll = true,
  feedbackDuration = DEFAULT_FEEDBACK_DURATION
} = {}) {
  if (!(section instanceof HTMLElement) || !section.classList.contains('layout-section')) {
    return false;
  }

  clearInsertionFeedback(section);
  const reducedMotion = prefersReducedMotion();
  section.dataset.sectionInsertState = 'entering';
  section.dataset.sectionInsertSource = source;
  section.classList.add('layout-section--inserting');

  if (scroll) {
    try {
      section.scrollIntoView?.({
        block: 'center',
        inline: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth'
      });
    } catch (error) {
      console.warn('[Designer] DESIGNER_SECTION_INSERT_SCROLL_FAILED', {
        sectionId: section.dataset.sectionId || null,
        source
      }, error);
    }
  }

  const finish = event => {
    if (event?.target !== section) return;
    if (event?.animationName && event.animationName !== 'designer-section-insert-highlight') return;
    clearInsertionFeedback(section);
  };
  section.addEventListener('animationend', finish);

  // A timeout also clears the transient state when CSS animations are disabled
  // by the browser or the tab is painted without animation events.
  const cleanupDelay = reducedMotion
    ? Math.min(500, feedbackDuration)
    : feedbackDuration;
  const timer = window.setTimeout(
    () => clearInsertionFeedback(section),
    Math.max(0, cleanupDelay)
  );
  insertionCleanup.set(section, { timer, finish });
  return true;
}
