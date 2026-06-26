'use strict';

function sanitizeCookieName(name) {
  const valid = /^[!#$%&'()*+\-\.0-9:<=>?@A-Z\[\]^_`a-z{|}~]+$/.test(name);
  if (!valid) throw new Error('Invalid cookie name');
  return name;
}

function sanitizeCookiePath(pathStr) {
  if (typeof pathStr !== 'string' || pathStr.includes('..')) {
    throw new Error('Invalid cookie path');
  }
  const valid = /^\/[!#$%&'()*+\-\.0-9:<=>?@A-Z\[\]^_`a-z{|}~\/]*$/.test(pathStr);
  if (!valid) throw new Error('Invalid cookie path');
  return pathStr;
}

function sanitizeCookieDomain(domain) {
  const valid = /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/.test(domain);
  if (!valid) throw new Error('Invalid cookie domain');
  return domain;
}

module.exports = {
  sanitizeCookieName,
  sanitizeCookiePath,
  sanitizeCookieDomain
};
