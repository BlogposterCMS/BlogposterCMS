/** @jest-environment jsdom */

import {
  enableEditableRegistrationBridge,
  getRegisteredEditable,
  registerElement,
  resolveEditableTarget
} from '../ui/designer/app/editor/core/editor';

describe('Design Studio Rich Text edit target', () => {
  beforeEach(() => {
    document.body.className = 'builder-mode';
    document.body.innerHTML = '';
  });

  it('uses the registered Rich Text root when the widget hit layer is double-clicked', () => {
    document.body.innerHTML = `
      <div class="canvas-item selected" id="widget-heading">
        <div class="canvas-item-content">
          <div class="bp-public-widget">
            <div class="editable widget-rich-text" data-text-editable>
              <h1>Coming Soon</h1>
            </div>
            <div class="hit-layer"></div>
          </div>
        </div>
      </div>
    `;
    const widget = document.querySelector<HTMLElement>('.canvas-item')!;
    const editable = document.querySelector<HTMLElement>('[data-text-editable]')!;
    const hitLayer = document.querySelector<HTMLElement>('.hit-layer')!;
    registerElement(editable, jest.fn());

    const event = {
      target: hitLayer,
      composedPath: () => [
        hitLayer,
        hitLayer.parentElement,
        hitLayer.closest('.canvas-item-content'),
        widget,
        document.body
      ]
    } as unknown as Event;

    expect(resolveEditableTarget(widget, event)).toBe(editable);
  });

  it('never treats canvas and public-widget shells as editable text', () => {
    document.body.innerHTML = `
      <div class="canvas-item selected">
        <div class="canvas-item-content">
          <div class="bp-public-widget"><div class="hit-layer">Heading</div></div>
        </div>
      </div>
    `;
    const widget = document.querySelector<HTMLElement>('.canvas-item')!;
    const hitLayer = document.querySelector<HTMLElement>('.hit-layer')!;
    const event = {
      target: hitLayer,
      composedPath: () => [
        hitLayer,
        hitLayer.parentElement,
        hitLayer.closest('.canvas-item-content'),
        widget,
        document.body
      ]
    } as unknown as Event;

    expect(resolveEditableTarget(widget, event)).toBeNull();
  });

  it('uses the existing widget registration event in the active editor module', () => {
    document.body.innerHTML = `
      <div class="canvas-item selected">
        <div class="editable" data-text-editable><p>Write here</p></div>
      </div>
    `;
    const widget = document.querySelector<HTMLElement>('.canvas-item')!;
    const editable = document.querySelector<HTMLElement>('[data-text-editable]')!;
    const detail = { element: editable, source: 'textBoxWidget', handled: false };
    enableEditableRegistrationBridge();

    document.dispatchEvent(new CustomEvent('ui:widget-editable-mounted', { detail }));

    expect(detail.handled).toBe(true);
    expect(getRegisteredEditable(widget)).toBe(editable);
  });
});
