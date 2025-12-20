import { Global, Module } from '@nestjs/common';
import { ScheduledFetchService } from './scheduled-fetch.service';

@Global()
@Module({
  providers: [ScheduledFetchService],
  exports: [ScheduledFetchService],
})
export class SyncModule {}
