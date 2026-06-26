#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const jestBin = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const files = [
  path.join(__dirname, 'sqlitePlaceholderParity.test.js'),
  path.join(__dirname, 'mongoPlaceholderParity.test.js'),
];

const proc = spawn(process.execPath, [jestBin, '--runTestsByPath', ...files], { stdio: 'inherit' });
proc.on('exit', code => process.exit(code));

