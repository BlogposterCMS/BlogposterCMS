export type LooseRecord = Record<string, any>;

export type RuntimeWidgetSizeSlot = {
  name: string;
  minCols?: number;
  maxCols?: number;
  minRows?: number;
  maxRows?: number;
};

export type RuntimeWidgetSizeContract = {
  supportedSlots?: RuntimeWidgetSizeSlot[];
  breakpoints?: Record<string, string[]>;
  heightMode?: 'auto' | 'fixed' | 'scroll' | string;
};

export type RuntimeWidgetDefinition = LooseRecord & {
  id: string;
  metadata?: LooseRecord & {
    layout?: RuntimeWidgetSizeContract;
    sizeContract?: RuntimeWidgetSizeContract;
  };
  codeUrl?: string;
  layout?: RuntimeWidgetSizeContract;
};

function isSizeContract(value: unknown): value is RuntimeWidgetSizeContract {
  return Boolean(value) && typeof value === 'object';
}

export function getRuntimeWidgetSizeContract(
  def: RuntimeWidgetDefinition
): RuntimeWidgetSizeContract | null {
  if (isSizeContract(def.layout)) return def.layout;
  if (isSizeContract(def.metadata?.layout)) return def.metadata.layout;
  if (isSizeContract(def.metadata?.sizeContract)) return def.metadata.sizeContract;
  return null;
}
