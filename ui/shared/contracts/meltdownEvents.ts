export type ModuleType = 'core' | 'community' | 'public';

export interface BaseEventPayload {
  jwt?: string;
  moduleName?: string;
  moduleType?: ModuleType | string;
  nonce?: string;
}

export interface MeltdownEventContract<TPayload extends BaseEventPayload = BaseEventPayload> {
  eventName: string;
  payload: TPayload;
}

export interface PageLookupPayload extends BaseEventPayload {
  slug: string;
  lane?: 'admin' | 'public' | string;
  language?: string;
}

export interface PageListPayload extends BaseEventPayload {
  lane?: 'admin' | 'public' | string;
}
