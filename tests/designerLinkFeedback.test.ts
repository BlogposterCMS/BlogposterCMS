/** @jest-environment jsdom */
import { startDesignerLinkFeedback, designerLinkFeedbackState } from '../ui/designer/app/links/designerLinkFeedback';

test('late native widget links and corrected targets use the same immediate agent feedback', async () => {
  const root = document.createElement('div'); document.body.append(root);
  window.meltdownEmit = jest.fn(async (_e, p: any) => ({ id: 58, slug: p.params.slug, status: 'draft' })) as any;
  startDesignerLinkFeedback(root);
  const widget = document.createElement('div'); widget.className = 'canvas-item'; widget.dataset.instanceId = 'native';
  widget.innerHTML = '<a href="/locale-feedback-draft">Guide</a>'; root.append(widget);
  await new Promise(resolve => setTimeout(resolve, 440));
  expect(designerLinkFeedbackState().items[0]).toMatchObject({ code: 'LINK_TARGET_DRAFT' });
  widget.querySelector('a')!.setAttribute('href', '#local');
  await new Promise(resolve => setTimeout(resolve, 440));
  expect(designerLinkFeedbackState().items).toEqual([]);
  // Restarting detaches the previous observer and editor-owned feedback markers.
  startDesignerLinkFeedback(document.createElement('div'));
  document.body.replaceChildren();
});
