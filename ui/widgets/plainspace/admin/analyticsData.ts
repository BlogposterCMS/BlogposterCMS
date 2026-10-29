import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export interface AnalyticsSummary {
  version: number; days: number; from: string; to: string;
  pages: number; system: number; errors: number;
  previous: { pages: number; system: number };
  tables: Record<string, Array<{ name: string; count: number }>>;
  timeline: Array<{ day: string; pages: number; system: number }>;
  recentPages?: Array<{ at: string; page: string; title?: string; path?: string; actor: string; visitor?: string; session?: string; source: string; device: string; browser: string; os: string; country?: string; region?: string; city?: string; geoStatus?: string }>;
  recent: Array<{ at: string; kind: string; event: string; module: string; actor: string; outcome: string }>;
  health: { enabled: boolean; queued: number; dropped: number; lastError: string | null; truncated: boolean };
  retentionDays: number;
}
export async function fetchAnalytics(days: number): Promise<AnalyticsSummary> {
  if (!window.meltdownEmit) throw new Error('ANALYTICS_EMITTER_UNAVAILABLE');
  const result = await emitRuntimeAdmin<AnalyticsSummary>(window.meltdownEmit, window.ADMIN_TOKEN, 'analytics', 'summary', { days });
  if (result?.version !== 1 || !result.tables || !Array.isArray(result.timeline) || !result.health) throw new Error('ANALYTICS_RESULT_INVALID');
  return result;
}
