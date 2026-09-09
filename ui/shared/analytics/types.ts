export interface ConsentConfig {
  enabled: boolean; bannerEnabled: boolean; mode: 'opt-in' | 'opt-out'; policyVersion: number;
  cookieDays: number; visitorDays: number; sessionMinutes: number; position: 'top' | 'bottom';
  analytics: boolean; recognition: boolean; marketing: boolean; personalization: boolean;
  title: string; message: string; privacyUrl: string; googleEnabled: boolean; measurementId: string;
}
export type ConsentCategory = 'analytics' | 'recognition' | 'marketing' | 'personalization';
export type ConsentChoice = Record<ConsentCategory, boolean> & { at: number; version: number };
export interface AnalyticsConnector {
  id: string; label: string; verification: string;
  start(config: ConsentConfig, nonce: string): void;
  stop(config: ConsentConfig): void;
}
