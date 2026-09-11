/** @jest-environment jsdom */

import {
  createSourceEditor,
  SourceEditorError,
} from '../ui/shared/code/sourceEditor';

function mount(
  value: string,
  language: 'html' | 'css' = 'html',
  onChange: (value: string) => void = () => undefined,
) {
  const parent = document.createElement('div');
  parent.style.height = '240px';
  document.body.appendChild(parent);
  return createSourceEditor({
    parent,
    value,
    language,
    label: `${language} source`,
    onChange,
  });
}

describe('source editor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts without executing source and preserves the initial document bytes', () => {
    const source = '<div>\r\n  <script>window.__sourceEditorExecuted = true</script>\r\n</div>';
    const editor = mount(source);

    expect(editor.getValue()).toBe(source);
    expect((window as Window & { __sourceEditorExecuted?: boolean }).__sourceEditorExecuted).toBeUndefined();
    expect(editor.element.querySelector('script')).toBeNull();
  });

  it('fires onChange for a real programmatic change but not an identical value', () => {
    const changes: string[] = [];
    const editor = mount('<p>one</p>', 'html', (value) => changes.push(value));

    editor.setValue('<p>two</p>');
    editor.setValue('<p>two</p>');

    expect(changes).toEqual(['<p>two</p>']);
  });

  it('supports wrapping, read-only state, focus, and the search panel', () => {
    const editor = mount('body { color: red; }', 'css');
    const content = editor.element.querySelector('.cm-content');

    editor.setWrap(true);
    expect(editor.element.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(true);
    editor.setWrap(false);
    expect(editor.element.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(false);

    editor.setReadOnly(true);
    expect(content?.getAttribute('contenteditable')).not.toBe('true');
    editor.setReadOnly(false);
    expect(content?.getAttribute('contenteditable')).toBe('true');

    editor.focus();
    editor.search();
    expect(editor.element.querySelector('.cm-search')).not.toBeNull();
    expect(editor.element.classList.contains('bp-source-editor')).toBe(true);
    expect(editor.element.dataset.sourceEditorLanguage).toBe('css');
    expect(content?.getAttribute('aria-label')).toBe('css source');
  });

  it('formats HTML and keeps the format as one undoable change', async () => {
    const source = '<div><span>hello</span></div>';
    const changes: string[] = [];
    const editor = mount('<p>earlier draft</p>', 'html', (value) => changes.push(value));
    editor.setValue(source);
    changes.length = 0;
    await editor.format();
    expect(editor.getValue()).not.toBe(source);
    expect(changes).toHaveLength(1);

    editor.element.querySelector('.cm-content')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );
    expect(editor.getValue()).toBe(source);
  });

  it('formats CSS on demand', async () => {
    const editor = mount('body{color:red}', 'css');

    await editor.format();

    expect(editor.getValue()).toContain('body');
    expect(editor.getValue()).toContain('color: red');
  });

  it('preserves the prior value for invalid HTML', async () => {
    const source = '<div><span></div>';
    const editor = mount(source);

    await expect(editor.format()).rejects.toMatchObject({
      code: 'SOURCE_EDITOR_INVALID_HTML',
    });
    expect(editor.getValue()).toBe(source);
  });

  it('rejects a format that becomes read-only while loading formatter modules', async () => {
    const editor = mount('<div><span>hello</span></div>');
    const formatting = editor.format();
    editor.setReadOnly(true);

    await expect(formatting).rejects.toMatchObject({
      code: 'SOURCE_EDITOR_READ_ONLY',
    });
    expect(editor.getValue()).toBe('<div><span>hello</span></div>');
  });

  it('rejects a format when the source changes while loading formatter modules', async () => {
    const editor = mount('<div><span>hello</span></div>');
    const formatting = editor.format();
    editor.setValue('<p>changed</p>');

    await expect(formatting).rejects.toMatchObject({
      code: 'SOURCE_EDITOR_FORMAT_STALE',
    });
    expect(editor.getValue()).toBe('<p>changed</p>');
  });

  it('uses stable errors after destroy', () => {
    const editor = mount('<p>source</p>');
    editor.destroy();

    expect(() => editor.getValue()).toThrow(SourceEditorError);
    try {
      editor.focus();
      throw new Error('expected focus to fail after destroy');
    } catch (error) {
      expect(error).toMatchObject({ code: 'SOURCE_EDITOR_DESTROYED' });
    }
  });

  it('rejects oversized input and invalid CSS without changing either document', async () => {
    const large = mount(' '.repeat(1_000_001));
    await expect(large.format()).rejects.toMatchObject({ code: 'SOURCE_EDITOR_TOO_LARGE' });
    expect(large.getValue()).toHaveLength(1_000_001);
    large.destroy();
    const invalid = mount('body { color: ', 'css');
    await expect(invalid.format()).rejects.toMatchObject({ code: 'SOURCE_EDITOR_INVALID_CSS' });
    expect(invalid.getValue()).toBe('body { color: ');
    invalid.destroy();
  });
});
