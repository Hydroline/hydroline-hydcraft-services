import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthmeModule } from '../authme/authme.module';
import { PlayerModule } from '../player/player.module';
import { RedisModule } from '../lib/redis/redis.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { CacheModule } from '../cache/cache.module';
import { SyncModule } from '../lib/sync/sync.module';
import { RankSnapshotService } from './rank-snapshot.service';
import { RankController } from './rank.controller';
import { RankService } from './rank.service';
import { RankSyncService } from './rank-sync.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuthmeModule,
    PlayerModule,
    RedisModule,
    MinecraftModule,
    CacheModule,
    SyncModule,
  ],
  controllers: [RankController],
  providers: [RankService, RankSnapshotService, RankSyncService],
})
export class RankModule {}
