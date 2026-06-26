import * as LR from './loaderRegistry.js';
import type { LoaderContext } from './loaderRegistry.js';

export interface EnvelopeAttachment {
  type: string;
  descriptor?: unknown;
  source?: unknown;
  priority?: number | null;
  blocking?: boolean;
}

export interface RuntimeEnvelope {
  attachments?: EnvelopeAttachment[] | null;
  meta?: {
    seoTitle?: string | null;
  } | null;
}

export async function orchestrate(
  envelope: RuntimeEnvelope | null | undefined,
  ctx: LoaderContext
): Promise<void> {
  if (!envelope || !Array.isArray(envelope.attachments)) return;
  const ordered = [...envelope.attachments].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  for (const att of ordered) {
    const loader = LR.get(att.type);
    if (!loader) continue;
    const p = Promise.resolve(loader(att.descriptor, ctx)).catch(err => {
      console.error(`[Loader:${att.type}]`, err);
    });
    if (att.blocking) await p;
  }
}
