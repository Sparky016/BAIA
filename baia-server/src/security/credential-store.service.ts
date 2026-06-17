import { Buffer } from 'node:buffer';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { redactString } from './redaction';

/**
 * Injection token carrying the master encryption key (typically sourced from
 * the `CREDENTIAL_ENCRYPTION_KEY` environment variable). Provided as a token so
 * the key is injectable/configurable and tests can supply a deterministic value
 * without touching `process.env`.
 */
export const CREDENTIAL_ENCRYPTION_KEY = 'CREDENTIAL_ENCRYPTION_KEY';

/**
 * Opaque, encrypted-at-rest record persisted for a single credential.
 *
 * No field contains plaintext: `ciphertext`, `iv`, and `authTag` together are
 * the AES-256-GCM output. The structure is safe to serialise to disk or a DB.
 */
export interface EncryptedCredential {
  /** AES-256-GCM ciphertext, base64-encoded. Never the plaintext secret. */
  readonly ciphertext: string;
  /** Random 96-bit initialisation vector, base64-encoded. Unique per write. */
  readonly iv: string;
  /** 128-bit GCM authentication tag, base64-encoded. Detects tampering. */
  readonly authTag: string;
  /** Per-record random salt used to derive the data key, base64-encoded. */
  readonly salt: string;
  /** Algorithm marker for forward-compatibility / migration. */
  readonly algorithm: 'aes-256-gcm';
}

/**
 * Error thrown for any credential-store failure. Its message is deliberately
 * generic and **never** embeds the secret, the key, or decrypted material, so
 * it is safe to log.
 */
export class CredentialStoreError extends Error {
  constructor(
    message: string,
    /** Stable code so callers can branch without string-matching. */
    readonly code: 'NOT_FOUND' | 'MISSING_KEY' | 'INVALID_INPUT' | 'DECRYPTION_FAILED'
  ) {
    super(message);
    this.name = 'CredentialStoreError';
  }
}

const ALGORITHM = 'aes-256-gcm' as const;
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // 96-bit nonce — recommended for GCM
const SALT_LENGTH_BYTES = 16;

/**
 * Encrypted-at-rest store for integration credentials (repo + Confluence
 * tokens), keyed by an opaque `credentialsRef`.
 *
 * ## Security properties
 * - Secrets are encrypted with **AES-256-GCM** before they ever leave the
 *   `store` call. The in-memory map and any future persistence layer only ever
 *   hold {@link EncryptedCredential} records — never plaintext.
 * - A per-record random salt derives a unique data key from the master key via
 *   `scrypt`, and a per-write random IV guarantees that encrypting the same
 *   secret twice yields different ciphertext.
 * - The GCM auth tag is verified on read; tampering or a wrong key fails closed
 *   with `DECRYPTION_FAILED` rather than returning corrupt plaintext.
 * - **Secrets are never logged.** Only the (non-secret) `credentialsRef` and
 *   coarse outcomes are emitted, and log lines are defensively passed through
 *   {@link redactString}.
 */
@Injectable()
export class CredentialStoreService {
  private readonly logger = new Logger(CredentialStoreService.name);

  /** Master key bytes derived once from the injected key material. */
  private readonly masterKey: Buffer;

  /**
   * In-memory backing store. Holds only ciphertext records. A persistent
   * adapter (DB/disk) can later replace this map without weakening the crypto
   * boundary, because every value is already an {@link EncryptedCredential}.
   */
  private readonly records = new Map<string, EncryptedCredential>();

  constructor(
    @Optional()
    @Inject(CREDENTIAL_ENCRYPTION_KEY)
    encryptionKey?: string
  ) {
    const keyMaterial = encryptionKey ?? process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!keyMaterial || keyMaterial.length === 0) {
      throw new CredentialStoreError(
        'Credential encryption key is not configured (CREDENTIAL_ENCRYPTION_KEY).',
        'MISSING_KEY'
      );
    }
    // Normalise arbitrary-length key material to exactly 32 bytes with a fixed
    // application salt. The per-record salt below provides the per-secret
    // uniqueness; this step only guarantees a valid AES-256 master key.
    this.masterKey = scryptSync(keyMaterial, 'baia.credential-store.v1', KEY_LENGTH_BYTES);
  }

  /**
   * Encrypt and persist a secret under `credentialsRef`. Re-storing an existing
   * ref overwrites it (with fresh salt + IV). Returns the encrypted record that
   * was persisted (also useful for callers that own their own persistence).
   *
   * @throws {CredentialStoreError} `INVALID_INPUT` if ref or secret is empty.
   */
  store(credentialsRef: string, secret: string): EncryptedCredential {
    if (!credentialsRef || credentialsRef.length === 0) {
      throw new CredentialStoreError('credentialsRef must be a non-empty string.', 'INVALID_INPUT');
    }
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new CredentialStoreError('secret must be a non-empty string.', 'INVALID_INPUT');
    }

    const record = this.encrypt(secret);
    this.records.set(credentialsRef, record);
    this.logger.log(redactString(`Stored encrypted credential for ref="${credentialsRef}"`));
    return record;
  }

  /**
   * Decrypt and return the plaintext secret for `credentialsRef`.
   *
   * @throws {CredentialStoreError} `NOT_FOUND` if the ref is unknown,
   *         `DECRYPTION_FAILED` if the record is tampered with or the key is wrong.
   */
  retrieve(credentialsRef: string): string {
    const record = this.records.get(credentialsRef);
    if (!record) {
      throw new CredentialStoreError(
        `No credential stored for ref="${credentialsRef}".`,
        'NOT_FOUND'
      );
    }
    const secret = this.decrypt(record);
    this.logger.log(redactString(`Retrieved credential for ref="${credentialsRef}"`));
    return secret;
  }

  /** Whether a credential is stored under `credentialsRef`. */
  has(credentialsRef: string): boolean {
    return this.records.has(credentialsRef);
  }

  /**
   * Remove a stored credential. Returns `true` if a record was deleted.
   * Comparison of the ref is plain; no secret is touched.
   */
  delete(credentialsRef: string): boolean {
    const deleted = this.records.delete(credentialsRef);
    if (deleted) {
      this.logger.log(redactString(`Deleted credential for ref="${credentialsRef}"`));
    }
    return deleted;
  }

  /**
   * Read the raw encrypted record without decrypting it. Useful for a
   * persistence adapter. Returns `undefined` if the ref is unknown.
   */
  getEncrypted(credentialsRef: string): EncryptedCredential | undefined {
    return this.records.get(credentialsRef);
  }

  /** Encrypt a plaintext secret into an opaque at-rest record. */
  private encrypt(secret: string): EncryptedCredential {
    const salt = randomBytes(SALT_LENGTH_BYTES);
    const iv = randomBytes(IV_LENGTH_BYTES);
    const dataKey = this.deriveDataKey(salt);

    const cipher = createCipheriv(ALGORITHM, dataKey, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
      algorithm: ALGORITHM,
    };
  }

  /** Decrypt an at-rest record back to its plaintext secret. */
  private decrypt(record: EncryptedCredential): string {
    if (record.algorithm !== ALGORITHM) {
      throw new CredentialStoreError(
        `Unsupported credential algorithm "${record.algorithm}".`,
        'INVALID_INPUT'
      );
    }
    try {
      const salt = Buffer.from(record.salt, 'base64');
      const iv = Buffer.from(record.iv, 'base64');
      const authTag = Buffer.from(record.authTag, 'base64');
      const ciphertext = Buffer.from(record.ciphertext, 'base64');
      const dataKey = this.deriveDataKey(salt);

      const decipher = createDecipheriv(ALGORITHM, dataKey, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch {
      // Never surface the underlying crypto error — it can leak structural
      // detail. Fail closed with a generic, secret-free message.
      throw new CredentialStoreError(
        'Failed to decrypt credential (wrong key or tampered record).',
        'DECRYPTION_FAILED'
      );
    }
  }

  /** Derive a unique per-record AES-256 data key from the master key + salt. */
  private deriveDataKey(salt: Buffer): Buffer {
    return scryptSync(this.masterKey, salt, KEY_LENGTH_BYTES);
  }

  /**
   * Constant-time equality for two secrets. Exposed for callers that need to
   * compare a presented secret against a stored one without leaking timing
   * information (e.g. webhook signature checks). Never logs either operand.
   */
  secretsMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
