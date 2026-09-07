/** @jest-environment jsdom */
import { layerTreeChildren } from '../ui/designer/app/managers/layerTree.js';

test('Layers exposes nested containers, their widgets and empty containers', () => {
  const section = document.createElement('section');
  section.innerHTML = '<aside class="layout-container" id="aside"><div class="canvas-item" id="menu"><nav>Widget internals</nav></div></aside><main class="layout-container" id="content"></main><div class="layout-section-toolbar"></div>';
  expect(layerTreeChildren(section).map(el => el.id)).toEqual(['aside', 'content']);
  expect(layerTreeChildren(section.firstElementChild).map(el => el.id)).toEqual(['menu']);
  expect(layerTreeChildren(section.querySelector('#menu'))).toEqual([]);
  expect(layerTreeChildren(section.querySelector('#content'))).toEqual([]);
});
