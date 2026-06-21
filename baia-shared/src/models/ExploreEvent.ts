export interface ExploreEvent {
  timestamp: Date;
  type: 'action' | 'observation' | 'error' | 'complete' | 'screenshot';
  message: string;
  screenshotBase64?: string;
  details?: Record<string, unknown>;
}
