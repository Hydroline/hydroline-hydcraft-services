import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { TransportationRailwayService } from './railway/railway.service';
import { TransportationRailwayRouteDetailService } from './railway/railway-route-detail.service';
import { TransportationRailwayListService } from './railway/railway-list.service';
import { TransportationRailwayController } from './railway/railway.controller';
import { TransportationRailwayAdminController } from './railway/railway.admin.controller';
import { TransportationRailwaySyncService } from './railway/railway-sync.service';

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => MinecraftModule)],
  providers: [
    TransportationRailwayService,
    TransportationRailwayRouteDetailService,
    TransportationRailwayListService,
    TransportationRailwaySyncService,
  ],
  controllers: [
    TransportationRailwayController,
    TransportationRailwayAdminController,
  ],
  exports: [TransportationRailwaySyncService],
})
export class TransportationModule {}
