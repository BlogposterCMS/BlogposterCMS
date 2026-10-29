'use strict';

// Real Linux negative test. No database, installed extension or operator file is changed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { startSandbox } = require('../mother/modules/moduleLoader/moduleSandbox');

async function verify() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-isolation-'));
  const directory = path.join(root, 'module'); fs.mkdirSync(directory);
  const sentinel = path.join(root, 'private.txt'); fs.writeFileSync(sentinel, 'unchanged');
  let hits = 0;
  const server = http.createServer((_req, res) => { hits++; res.end('private'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  // PIDs are reused across namespaces: PID 1 can exist in both. Compare process
  // identity rather than treating a coincidentally equal PID as host visibility.
  const hostCommand = fs.readFileSync('/proc/self/cmdline').toString('base64');
  const source = `module.exports = {async initialize({motherEmitter}) {
    const fs = require('fs'), http = require('http'), cp = require('child_process');
    const blocked = fn => {try {fn(); return false;} catch {return true;}};
    const result = {
      codeWrite: blocked(() => fs.writeFileSync('/module/index.js','overwritten')),
      hostRead: blocked(() => fs.readFileSync(${JSON.stringify(sentinel)})),
      receiptWrite: blocked(() => fs.writeFileSync('/app/data/extension-integrity/modules/probe.json','{}')),
      shell: blocked(() => cp.execFileSync('/bin/sh',['-c','true'])),
      subprocess: blocked(() => cp.execFileSync('/runtime/node',['--jitless','-e','process.exit(0)'])),
      secrets: !process.env.OPENAI_API_KEY && !process.env.HOME && !process.env.NODE_OPTIONS,
      hostProcesses: !fs.existsSync('/proc/${process.pid}/cmdline') ||
        fs.readFileSync('/proc/${process.pid}/cmdline').toString('base64') !== ${JSON.stringify(hostCommand)}
    };
    result.network = await new Promise(resolve => {
      const req=http.get('http://127.0.0.1:${port}/', res => {res.resume();resolve(false);});
      req.on('error',()=>resolve(true)); req.setTimeout(1000,()=>{req.destroy();resolve(true);});
    });
    await new Promise(resolve => motherEmitter.emit('probe.ready',result,resolve));
  }};`;
  fs.writeFileSync(path.join(directory, 'index.js'), source);
  let child;
  try {
    child = startSandbox(directory, path.resolve(__dirname, '../mother/modules/moduleLoader/moduleRunnerProcess.js'));
    let report;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('E_SANDBOX_TEST_TIMEOUT')), 10000);
      child.on('error', reject); child.on('exit', code => { if (code) reject(new Error(`E_SANDBOX_TEST_EXIT:${code}`)); });
      child.stderr.on('data', chunk => process.stderr.write(chunk));
      child.on('message', message => {
        if (message.type === 'request' && message.action === 'event.emit') {
          report = message.payload.eventPayload;
          child.send({bpModuleRunner:true,type:'response',id:message.id,payload:{emitted:true,callbackArgs:[]}});
        } else if (message.type === 'response' && message.id === 'init') {
          clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve();
        }
      });
      child.send({bpModuleRunner:true,type:'request',id:'init',action:'initialize',payload:{moduleName:'probe',moduleDir:'/module',indexJsPath:'/module/index.js'}});
    });
    assert.ok(report);
    for (const [check, passed] of Object.entries(report)) assert.equal(passed, true, check);
    assert.equal(hits, 0); assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unchanged');
    assert.equal(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), source);
    console.log(JSON.stringify({passed:true,checks:report,networkHits:hits}));
  } finally {
    child?.kill(); server.close();
    // Only the directly created temporary fixture is removed.
    fs.rmSync(root, {recursive:true,force:true});
  }
}
verify().catch(err => { console.error(err.message); process.exitCode = 1; });
