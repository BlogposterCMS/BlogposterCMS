// Simple loader registry for orchestrated attachments
const REG = new Map();

export const register = (type, fn) => {
  if (typeof type === 'string' && typeof fn === 'function') {
    REG.set(type, fn);
  }
};

export const get = (type) => REG.get(type);

