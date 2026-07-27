/** @jest-environment jsdom */

import fs from 'fs';
import path from 'path';
import { refreshSectionResizeHandles } from '../ui/designer/app/ux/sectionResizeHandle';

describe('Design Studio Section resize handle', () => {
  it('resizes a Section from its bottom edge and commits once', () => {
    const root = document.createElement('main');
    const section = document.createElement('section');
    section.className = 'layout-section';
    section.dataset.sectionId = 'hero';
    section.dataset.layoutMinHeight = '320px';
    section.getBoundingClientRect = () => ({
      width: 1000,
      height: Number.parseFloat(section.dataset.layoutMinHeight || '320'),
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 320,
      toJSON: () => ({})
    });
    root.appendChild(section);
    const onResize = jest.fn((target, height) => {
      target.dataset.layoutMinHeight = `${height}px`;
      target.style.minHeight = `${height}px`;
    });
    const onCommit = jest.fn();

    refreshSectionResizeHandles({ layoutRoot: root, onResize, onCommit });
    const handle = section.querySelector<HTMLButtonElement>('.layout-section-resize-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientY: 320
    }));
    document.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true,
      clientY: 440
    }));
    document.dispatchEvent(new MouseEvent('pointerup', {
      bubbles: true,
      clientY: 440
    }));

    expect(onResize).toHaveBeenCalledWith(section, 440);
    expect(onCommit).toHaveBeenCalledWith(section, 440);
    expect(section.classList.contains('layout-section--resizing')).toBe(false);
  });

  it('supports keyboard resizing and clamps the minimum height', () => {
    const root = document.createElement('main');
    const section = document.createElement('section');
    section.className = 'layout-section';
    section.dataset.sectionId = 'hero';
    section.dataset.layoutMinHeight = '80px';
    root.appendChild(section);
    const onResize = jest.fn((target, height) => {
      target.dataset.layoutMinHeight = `${height}px`;
    });
    const onCommit = jest.fn();

    refreshSectionResizeHandles({ layoutRoot: root, onResize, onCommit });
    const handle = section.querySelector<HTMLButtonElement>('.layout-section-resize-handle')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(onResize).toHaveBeenCalledWith(section, 80);
    expect(onCommit).toHaveBeenCalledWith(section, 80);
  });

  it('converts a scaled screen drag back into authored Section pixels', () => {
    const root = document.createElement('main');
    const section = document.createElement('section');
    section.className = 'layout-section';
    section.dataset.sectionId = 'features';
    section.dataset.layoutMinHeight = '320px';
    Object.defineProperty(section, 'offsetHeight', {
      configurable: true,
      get: () => Number.parseFloat(section.dataset.layoutMinHeight || '320')
    });
    section.getBoundingClientRect = () => {
      const authoredHeight = Number.parseFloat(section.dataset.layoutMinHeight || '320');
      return {
        width: 320,
        height: authoredHeight * 0.25,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: authoredHeight * 0.25,
        toJSON: () => ({})
      };
    };
    root.appendChild(section);
    const onResize = jest.fn((target, height) => {
      target.dataset.layoutMinHeight = `${height}px`;
      target.style.minHeight = `${height}px`;
    });
    const onCommit = jest.fn();

    refreshSectionResizeHandles({ layoutRoot: root, onResize, onCommit });
    const handle = section.querySelector<HTMLButtonElement>('.layout-section-resize-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientY: 80
    }));
    document.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true,
      clientY: 110
    }));
    document.dispatchEvent(new MouseEvent('pointerup', {
      bubbles: true,
      clientY: 110
    }));

    expect(onResize).toHaveBeenCalledWith(section, 440);
    expect(onCommit).toHaveBeenCalledWith(section, 440);
  });

  it('keeps the active Section handle visible and screen-sized at canvas zoom', () => {
    const scss = fs.readFileSync(
      path.join(process.cwd(), 'apps/designer/assets/scss/_layout-root.scss'),
      'utf8'
    );

    expect(scss).toContain('transform: scaleY(var(--canvas-inverse-scale, 1))');
    expect(scss).toContain('transform: scaleX(var(--canvas-inverse-scale, 1))');
    expect(scss).toContain('transform-origin: right center');
    expect(scss).toContain('.layout-section.layout-section--active > .layout-section-resize-handle');
    expect(scss).toContain('right: 20px');
  });
});
