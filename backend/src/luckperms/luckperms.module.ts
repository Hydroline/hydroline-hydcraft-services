import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { SyncModule } from '../lib/sync/sync.module';
import { LuckpermsService } from './luckperms.service';
import { LuckpermsAdminController } from './luckperms.admin.controller';
import { LuckpermsLookupService } from './luckperms-lookup.service';
import { LuckpermsCacheSyncService } from './luckperms-cache-sync.service';

@Global()
@Global()
@Module({
  imports: [ConfigModule, AuthModule, CacheModule, SyncModule],
  controllers: [LuckpermsAdminController],
  providers: [
    LuckpermsService,
    LuckpermsLookupService,
    LuckpermsCacheSyncService,
  ],
  exports: [LuckpermsService, LuckpermsLookupService],
})
export class LuckpermsModule {}
