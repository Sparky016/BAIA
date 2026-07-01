import { RunCancellationService } from './run-cancellation.service';

describe('RunCancellationService', () => {
  let service: RunCancellationService;

  beforeEach(() => {
    service = new RunCancellationService();
  });

  describe('cancel()', () => {
    it('marks a run as cancelled', () => {
      service.cancel('run-001');
      expect(service.isCancelled('run-001')).toBe(true);
    });

    it('is idempotent — cancelling the same run twice does not throw', () => {
      service.cancel('run-002');
      service.cancel('run-002');
      expect(service.isCancelled('run-002')).toBe(true);
    });

    it('does not affect other run IDs', () => {
      service.cancel('run-003');
      expect(service.isCancelled('run-999')).toBe(false);
    });
  });

  describe('isCancelled()', () => {
    it('returns false for an unknown run', () => {
      expect(service.isCancelled('unknown-run')).toBe(false);
    });

    it('returns true after cancel() is called', () => {
      service.cancel('run-004');
      expect(service.isCancelled('run-004')).toBe(true);
    });

    it('returns false after clear() is called', () => {
      service.cancel('run-005');
      service.clear('run-005');
      expect(service.isCancelled('run-005')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('removes a cancelled run from the set', () => {
      service.cancel('run-006');
      service.clear('run-006');
      expect(service.isCancelled('run-006')).toBe(false);
    });

    it('is safe to call on a run that was never cancelled', () => {
      expect(() => service.clear('run-never-cancelled')).not.toThrow();
    });

    it('only clears the specified run ID', () => {
      service.cancel('run-007');
      service.cancel('run-008');
      service.clear('run-007');
      expect(service.isCancelled('run-007')).toBe(false);
      expect(service.isCancelled('run-008')).toBe(true);
    });
  });
});
