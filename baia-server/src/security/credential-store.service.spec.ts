import { Logger } from '@nestjs/common';

import {
  CredentialStoreService,
  CredentialStoreError,
  EncryptedCredential,
} from './credential-store.service';
import { REDACTION_PLACEHOLDER } from './redaction';

const TEST_KEY = 'unit-test-master-key-deterministic-0123456789';
const SECRET = 'ghp_' + 'S'.repeat(36); // a realistic GitHub token shape
const REF = 'repo:acme/widgets';

function newService(key: string = TEST_KEY): CredentialStoreService {
  return new CredentialStoreService(key);
}

describe('CredentialStoreService', () => {
  describe('construction', () => {
    it('throws MISSING_KEY when no key is injected or in env', () => {
      const saved = process.env.CREDENTIAL_ENCRYPTION_KEY;
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
      try {
        expect(() => new CredentialStoreService(undefined)).toThrow(CredentialStoreError);
        expect(() => new CredentialStoreService(undefined)).toThrow(/not configured/i);
      } finally {
        if (saved !== undefined) {
          process.env.CREDENTIAL_ENCRYPTION_KEY = saved;
        }
      }
    });

    it('throws MISSING_KEY for an empty-string key', () => {
      expect(() => new CredentialStoreService('')).toThrow(CredentialStoreError);
    });

    it('falls back to process.env when no key is injected', () => {
      const saved = process.env.CREDENTIAL_ENCRYPTION_KEY;
      process.env.CREDENTIAL_ENCRYPTION_KEY = 'env-provided-key-value';
      try {
        const svc = new CredentialStoreService(undefined);
        svc.store(REF, SECRET);
        expect(svc.retrieve(REF)).toBe(SECRET);
      } finally {
        if (saved === undefined) {
          delete process.env.CREDENTIAL_ENCRYPTION_KEY;
        } else {
          process.env.CREDENTIAL_ENCRYPTION_KEY = saved;
        }
      }
    });
  });

  describe('round-trip encrypt/decrypt', () => {
    it('returns the original secret after store + retrieve', () => {
      const svc = newService();
      svc.store(REF, SECRET);
      expect(svc.retrieve(REF)).toBe(SECRET);
    });

    it('round-trips multiple distinct refs independently', () => {
      const svc = newService();
      svc.store('a', 'secret-a');
      svc.store('b', 'secret-b');
      expect(svc.retrieve('a')).toBe('secret-a');
      expect(svc.retrieve('b')).toBe('secret-b');
    });

    it('round-trips unicode and long secrets', () => {
      const svc = newService();
      const unicode = 'tøken-✓-日本語-' + 'z'.repeat(500);
      svc.store(REF, unicode);
      expect(svc.retrieve(REF)).toBe(unicode);
    });

    it('overwrites an existing ref with a fresh secret', () => {
      const svc = newService();
      svc.store(REF, 'first');
      svc.store(REF, 'second');
      expect(svc.retrieve(REF)).toBe('second');
    });
  });

  describe('stored value is ciphertext, not plaintext', () => {
    it('the persisted record never contains the plaintext', () => {
      const svc = newService();
      const record = svc.store(REF, SECRET);
      const serialized = JSON.stringify(record);
      expect(serialized).not.toContain(SECRET);
      expect(record.ciphertext).not.toContain(SECRET);
      expect(record.algorithm).toBe('aes-256-gcm');
    });

    it('getEncrypted exposes only ciphertext components', () => {
      const svc = newService();
      svc.store(REF, SECRET);
      const record = svc.getEncrypted(REF) as EncryptedCredential;
      expect(record).toBeDefined();
      expect(JSON.stringify(record)).not.toContain(SECRET);
      // base64 components decode to non-empty buffers
      expect(Buffer.from(record.iv, 'base64').length).toBe(12);
      expect(Buffer.from(record.authTag, 'base64').length).toBe(16);
      expect(Buffer.from(record.salt, 'base64').length).toBe(16);
    });

    it('encrypting the same secret twice yields different ciphertext (unique IV+salt)', () => {
      const svc = newService();
      const r1 = svc.store('one', SECRET);
      const r2 = svc.store('two', SECRET);
      expect(r1.ciphertext).not.toBe(r2.ciphertext);
      expect(r1.iv).not.toBe(r2.iv);
      expect(r1.salt).not.toBe(r2.salt);
    });
  });

  describe('decryption failures fail closed', () => {
    it('throws DECRYPTION_FAILED when the auth tag is tampered with', () => {
      const svc = newService();
      const record = svc.store(REF, SECRET);
      const tampered: EncryptedCredential = {
        ...record,
        authTag: Buffer.from('0'.repeat(16)).toString('base64'),
      };
      svc['records'].set(REF, tampered);
      expect(() => svc.retrieve(REF)).toThrow(/Failed to decrypt/i);
    });

    it('throws DECRYPTION_FAILED when decrypted with the wrong key', () => {
      const writer = newService('key-one');
      const record = writer.store(REF, SECRET);
      const reader = newService('key-two');
      reader['records'].set(REF, record);
      expect(() => reader.retrieve(REF)).toThrow(CredentialStoreError);
      try {
        reader.retrieve(REF);
      } catch (err) {
        expect((err as CredentialStoreError).code).toBe('DECRYPTION_FAILED');
      }
    });

    it('rejects an unsupported algorithm marker', () => {
      const svc = newService();
      const record = svc.store(REF, SECRET);
      svc['records'].set(REF, { ...record, algorithm: 'aes-128-cbc' as 'aes-256-gcm' });
      expect(() => svc.retrieve(REF)).toThrow(/Unsupported credential algorithm/i);
    });
  });

  describe('input validation', () => {
    it('rejects an empty credentialsRef', () => {
      const svc = newService();
      expect(() => svc.store('', SECRET)).toThrow(/non-empty/i);
    });

    it('rejects an empty secret', () => {
      const svc = newService();
      expect(() => svc.store(REF, '')).toThrow(/non-empty/i);
    });

    it('throws NOT_FOUND when retrieving an unknown ref', () => {
      const svc = newService();
      expect(() => svc.retrieve('missing')).toThrow(/No credential stored/i);
      try {
        svc.retrieve('missing');
      } catch (err) {
        expect((err as CredentialStoreError).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('lifecycle helpers', () => {
    it('has() reflects presence', () => {
      const svc = newService();
      expect(svc.has(REF)).toBe(false);
      svc.store(REF, SECRET);
      expect(svc.has(REF)).toBe(true);
    });

    it('delete() removes a stored credential', () => {
      const svc = newService();
      svc.store(REF, SECRET);
      expect(svc.delete(REF)).toBe(true);
      expect(svc.has(REF)).toBe(false);
      expect(svc.delete(REF)).toBe(false);
    });

    it('getEncrypted returns undefined for an unknown ref', () => {
      const svc = newService();
      expect(svc.getEncrypted('nope')).toBeUndefined();
    });
  });

  describe('secretsMatch (constant-time compare)', () => {
    it('returns true for equal secrets', () => {
      const svc = newService();
      expect(svc.secretsMatch('abc123', 'abc123')).toBe(true);
    });

    it('returns false for different secrets', () => {
      const svc = newService();
      expect(svc.secretsMatch('abc123', 'abc124')).toBe(false);
    });

    it('returns false for different-length secrets', () => {
      const svc = newService();
      expect(svc.secretsMatch('short', 'longersecret')).toBe(false);
    });
  });

  describe('no-leak-in-logs', () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function allLoggedText(): string {
      const calls = [
        ...logSpy.mock.calls,
        ...errorSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...debugSpy.mock.calls,
      ];
      return calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    }

    it('never logs the plaintext secret across store/retrieve/delete', () => {
      const svc = newService();
      svc.store(REF, SECRET);
      svc.retrieve(REF);
      svc.delete(REF);

      const logged = allLoggedText();
      expect(logSpy).toHaveBeenCalled(); // it *does* log non-secret activity
      expect(logged).not.toContain(SECRET);
      // the (non-secret) ref is allowed to appear
      expect(logged).toContain(REF);
    });

    it('never logs the secret even if the ref string contains a secret-shaped token', () => {
      const svc = newService();
      const leakyRef = 'Authorization: Bearer ghp_' + 'Q'.repeat(36);
      svc.store(leakyRef, SECRET);
      const logged = allLoggedText();
      expect(logged).not.toContain('ghp_' + 'Q'.repeat(36));
      expect(logged).toContain(REDACTION_PLACEHOLDER);
    });

    it('does not leak the secret through a thrown error message', () => {
      const svc = newService();
      svc.store(REF, SECRET);
      // force a decryption failure and inspect the error text
      svc['records'].set(REF, {
        ...(svc.getEncrypted(REF) as EncryptedCredential),
        authTag: Buffer.from('f'.repeat(16)).toString('base64'),
      });
      try {
        svc.retrieve(REF);
        fail('expected retrieve to throw');
      } catch (err) {
        expect(String((err as Error).message)).not.toContain(SECRET);
      }
    });
  });
});
