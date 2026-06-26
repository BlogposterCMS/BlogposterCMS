const moduleNameFromStack = require('../mother/utils/moduleNameFromStack');

test('extracts offending module from stack', () => {
  const stack = [
    'ReferenceError: process is not defined',
    '    at fetchNews (/home/user/modules/modules/BlogposterCMS/modules/news/index.js:13:22)',
    '    at MotherEmitter.<anonymous> (/home/user/modules/modules/BlogposterCMS/modules/news/index.js:73:7)',
    '    at MotherEmitter.emit (/home/user/modules/modules/BlogposterCMS/mother/emitters/motherEmitter.js:257:18)',
    '    at motherEmitter.emit (/home/user/modules/modules/BlogposterCMS/mother/emitters/motherEmitter.js:272:13)',
    '    at /home/user/modules/modules/BlogposterCMS/app.js:401:17'
  ].join('\n');

  const name = moduleNameFromStack(stack);
  expect(name).toBe('news');
});
