import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthmeCacheService } from './authme-cache.service';
import { LuckpermsCacheService } from './luckperms-cache.service';
import { PlayerDataCacheService } from './playerdata-cache.service';

@Module({
  imports: [PrismaModule],
  providers: [
    AuthmeCacheService,
    LuckpermsCacheService,
    PlayerDataCacheService,
  ],
  exports: [AuthmeCacheService, LuckpermsCacheService, PlayerDataCacheService],
})
export class CacheModule {}
