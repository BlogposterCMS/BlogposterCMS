'use strict';

function defineHiddenValue(target, key, value) {
  try {
    Object.defineProperty(target, key, {
      value,
      enumerable: false,
      configurable: false,
      writable: false
    });
  } catch {
    // Some host objects already have locked descriptors.
  }
}

function hardenBoundaryFunction(fn) {
  if (typeof fn !== 'function') return fn;

  defineHiddenValue(fn, 'constructor', undefined);
  if (Object.prototype.hasOwnProperty.call(fn, 'prototype') && fn.prototype && typeof fn.prototype === 'object') {
    defineHiddenValue(fn.prototype, 'constructor', undefined);
    try {
      Object.setPrototypeOf(fn.prototype, null);
    } catch {
      // Non-extensible function prototypes cannot always be re-parented.
    }
    try {
      Object.freeze(fn.prototype);
    } catch {
      // Host functions may reject freezing.
    }
  }

  try {
    Object.setPrototypeOf(fn, null);
  } catch {
    // Some host functions do not allow prototype changes.
  }
  try {
    Object.freeze(fn);
  } catch {
    // Some host functions cannot be frozen.
  }
  return fn;
}

function createBoundaryFunction(fn) {
  return hardenBoundaryFunction(function moduleBoundaryFacade(...args) {
    return fn.apply(this, args);
  });
}

function createMutableBoundaryObject(entries = {}) {
  const obj = Object.create(null);
  for (const [key, value] of Object.entries(entries)) {
    obj[key] = value;
  }
  return obj;
}

function createBoundaryObject(entries = {}) {
  return Object.freeze(createMutableBoundaryObject(entries));
}

function createBoundaryArray(values = []) {
  const arr = values.slice();
  try {
    Object.setPrototypeOf(arr, null);
  } catch {
    // Arrays created from host values can still be frozen without this.
  }
  return Object.freeze(arr);
}

function cloneRuntimeData(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    const arr = [];
    seen.set(value, arr);
    for (const item of value) {
      arr.push(cloneRuntimeData(item, seen));
    }
    return createBoundaryArray(arr);
  }

  const obj = Object.create(null);
  seen.set(value, obj);
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'function') {
      obj[key] = cloneRuntimeData(item, seen);
    }
  }
  return Object.freeze(obj);
}

module.exports = {
  cloneRuntimeData,
  createBoundaryFunction,
  createBoundaryObject,
  createMutableBoundaryObject,
  hardenBoundaryFunction
};
