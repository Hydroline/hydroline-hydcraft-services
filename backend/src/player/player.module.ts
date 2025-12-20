import { Module, forwardRef } from '@nestjs/common';
import { PlayerController } from './player.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerService } from './player.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Ip2RegionModule } from '../lib/ip2region/ip2region.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthmeModule } from '../authme/authme.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { PlayerAutomationService } from './player-automation.service';
import { RedisModule } from '../lib/redis/redis.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    CacheModule,
    Ip2RegionModule,
    AttachmentsModule,
    AuthmeModule,
    MinecraftModule,
    RedisModule,
  ],
  controllers: [PlayerController],
  providers: [PlayerService, PlayerAutomationService],
  exports: [PlayerService],
})
export class PlayerModule {}
