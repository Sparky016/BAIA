export interface ExploreEvent {
  timestamp: Date;
  type: 'action' | 'observation' | 'error' | 'complete';
  message: string;
  details?: Record<string, unknown>;
}
