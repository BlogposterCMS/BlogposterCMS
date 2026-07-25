const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Designer selection handles', () => {
  const canvasScss = readProjectFile('apps/designer/assets/scss/_canvas.scss');
  const sceneScss = readProjectFile('apps/designer/assets/scss/_scene-builder.scss');
  const compiledCss = readProjectFile('apps/designer/assets/css/designer.css');

  it('keeps a large hit target behind compact direction-aware markers', () => {
    expect(canvasScss).toContain('width: 18px;');
    expect(canvasScss).toContain('&::before');
    expect(canvasScss).toContain('&.n::before');
    expect(canvasScss).toContain('&.e::before');
    expect(canvasScss).toContain('--bbox-handle-x: -50%;');
    expect(canvasScss).toContain('--bbox-handle-y: -50%;');
    expect(canvasScss).toContain(
      'translate(var(--bbox-handle-x), var(--bbox-handle-y)) scale(calc(var(--inv-scale) * 1.08))'
    );

    // The shipped CSS must stay in sync with the authored SCSS.
    expect(compiledCss).toContain('.bounding-box .bbox-handle::before');
    expect(compiledCss).toContain('.bounding-box .bbox-handle.n::before');
    expect(compiledCss).toContain('.bounding-box .bbox-handle.e::before');
  });

  it('does not visually restyle or move authored content on selection', () => {
    expect(sceneScss).toContain('body.builder-mode .canvas-item:hover:not(.selected)');
    expect(sceneScss).toContain('body.builder-mode .canvas-item.selected > .canvas-item-content');
    expect(sceneScss).toMatch(
      /body\.builder-mode \.canvas-item\.selected \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;[\s\S]*?transform: none;[\s\S]*?\}/
    );
    expect(compiledCss).toContain('body.builder-mode .canvas-item.selected > .canvas-item-content');
    expect(compiledCss).toMatch(
      /body\.builder-mode \.canvas-item\.selected \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;[\s\S]*?transform: none;[\s\S]*?\}/
    );
  });
});
