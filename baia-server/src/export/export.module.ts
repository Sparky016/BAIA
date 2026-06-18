import { Module } from '@nestjs/common';

import { CredentialStoreService } from '../security/credential-store.service';
import { ConfluenceAdapter } from './confluence.adapter';

@Module({
  providers: [CredentialStoreService, ConfluenceAdapter],
  exports: [ConfluenceAdapter],
})
export class ExportModule {}
