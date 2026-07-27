import {
  createLeaf as createSharedLeaf,
  deleteContainer as deleteSharedContainer,
  activatePageSection as activateSharedPageSection,
  ensureLayoutRootContainer as ensureSharedLayoutRootContainer,
  ensurePageSectionRoot as ensureSharedPageSectionRoot,
  getPageSectionElement as getSharedPageSectionElement,
  movePageSection as moveSharedPageSection,
  moveContainer as moveSharedContainer,
  placeContainer as placeSharedContainer,
  duplicateContainer as duplicateSharedContainer,
  removePageSection as removeSharedPageSection,
  syncPageSection as syncSharedPageSection,
  linkContainerStyleSource as linkSharedContainerStyleSource,
  unlinkContainerStyleSource as unlinkSharedContainerStyleSource,
  toggleContainerStyleSource as toggleSharedContainerStyleSource,
  setContainerLayoutMode as setSharedContainerLayoutMode,
  setContainerSettings as setSharedContainerSettings,
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

export function ensurePageSectionRoot(layoutRoot, sections = []) {
  return ensureSharedPageSectionRoot(layoutRoot, sections, designerLayoutDomOptions);
}

export function syncPageSection(layoutRoot, section) {
  return syncSharedPageSection(layoutRoot, section, designerLayoutDomOptions);
}

export function getPageSectionElement(layoutRoot, sectionId) {
  return getSharedPageSectionElement(layoutRoot, sectionId);
}

export function activatePageSection(layoutRoot, sectionId) {
  return activateSharedPageSection(layoutRoot, sectionId);
}

export function movePageSection(layoutRoot, sectionId, targetIndex) {
  return moveSharedPageSection(layoutRoot, sectionId, targetIndex);
}

export function removePageSection(layoutRoot, sectionId) {
  return removeSharedPageSection(layoutRoot, sectionId);
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

export function setContainerLayoutMode(el, mode) {
  return setSharedContainerLayoutMode(el, mode);
}

export function setContainerSettings(el, settings) {
  return setSharedContainerSettings(el, settings);
}

export function toggleContainerStyleSource(layoutRoot, el) {
  return toggleSharedContainerStyleSource(layoutRoot, el);
}

export function linkContainerStyleSource(layoutRoot, source, target) {
  return linkSharedContainerStyleSource(layoutRoot, source, target);
}

export function unlinkContainerStyleSource(el) {
  return unlinkSharedContainerStyleSource(el);
}

export function duplicateContainer(targetEl, options = {}) {
  return duplicateSharedContainer(targetEl, {
    ...designerLayoutDomOptions,
    ...options
  });
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
