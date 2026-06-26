import {
  deserializeLayout as deserializeSharedLayout,
  serializeLayout as serializeSharedLayout
} from '/ui/shared/layout/layoutDom.js';
import { STRINGS } from '../i18n.js';
import { generateNodeId } from './renderUtils.js';

const designerLayoutDomOptions = {
  labels: STRINGS,
  generateNodeId
};

export function serializeLayout(container) {
  return serializeSharedLayout(container) || {};
}

export function deserializeLayout(obj, container) {
  return deserializeSharedLayout(obj, container, designerLayoutDomOptions);
}
