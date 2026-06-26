'use strict';
const path = require('path');

const ROOT_MODULE_NAME = path.basename(path.resolve(__dirname, '..', '..', '..'));

function moduleNameFromStack(stack) {
  const modules = [...(stack || '').matchAll(/\/modules\/([^/]+)/g)].map(m => m[1]);
  for (let i = modules.length - 1; i >= 0; i--) {
    const name = modules[i];
    if (name !== ROOT_MODULE_NAME && name !== 'modules') {
      return name;
    }
  }
  return modules[modules.length - 1];
}

module.exports = moduleNameFromStack;
