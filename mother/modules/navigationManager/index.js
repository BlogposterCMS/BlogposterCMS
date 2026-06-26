'use strict';

require('dotenv').config();

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  ensureNavigationDatabase,
  ensureNavigationSchema,
  navigationDbSelect,
  navigationDbUpdate,
  seedDefaultNavigationLocations
} = require('./navigationService');

const MODULE_NAME = 'navigationManager';
const MODULE_TYPE = 'core';
const VALID_ITEM_TYPES = new Set(['custom', 'entry', 'page', 'post', 'archive']);
const VALID_STATUSES = new Set(['active', 'draft', 'hidden']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[navigationManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function canManage(payload) {
  return !payload?.decodedJWT || hasPermission(payload.decodedJWT, 'navigation.manage');
}

function normalizeKey(raw, fallback = '') {
  return String(raw || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalizeText(value = '', max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizeUrl(raw = '') {
  const value = String(raw || '').trim().slice(0, 1000);
  if (!value) return '';
  if (CONTROL_CHAR_PATTERN.test(value) || /\s/.test(value) || value.includes('\\') || value.startsWith('//')) {
    return '';
  }
  if (value.startsWith('/') || value.startsWith('#') || value.startsWith('?')) {
    return value;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return '';
    }
    return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : '';
  }
  return `/${value.replace(/^\/+/, '')}`;
}

function normalizeStatus(raw, fallback = 'active') {
  const status = String(raw || fallback).toLowerCase();
  return VALID_STATUSES.has(status) ? status : fallback;
}

function normalizeItemType(raw) {
  const type = String(raw || 'custom').toLowerCase();
  return VALID_ITEM_TYPES.has(type) ? type : 'custom';
}

function normalizeLocationInput(payload = {}) {
  const key = normalizeKey(payload.key || payload.locationKey);
  if (!key) throw new Error('Navigation location key is required.');
  return {
    key,
    label: normalizeText(payload.label || key, 160),
    description: normalizeText(payload.description || '', 1000)
  };
}

function normalizeMenuInput(payload = {}) {
  const key = normalizeKey(payload.key || payload.menuKey || payload.label);
  if (!key) throw new Error('Navigation menu key is required.');
  return {
    menuId: payload.menuId || payload.id || null,
    key,
    label: normalizeText(payload.label || key, 160),
    description: normalizeText(payload.description || '', 1000),
    locationKey: normalizeKey(payload.locationKey || payload.location || '')
  };
}

function normalizeMenuRef(payload = {}) {
  const menuId = payload.menuId || payload.id || null;
  const key = normalizeKey(payload.key || payload.menuKey || '');
  const locationKey = normalizeKey(payload.locationKey || payload.location || '');
  if (!menuId && !key && !locationKey) {
    throw new Error('menuId, menuKey or locationKey is required.');
  }
  return { menuId, key, locationKey };
}

function normalizeMenuItemInput(payload = {}, fallback = {}) {
  const type = normalizeItemType(payload.type ?? fallback.type);
  const title = normalizeText(payload.title ?? fallback.title, 240);
  const url = normalizeUrl(payload.url ?? fallback.url);
  const entryId = payload.entryId ?? payload.entry_id ?? fallback.entry_id ?? fallback.entryId ?? null;
  const sourceModule = normalizeText(payload.sourceModule ?? payload.source_module ?? fallback.source_module ?? '', 120);
  const sourceId = normalizeText(payload.sourceId ?? payload.source_id ?? fallback.source_id ?? '', 160);

  if (!title && !url && !entryId && !(sourceModule && sourceId)) {
    throw new Error('Navigation item needs a title, url, entryId or sourceModule/sourceId.');
  }

  return {
    itemId: payload.itemId || payload.id || fallback.id || null,
    menuId: payload.menuId || payload.menu_id || fallback.menu_id || fallback.menuId || null,
    parentId: payload.parentId ?? payload.parent_id ?? fallback.parent_id ?? null,
    type,
    title: title || url || sourceId || String(entryId || ''),
    url,
    entryId: entryId ? String(entryId) : null,
    sourceModule: sourceModule || null,
    sourceId: sourceId || null,
    target: normalizeText(payload.target ?? fallback.target ?? '', 40),
    rel: normalizeText(payload.rel ?? fallback.rel ?? '', 160),
    cssClass: normalizeText(payload.cssClass ?? payload.css_class ?? fallback.css_class ?? '', 240),
    position: Number(payload.position ?? fallback.position ?? 0) || 0,
    status: normalizeStatus(payload.status ?? fallback.status, fallback.status || 'active'),
    meta: payload.meta ?? fallback.meta ?? {}
  };
}

function buildTree(items = []) {
  const normalized = items.map(item => ({ ...item, children: [] }));
  const byId = new Map(normalized.map(item => [String(item.id), item]));
  const roots = [];

  for (const item of normalized) {
    const parentId = item.parent_id || item.parentId;
    if (parentId && byId.has(String(parentId))) {
      byId.get(String(parentId)).children.push(item);
    } else {
      roots.push(item);
    }
  }

  const sort = list => {
    list.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

async function resolveMenu(motherEmitter, jwt, ref) {
  const menu = await navigationDbSelect(motherEmitter, jwt, 'GET_NAVIGATION_MENU', ref);
  const resolved = Array.isArray(menu) ? menu[0] : menu;
  if (!resolved) throw new Error('Navigation menu not found.');
  return resolved;
}

function setupNavigationEvents(motherEmitter) {
  motherEmitter.on('registerNavigationLocation', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'registerNavigationLocation');
      requirePermission(payload, 'navigation.manage');
      const result = await navigationDbUpdate(motherEmitter, payload.jwt, 'UPSERT_NAVIGATION_LOCATION', normalizeLocationInput(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listNavigationLocations', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listNavigationLocations');
      const result = await navigationDbSelect(motherEmitter, payload.jwt, 'LIST_NAVIGATION_LOCATIONS');
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('upsertNavigationMenu', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'upsertNavigationMenu');
      requirePermission(payload, 'navigation.manage');
      const result = await navigationDbUpdate(motherEmitter, payload.jwt, 'UPSERT_NAVIGATION_MENU', normalizeMenuInput(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getNavigationMenu', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getNavigationMenu');
      const result = await navigationDbSelect(motherEmitter, payload.jwt, 'GET_NAVIGATION_MENU', normalizeMenuRef(payload));
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listNavigationMenus', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listNavigationMenus');
      const result = await navigationDbSelect(motherEmitter, payload.jwt, 'LIST_NAVIGATION_MENUS', {
        locationKey: normalizeKey(payload.locationKey || payload.location || '')
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('addNavigationMenuItem', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'addNavigationMenuItem');
      requirePermission(payload, 'navigation.manage');
      const menu = await resolveMenu(motherEmitter, payload.jwt, normalizeMenuRef(payload));
      const item = normalizeMenuItemInput({ ...payload, menuId: menu.id });
      const result = await navigationDbUpdate(motherEmitter, payload.jwt, 'ADD_NAVIGATION_MENU_ITEM', item);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('setNavigationMenuItems', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'setNavigationMenuItems');
      requirePermission(payload, 'navigation.manage');
      const menu = await resolveMenu(motherEmitter, payload.jwt, normalizeMenuRef(payload));
      const rawItems = Array.isArray(payload.items) ? payload.items : [];
      const items = rawItems.map((item, index) => normalizeMenuItemInput({
        ...item,
        menuId: menu.id,
        position: item.position ?? index
      }));
      const result = await navigationDbUpdate(motherEmitter, payload.jwt, 'SET_NAVIGATION_MENU_ITEMS', {
        menuId: menu.id,
        items
      });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('updateNavigationMenuItem', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'updateNavigationMenuItem');
      requirePermission(payload, 'navigation.manage');
      const itemId = payload.itemId || payload.id;
      if (!itemId) throw new Error('itemId is required.');
      const existing = await navigationDbSelect(motherEmitter, payload.jwt, 'GET_NAVIGATION_MENU_ITEM', { itemId });
      const current = Array.isArray(existing) ? existing[0] : existing;
      if (!current) throw new Error('Navigation item not found.');
      const item = normalizeMenuItemInput({ ...payload, itemId }, current);
      const result = await navigationDbUpdate(motherEmitter, payload.jwt, 'UPDATE_NAVIGATION_MENU_ITEM', item);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteNavigationMenuItem', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteNavigationMenuItem');
      requirePermission(payload, 'navigation.manage');
      const itemId = payload.itemId || payload.id;
      if (!itemId) throw new Error('itemId is required.');
      const result = await navigationDbUpdate(motherEmitter, payload.jwt, 'DELETE_NAVIGATION_MENU_ITEM', { itemId });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getNavigationTree', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getNavigationTree');
      if (!canManage(payload) && payload.status && payload.status !== 'active') {
        throw new Error('Forbidden - missing permission: navigation.manage');
      }
      const menu = await resolveMenu(motherEmitter, payload.jwt, normalizeMenuRef(payload));
      const status = canManage(payload) ? (payload.status ? normalizeStatus(payload.status, '') : '') : 'active';
      const items = await navigationDbSelect(motherEmitter, payload.jwt, 'LIST_NAVIGATION_MENU_ITEMS', {
        menuId: menu.id,
        status
      });
      callback(null, {
        menu,
        items: items || [],
        tree: buildTree(items || [])
      });
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[NAVIGATION MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[NAVIGATION MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[NAVIGATION MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[NAVIGATION MANAGER] Initializing Navigation Manager...');
    await ensureNavigationDatabase(motherEmitter, jwt, nonce);
    await ensureNavigationSchema(motherEmitter, jwt);
    setupNavigationEvents(motherEmitter);
    await seedDefaultNavigationLocations(motherEmitter, jwt);
    console.log('[NAVIGATION MANAGER] Initialized successfully.');
  },
  setupNavigationEvents,
  _internals: {
    buildTree,
    normalizeKey,
    normalizeMenuInput,
    normalizeMenuItemInput,
    normalizeMenuRef,
    normalizeUrl
  }
};
