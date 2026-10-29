/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

test('registers the picker without opening it and forwards the existing options on demand', async () => {
  const openMediaExplorer = jest.fn().mockResolvedValue({ cancelled: true });
  const load = jest.fn(() => ({ openMediaExplorer }));
  const source = fs.readFileSync(path.join(__dirname, '../ui/shell/entries/openExplorer.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'exports', code)(load, {});
  expect(load).not.toHaveBeenCalled();
  const options = { publicUrlOnly: true, accept: 'video/*' as const };
  await expect(window._openMediaExplorer!(options)).resolves.toEqual({ cancelled: true });
  expect(openMediaExplorer).toHaveBeenCalledWith(options);
  expect(load).toHaveBeenCalledWith('../media/openExplorer.js');
});

test('a failed picker import rejects and can be retried', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../ui/shell/entries/openExplorer.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const load = jest.fn().mockImplementationOnce(() => { throw new Error('chunk offline'); })
    .mockReturnValue({ openMediaExplorer: async () => ({ cancelled: true }) });
  new Function('require', 'exports', code)(load, {});
  await expect(window._openMediaExplorer!({})).rejects.toThrow('chunk offline');
  await expect(window._openMediaExplorer!({})).resolves.toEqual({ cancelled: true });
});
