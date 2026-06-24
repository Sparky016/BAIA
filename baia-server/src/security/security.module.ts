import { randomBytes } from 'node:crypto';

import { Module } from '@nestjs/common';

import { CREDENTIAL_ENCRYPTION_KEY, CredentialStoreService } from './credential-store.service';

/**
 * Provides the single, shared {@link CredentialStoreService} instance (and the
 * master encryption key it derives from) for the whole application.
 *
 * Because the store keeps credentials in an in-memory map, every consumer
 * (pipeline seeding, export reading) MUST share the same instance. Centralising
 * the provider here and importing this module — rather than re-providing
 * `CredentialStoreService` per feature module — guarantees that singleton.
 */
@Module({
  providers: [
    {
      provide: CREDENTIAL_ENCRYPTION_KEY,
      useFactory: () => {
        let key = process.env['CREDENTIAL_ENCRYPTION_KEY'];
        if (!key || key.trim().length === 0) {
          key = randomBytes(32).toString('hex');
        }
        return key;
      },
    },
    CredentialStoreService,
  ],
  exports: [CredentialStoreService],
})
export class SecurityModule {}
