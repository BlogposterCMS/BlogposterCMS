const { sandboxCommand } = require('../mother/modules/moduleLoader/moduleSandbox');
const { moduleSeccomp } = require('../mother/modules/moduleLoader/moduleSeccomp');
const { buildModuleRuntimeEnv } = require('../mother/modules/moduleLoader/moduleRuntimeEnv');

test('unsupported hosts have no ordinary-process fallback', () => {
  expect(() => sandboxCommand('/module','/runner','win32')).toThrow('E_MODULE_SANDBOX_UNAVAILABLE');
  expect(() => sandboxCommand('/module','/runner','darwin')).toThrow('E_MODULE_SANDBOX_UNAVAILABLE');
});
test('credentials never enter a community runner environment', () => {
  expect(Object.keys(buildModuleRuntimeEnv('/untrusted/package'))).toEqual([]);
});

test('Docker profiles allow only the measured namespace setup additions', () => {
  const fs = require('fs');
  const profile = require('../deploy/blogposter-community.seccomp.json');
  expect(profile.defaultAction).toBe('SCMP_ACT_ERRNO');
  expect(profile.syscalls.slice(-3)).toEqual([
    { names: ['mount', 'umount2', 'pivot_root'], action: 'SCMP_ACT_ALLOW' },
    { names: ['clone'], action: 'SCMP_ACT_ALLOW', args: [{ index: 0, value: 0x7e020011, op: 'SCMP_CMP_EQ' }] },
    { names: ['unshare'], action: 'SCMP_ACT_ALLOW', args: [{ index: 0, value: 0x10000000, op: 'SCMP_CMP_EQ' }] }
  ]);
  const apparmor = fs.readFileSync(require.resolve('../deploy/blogposter-community.apparmor'), 'utf8');
  expect(apparmor).toContain('mount fstype=(tmpfs,devpts),');
  expect(apparmor).toContain('deny @{PROC}/sys/[^k]** w');
  expect(apparmor).not.toMatch(/^\s*mount,\s*$/m);
});

test('runner omits procfs while keeping mandatory seccomp and read-only mounts', () => {
  const fs = require('fs');
  const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  const realpath = jest.spyOn(fs, 'realpathSync').mockImplementation(value => value);
  try {
    const { args } = sandboxCommand('/module', '/runner', 'linux');
    expect(args).toContain('--seccomp');
    expect(args).toContain('--ro-bind');
    expect(args).toContain('--unshare-all');
    expect(args).not.toContain('--proc');
    expect(args).not.toContain('--disable-userns');
  } finally { exists.mockRestore(); realpath.mockRestore(); }
});
test('seccomp is emitted only for supported syscall ABIs', () => {
  expect(moduleSeccomp('x64').length % 8).toBe(0);
  expect(moduleSeccomp('arm64').length % 8).toBe(0);
  expect(() => moduleSeccomp('ia32')).toThrow('E_MODULE_SANDBOX_ARCH');
});

// Evaluate the emitted classic BPF against synthetic seccomp_data. This catches
// jump-offset regressions that a byte-length assertion cannot detect.
function seccompDecision(architecture, syscall, flags = 0, audit) {
  const program = moduleSeccomp(architecture);
  const data = Buffer.alloc(64);
  data.writeUInt32LE(syscall, 0);
  data.writeUInt32LE(audit ?? (architecture === 'x64' ? 0xc000003e : 0xc00000b7), 4);
  data.writeUInt32LE(flags, 16);
  let accumulator = 0;
  for (let pc = 0; pc < program.length / 8; pc++) {
    const offset = pc * 8, code = program.readUInt16LE(offset);
    const yes = program[offset + 2], no = program[offset + 3], value = program.readUInt32LE(offset + 4);
    if (code === 0x20) accumulator = data.readUInt32LE(value);
    else if (code === 0x15) pc += accumulator === value ? yes : no;
    else if (code === 0x45) pc += (accumulator & value) !== 0 ? yes : no;
    else if (code === 0x06) return value;
    else throw new Error(`Unknown BPF instruction: ${code}`);
  }
  throw new Error('BPF program has no decision');
}

test.each([
  ['x64', 56, [41, 53, 57, 58, 165, 166, 272, 308]],
  ['arm64', 220, [198, 199, 40, 39, 97, 268]]
])('%s denies processes and every namespace while allowing ordinary threads', (arch, clone, denied) => {
  const allow = 0x7fff0000, deniedResult = 0x00050001;
  expect(seccompDecision(arch, clone, 0x00010000)).toBe(allow);
  expect(seccompDecision(arch, clone, 17)).toBe(deniedResult);
  for (const namespace of [0x80, 0x20000, 0x2000000, 0x4000000, 0x8000000, 0x10000000, 0x20000000, 0x40000000]) {
    expect(seccompDecision(arch, clone, 0x10000 | namespace)).toBe(deniedResult);
  }
  for (const syscall of denied) expect(seccompDecision(arch, syscall)).toBe(deniedResult);
  expect(seccompDecision(arch, 435)).toBe(0x00050026);
  expect(seccompDecision(arch, 0)).toBe(allow);
  expect(seccompDecision(arch, 0, 0, 0)).toBe(0x80000000);
});
