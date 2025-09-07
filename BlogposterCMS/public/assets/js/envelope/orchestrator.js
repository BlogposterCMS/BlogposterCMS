import * as LR from './loaderRegistry.js';

export async function orchestrate(envelope, ctx) {
  if (!envelope || !Array.isArray(envelope.attachments)) return;
  const ordered = [...envelope.attachments].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  for (const att of ordered) {
    const loader = LR.get(att.type);
    if (!loader) continue;
    const p = loader(att.descriptor, ctx).catch(err => {
      console.error(`[Loader:${att.type}]`, err);
    });
    if (att.blocking) await p;
  }
}
