import { Module } from '@nestjs/common';
import { PortalGatewayController } from './portal-gateway.controller';
import { PortalGatewayService } from './portal-gateway.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PortalConfigModule } from '../portal-config/portal-config.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { PlayerModule } from '../player/player.module';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { TransportationModule } from '../transportation/transportation.module';

@Module({
  imports: [
    PrismaModule,
    PortalConfigModule,
    MinecraftModule,
    PlayerModule,
    AuthModule,
    CacheModule,
    TransportationModule,
  ],
  controllers: [PortalGatewayController],
  providers: [PortalGatewayService],
  exports: [PortalGatewayService],
})
export class PortalGatewayModule {}
