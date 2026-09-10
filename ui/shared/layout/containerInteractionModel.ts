import { conditionMatches, type Condition } from '../widget-ui/model.js';

export type ContainerInteraction = {
  version: 1; presentation: 'normal' | 'popover' | 'dialog' | 'drawer';
  triggerId?: string; triggerEvent?: 'click' | 'input' | 'focus'; when?: Condition;
  source?: 'publishedArticles' | 'sampleArticles'; queryId?: string;
  itemsField?: string; labelField?: string; linkField?: string; emptyText?: string;
};
/** Persisted container behavior is declarative; it supplies no code, URL or permission grant. */
export function normalizeContainerInteraction(raw: unknown): ContainerInteraction | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('CONTAINER_INTERACTION_INVALID');
  const value = raw as ContainerInteraction;
  const allowed = ['version','presentation','triggerId','triggerEvent','when','source','queryId','itemsField','labelField','linkField','emptyText'];
  if (Object.keys(value).some(key => !allowed.includes(key)) || value.version !== 1 || !['normal','popover','dialog','drawer'].includes(value.presentation)) throw new Error('CONTAINER_INTERACTION_INVALID');
  for (const key of ['triggerId','queryId'] as const) if (value[key] && !/^[A-Za-z0-9_-]{1,120}$/.test(value[key]!)) throw new Error('CONTAINER_INTERACTION_TARGET_INVALID');
  if (value.triggerEvent && !['click','input','focus'].includes(value.triggerEvent)) throw new Error('CONTAINER_INTERACTION_EVENT_INVALID');
  if (value.source && !['publishedArticles','sampleArticles'].includes(value.source)) throw new Error('CONTAINER_INTERACTION_SOURCE_INVALID');
  if (value.when) conditionMatches(value.when, {});
  for (const key of ['itemsField','labelField','linkField'] as const) {
    if (value[key]) conditionMatches({ref:value[key]!,operator:'truthy'}, {});
  }
  if (value.emptyText !== undefined && (typeof value.emptyText !== 'string' || value.emptyText.length > 300)) throw new Error('CONTAINER_INTERACTION_TEXT_LIMIT');
  return JSON.parse(JSON.stringify(value));
}
