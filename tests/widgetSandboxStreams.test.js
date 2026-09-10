const vm = require('vm');
const { widgetSandboxSource } = require('../mother/modules/widgetManager/widgetSandboxSource');

test('worker receives early stream events, then closes its approved subscription', async () => {
  const output = []; let message;
  const source = `async function render(ui, context) {
    const stream = await context.services.subscribe('replies', 'support', data => ui.render({tag:'p',text:data}));
    ui.on('close', () => stream.close());
  }`;
  vm.runInNewContext(widgetSandboxSource(source), { postMessage: value => output.push(value), addEventListener: (_type, handler) => { message = handler; } });
  const init = message({ data: { type: 'init', context: {} } });
  const request = output[0];
  expect(request).toMatchObject({ type: 'service', method: 'subscribe', name: 'replies' });
  await message({ data: { type: 'stream', key: String(request.id), data: 'Early reply' } });
  expect(output[1]).toMatchObject({ type: 'view', tree: { text: 'Early reply' } });
  await message({ data: { type: 'result', id: request.id, result: true } }); await init;
  const closing = message({ data: { type: 'action', action: 'close' } });
  const unsubscribe = output.at(-1);
  expect(unsubscribe).toMatchObject({ method: 'unsubscribe', input: String(request.id) });
  await message({ data: { type: 'result', id: unsubscribe.id, result: true } }); await closing;
  const count = output.length;
  await message({ data: { type: 'stream', key: String(request.id), data: 'Late reply' } });
  expect(output).toHaveLength(count);
});
