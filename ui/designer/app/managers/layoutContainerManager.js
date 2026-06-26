import {
  createLeaf as createSharedLeaf,
  deleteContainer as deleteSharedContainer,
  ensureLayoutRootContainer as ensureSharedLayoutRootContainer,
  moveContainer as moveSharedContainer,
  placeContainer as placeSharedContainer,
  setDefaultWorkarea as setSharedDefaultWorkarea,
  setDesignRef as setSharedDesignRef,
  setDynamicHost as setSharedDynamicHost
} from '/ui/shared/layout/layoutDom.js';
import { STRINGS } from '../i18n.js';
import { generateNodeId } from '../renderer/renderUtils.js';

const designerLayoutDomOptions = {
  labels: STRINGS,
  generateNodeId
};

export function setDefaultWorkarea(root) {
  return setSharedDefaultWorkarea(root, designerLayoutDomOptions);
}

export function ensureLayoutRootContainer(layoutRoot) {
  return ensureSharedLayoutRootContainer(layoutRoot, designerLayoutDomOptions);
}

export function createLeaf() {
  return createSharedLeaf(designerLayoutDomOptions);
}

export function setDynamicHost(layoutRoot, el) {
  return setSharedDynamicHost(layoutRoot, el, designerLayoutDomOptions);
}

export function setDesignRef(el, designId) {
  return setSharedDesignRef(el, designId);
}

export function placeContainer(targetEl, position, options = {}) {
  return placeSharedContainer(targetEl, position, {
    ...designerLayoutDomOptions,
    ...options
  });
}

export function deleteContainer(targetEl, options = {}) {
  return deleteSharedContainer(targetEl, options);
}

export function moveContainer(srcEl, targetEl, position, options = {}) {
  return moveSharedContainer(srcEl, targetEl, position, {
    ...designerLayoutDomOptions,
    ...options
  });
}
