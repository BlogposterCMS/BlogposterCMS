import type {
  DashboardWidgetSizeContract,
  DashboardWidgetSizeSlot
} from '../../shared/layout/dashboardSlots.js';

export type LooseRecord = Record<string, any>;

export type RuntimeWidgetSizeSlot = DashboardWidgetSizeSlot;
export type RuntimeWidgetSizeContract = DashboardWidgetSizeContract;

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
