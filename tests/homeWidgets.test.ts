/**
 * @jest-environment jsdom
 */

import fs from 'fs';
import path from 'path';
import { render as renderDragInfo } from '../ui/widgets/plainspace/admin/dragInfoWidget';
import { render as renderRoadmapIntro } from '../ui/widgets/plainspace/admin/roadmapIntroWidget';
import { render as renderRoadmap } from '../ui/widgets/plainspace/admin/roadmapWidget';

const root = path.join(__dirname, '..');

describe('home onboarding widgets', () => {
  it('renders first-step actions that reuse existing admin routes', async () => {
    const el = document.createElement('div');

    await renderRoadmapIntro(el);

    expect(el.querySelector('.home-getting-started-widget h2')?.textContent)
      .toBe('Build your first page');
    expect(Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-home-onboarding-action]')).map(link => ({
      action: link.dataset.homeOnboardingAction,
      href: link.getAttribute('href')
    }))).toEqual([
      { action: 'create-page', href: '/admin/content' },
      { action: 'open-design-studio', href: '/admin/content/designer-layouts' },
      { action: 'upload-media', href: '/admin/content/media' }
    ]);
  });

  it('keeps retired home demo widgets useful when existing installs still show them', async () => {
    const roadmap = document.createElement('div');
    const dragInfo = document.createElement('div');

    await renderRoadmap(roadmap);
    await renderDragInfo(dragInfo);

    expect(roadmap.textContent).toContain('Launch checklist');
    expect(dragInfo.textContent).toContain('Arrange cards when you need more room');
    expect(dragInfo.textContent).not.toContain('HEY I AM DRAGBAR');
  });

  it('keeps Home cards on the shared Studio token style contract', () => {
    const scss = fs.readFileSync(path.join(root, 'public/assets/scss/components/_home-widgets.scss'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'public/assets/css/site.css'), 'utf8');

    expect(scss).toContain('var(--studio-surface-solid)');
    expect(scss).toContain('var(--studio-shadow-soft)');
    expect(scss).toContain('.home-start-action--primary');
    expect(css).toContain('.home-getting-started-widget');
    expect(css).toContain('border-radius: 8px');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });
});
