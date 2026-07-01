import { Global, Module } from '@nestjs/common';

import { OutputWriterService } from './output-writer.service';

@Global()
@Module({
  providers: [OutputWriterService],
  exports: [OutputWriterService],
})
export class OutputModule {}
