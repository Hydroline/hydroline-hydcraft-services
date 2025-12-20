import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { SyncModule } from '../lib/sync/sync.module';
import { LuckpermsModule } from '../luckperms/luckperms.module';
import { AuthmeService } from './authme.service';
import { AuthmeBindingService } from './authme-binding.service';
import { AuthFeatureService } from './auth-feature.service';
import { AuthmeRateLimitGuard } from './authme-rate-limit.guard';
import { AuthmeAdminController } from './authme.admin.controller';
import { AuthmeLookupService } from './authme-lookup.service';
import { AuthmeCacheSyncService } from './authme-cache-sync.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    CacheModule,
    SyncModule,
    LuckpermsModule,
  ],
  controllers: [AuthmeAdminController],
  providers: [
    AuthmeService,
    AuthmeBindingService,
    AuthFeatureService,
    AuthmeRateLimitGuard,
    AuthmeLookupService,
    AuthmeCacheSyncService,
  ],
  exports: [
    AuthmeService,
    AuthmeBindingService,
    AuthFeatureService,
    AuthmeRateLimitGuard,
    AuthmeLookupService,
  ],
})
export class AuthmeModule {}
