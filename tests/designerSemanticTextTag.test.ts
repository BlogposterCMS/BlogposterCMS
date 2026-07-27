/** @jest-environment jsdom */

import {
  SEMANTIC_TEXT_TAG_OPTIONS,
  captureSemanticTextSelection,
  replaceSemanticTextElement,
  resolveSemanticTextElement,
  resolveTextStyleElement,
  restoreSemanticTextSelection
} from '../ui/designer/app/editor/core/semanticTextTag';

describe('Design Studio semantic Rich Text roles', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('offers semantic roles without creating separate widget types', () => {
    expect(SEMANTIC_TEXT_TAG_OPTIONS.map(option => option.value)).toEqual([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'div',
      'span',
      'blockquote',
      'pre'
    ]);
  });

  it('resolves the text block containing the caret and refuses mixed blocks', () => {
    document.body.innerHTML = `
      <div class="editable" data-text-editable>
        <h2>Heading</h2>
        <p>Body copy</p>
      </div>
    `;
    const editable = document.querySelector<HTMLElement>('.editable')!;
    const headingText = editable.querySelector('h2')!.firstChild!;
    const bodyText = editable.querySelector('p')!.firstChild!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(headingText, 3);
    range.collapse(true);
    selection.addRange(range);

    expect(resolveSemanticTextElement(editable, selection)?.tagName).toBe('H2');

    selection.removeAllRanges();
    const mixedRange = document.createRange();
    mixedRange.setStart(headingText, 0);
    mixedRange.setEnd(bodyText, 4);
    selection.addRange(mixedRange);
    expect(resolveSemanticTextElement(editable, selection)).toBeNull();
  });

  it('switches the role preset while preserving content and non-typographic attributes', () => {
    document.body.innerHTML = `
      <div class="editable" data-text-editable>
        <h1
          class="hero-copy"
          data-role="title"
          style="color: red; font-size: clamp(48px, 7vw, 88px); font-weight: 720; line-height: .96"
        >
          Hello <strong style="font-weight: 900">world</strong>
        </h1>
      </div>
    `;
    const heading = document.querySelector<HTMLElement>('h1')!;
    const replacement = replaceSemanticTextElement(heading, 'p');

    expect(replacement.tagName).toBe('P');
    expect(replacement.className).toBe('hero-copy');
    expect(replacement.dataset.role).toBe('title');
    expect(replacement.style.color).toBe('red');
    expect(replacement.style.fontSize).toBe('');
    expect(replacement.style.fontWeight).toBe('');
    expect(replacement.style.lineHeight).toBe('');
    expect(replacement.querySelector<HTMLElement>('strong')?.style.fontWeight).toBe('900');
    expect(replacement.querySelector('strong')?.textContent).toBe('world');
    expect(document.querySelector('h1')).toBeNull();
  });

  it('lets the new semantic tag control the computed typography', () => {
    document.head.innerHTML = `
      <style>
        .widget-rich-text h1 { font-size: 48px; font-weight: 700; }
        .widget-rich-text p { font-size: 16px; font-weight: 400; }
      </style>
    `;
    document.body.innerHTML = `
      <div class="widget-rich-text">
        <h1 style="font-size: 88px; font-weight: 720">Coming Soon</h1>
      </div>
    `;
    const heading = document.querySelector<HTMLElement>('h1')!;
    const replacement = replaceSemanticTextElement(heading, 'p');

    expect(getComputedStyle(replacement).fontSize).toBe('16px');
    expect(getComputedStyle(replacement).fontWeight).toBe('400');
  });

  it('reads toolbar typography from the active semantic block instead of its wrapper', () => {
    document.head.innerHTML = '<style>.editable { font-size: 16px; }</style>';
    document.body.innerHTML = `
      <div class="editable" data-text-editable>
        <h1 style="font-size: 48px">Coming Soon</h1>
      </div>
    `;
    const editable = document.querySelector<HTMLElement>('.editable')!;
    const headingText = editable.querySelector('h1')!.firstChild!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(headingText, 3);
    range.collapse(true);
    selection.addRange(range);

    const styleElement = resolveTextStyleElement(editable, selection);
    expect(styleElement?.tagName).toBe('H1');
    expect(getComputedStyle(styleElement!).fontSize).toBe('48px');

    selection.removeAllRanges();
    expect(resolveTextStyleElement(editable, selection)?.tagName).toBe('H1');
  });

  it('keeps the caret position when the semantic role changes', () => {
    document.body.innerHTML = `
      <div class="editable" data-text-editable><h2>Hello world</h2></div>
    `;
    const heading = document.querySelector<HTMLElement>('h2')!;
    const text = heading.firstChild!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(text, 5);
    range.collapse(true);
    selection.addRange(range);
    const snapshot = captureSemanticTextSelection(heading, selection);

    const replacement = replaceSemanticTextElement(heading, 'span');
    expect(restoreSemanticTextSelection(replacement, snapshot, selection)).toBe(true);
    expect(selection.anchorNode?.textContent).toBe('Hello world');
    expect(selection.anchorOffset).toBe(5);
  });

  it('rejects tags outside the curated Rich Text role set with a searchable code', () => {
    document.body.innerHTML = '<div class="editable"><p>Copy</p></div>';
    const paragraph = document.querySelector<HTMLElement>('p')!;

    expect(() => replaceSemanticTextElement(paragraph, 'script'))
      .toThrow('DESIGNER_TEXT_TAG_UNSUPPORTED');
  });
});
