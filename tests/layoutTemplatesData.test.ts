/** @jest-environment jsdom */
import { render as retiredRender } from '../ui/widgets/plainspace/admin/layoutTemplatesWidget';
import { render as designerRender } from '../ui/widgets/plainspace/admin/designerLayoutsWidget';

test('stored legacy widget URLs resolve to the existing Designer implementation', () => {
  expect(retiredRender).toBe(designerRender);
});
