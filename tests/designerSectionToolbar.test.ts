/** @jest-environment jsdom */

import fs from 'fs';
import path from 'path';
import {
  hideBackgroundToolbar,
  refreshBackgroundToolbars,
  showBackgroundToolbar
} from '../ui/designer/app/editor/toolbar/backgroundToolbar';

function section(id: string) {
  const element = document.createElement('section');
  element.className = 'layout-section';
  element.dataset.sectionId = id;
  element.dataset.sectionTitle = id;
  element.dataset.layoutMode = 'free';
  return element;
}

describe('Design Studio Section toolbar', () => {
  afterEach(() => {
    hideBackgroundToolbar();
    document.body.replaceChildren();
  });

  it('owns one compact mode and background toolbar per Section', () => {
    const root = document.createElement('main');
    root.id = 'layoutRoot';
    const hero = section('hero');
    const features = section('features');
    root.append(hero, features);
    document.body.appendChild(root);

    refreshBackgroundToolbars(root);
    showBackgroundToolbar(features);

    expect(hero.querySelectorAll(':scope > .layout-section-toolbar')).toHaveLength(1);
    expect(features.querySelectorAll(':scope > .layout-section-toolbar')).toHaveLength(1);
    expect((hero.querySelector('.layout-section-toolbar') as HTMLElement).style.display).toBe('none');
    expect((features.querySelector('.layout-section-toolbar') as HTMLElement).style.display).toBe('flex');
    expect(features.querySelector('.section-background-color')).not.toBeNull();
    expect(features.querySelector('.section-background-image')).not.toBeNull();
    expect(features.querySelector('.section-delete')).not.toBeNull();
  });

  it('keeps Section controls inset from the shared Add Section edge', () => {
    const toolbarCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/scss/_toolbar.scss'),
      'utf8'
    );

    expect(toolbarCss).toContain('.bg-editor-toolbar.layout-section-toolbar');
    expect(toolbarCss).toContain('top: 20px');
    expect(toolbarCss).toContain('right: 20px');
    expect(toolbarCss).toContain('left: auto');
    expect(toolbarCss).toContain('transform: none');
  });

  it('cycles Free, Auto layout and Grid through the Section-owned button', () => {
    const root = document.createElement('main');
    root.id = 'layoutRoot';
    const hero = section('hero');
    root.appendChild(hero);
    document.body.appendChild(root);
    root.addEventListener('designerSectionModeRequested', (event: Event) => {
      const mode = (event as CustomEvent).detail.mode;
      hero.dataset.layoutMode = mode;
    });

    refreshBackgroundToolbars(root);
    showBackgroundToolbar(hero);
    const modeButton = hero.querySelector<HTMLButtonElement>('.section-mode-cycle')!;

    modeButton.click();
    expect(hero.dataset.layoutMode).toBe('stack');
    expect(modeButton.dataset.sectionMode).toBe('auto');

    modeButton.click();
    expect(hero.dataset.layoutMode).toBe('grid');
    expect(modeButton.dataset.sectionMode).toBe('grid');

    modeButton.click();
    expect(hero.dataset.layoutMode).toBe('free');
    expect(modeButton.dataset.sectionMode).toBe('free');
  });

  it('reports the owning Section background state when it is reset', () => {
    const root = document.createElement('main');
    root.id = 'layoutRoot';
    const hero = section('hero');
    hero.dataset.sectionBackground = '#ffffff';
    hero.dataset.bgImageUrl = '/media/hero.jpg';
    hero.dataset.bgImageId = 'hero-image';
    root.appendChild(hero);
    document.body.appendChild(root);
    const changes: unknown[] = [];
    root.addEventListener('designerSectionBackgroundChanged', (event: Event) => {
      changes.push((event as CustomEvent).detail);
    });

    refreshBackgroundToolbars(root);
    hero.querySelector<HTMLButtonElement>('.section-background-clear')!.click();

    expect(changes).toEqual([{
      background: 'transparent',
      backgroundImageUrl: '',
      backgroundImageId: ''
    }]);
  });

  it('exposes deletion from the Section that owns the toolbar', () => {
    const root = document.createElement('main');
    root.id = 'layoutRoot';
    const hero = section('hero');
    const features = section('features');
    root.append(hero, features);
    document.body.appendChild(root);

    refreshBackgroundToolbars(root);
    const deleteButton = features.querySelector<HTMLButtonElement>('.section-delete')!;

    expect(deleteButton.disabled).toBe(false);
    expect(deleteButton.getAttribute('aria-label')).toBe('Delete section');
    expect(deleteButton.closest('.layout-section')).toBe(features);
  });

  it('keeps the delete action disabled on the last Section', () => {
    const root = document.createElement('main');
    root.id = 'layoutRoot';
    const hero = section('hero');
    root.appendChild(hero);
    document.body.appendChild(root);

    refreshBackgroundToolbars(root);
    const deleteButton = hero.querySelector<HTMLButtonElement>('.section-delete')!;

    expect(deleteButton.disabled).toBe(true);
    expect(deleteButton.getAttribute('aria-label')).toBe('The last section cannot be deleted');
  });
});
