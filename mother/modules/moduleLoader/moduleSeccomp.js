'use strict';

/** Classic BPF for Linux seccomp. Deny process creation, namespaces and new sockets;
 * allow pthread clone so Node can initialize its bounded worker pool. */
function moduleSeccomp(architecture = process.arch) {
  const architectures = {
    x64: { audit: 0xc000003e, clone: 56, deny: [41, 53, 57, 58, 101, 165, 166, 272, 308, 310, 311, 321] },
    arm64: { audit: 0xc00000b7, clone: 220, deny: [198, 199, 117, 40, 39, 97, 268, 270, 271, 280] }
  };
  const spec = architectures[architecture];
  if (!spec) throw new Error('[E_MODULE_SANDBOX_ARCH] Only Linux x64 and arm64 are supported.');
  const instructions = [];
  const emit = (code, jt, jf, value) => instructions.push([code, jt, jf, value]);
  const load = offset => emit(0x20, 0, 0, offset);
  const equal = (value, yes, no) => emit(0x15, yes, no, value);
  const result = value => emit(0x06, 0, 0, value);
  load(4); equal(spec.audit, 1, 0); result(0x80000000); // Kill mismatched syscall ABI.
  load(0);
  emit(0x45, 0, 1, 0x40000000); result(0x80000000); // Reject x32 syscall encoding.
  equal(435, 0, 1); result(0x00050000 | 38); // clone3 -> ENOSYS: libc falls back to clone.
  for (const syscall of spec.deny) { equal(syscall, 0, 1); result(0x00050000 | 1); }
  equal(spec.clone, 0, 6);
  load(16); emit(0x45, 1, 0, 0x00010000); result(0x00050000 | 1); // CLONE_THREAD required.
  // Even thread-shaped calls cannot request any namespace (including NEWCGROUP).
  emit(0x45, 0, 1, 0x7e020080); result(0x00050000 | 1);
  result(0x7fff0000);
  result(0x7fff0000);
  const buffer = Buffer.alloc(instructions.length * 8);
  instructions.forEach(([code, jt, jf, value], index) => {
    const offset = index * 8;
    buffer.writeUInt16LE(code, offset); buffer[offset + 2] = jt; buffer[offset + 3] = jf; buffer.writeUInt32LE(value, offset + 4);
  });
  return buffer;
}

module.exports = { moduleSeccomp };
