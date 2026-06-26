export interface DesignRecord {
  id?: string | number;
  title?: string;
  thumbnail?: string;
  created_at?: string | number | Date;
  updated_at?: string | number | Date;
  [key: string]: unknown;
}

type DesignerLayoutsEmitter = Window['meltdownEmit'];

const DESIGNER_MODULE = {
  moduleName: 'designer',
  moduleType: 'community'
} as const;

function requireEmitter(emit: DesignerLayoutsEmitter): NonNullable<DesignerLayoutsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_DESIGNER_LAYOUTS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function toDesigns(value: unknown): DesignRecord[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { designs?: unknown }).designs)
  ) {
    return (value as { designs: unknown[] }).designs.filter((item): item is DesignRecord => (
      Boolean(item) && typeof item === 'object'
    ));
  }
  return [];
}

export function designUrl(design: DesignRecord): string {
  return design.id
    ? `/admin/studio/design/${encodeURIComponent(String(design.id))}`
    : '/admin/studio/design';
}

export function designUpdatedAt(design: DesignRecord): string | number | Date | undefined {
  return design.updated_at || design.created_at;
}

export function sortDesignsByRecent(designs: DesignRecord[]): DesignRecord[] {
  return designs.slice().sort((a, b) => {
    const tsA = new Date(designUpdatedAt(a) || 0).getTime();
    const tsB = new Date(designUpdatedAt(b) || 0).getTime();
    return tsB - tsA;
  });
}

export async function fetchDesignerLayouts(
  emit: DesignerLayoutsEmitter,
  jwt: string | null | undefined
): Promise<DesignRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('designer.listDesigns', {
    jwt,
    ...DESIGNER_MODULE
  });
  return toDesigns(res);
}
