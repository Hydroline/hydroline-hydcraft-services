import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { TransportationRailwayController } from './railway/controllers/railway.controller';
import { TransportationRailwayAdminController } from './railway/controllers/railway.admin.controller';
import { TransportationRailwayRouteDetailService } from './railway/route-detail/railway-route-detail.service';
import { TransportationRailwayStationMapService } from './railway/services/railway-station-map.service';
import { TransportationRailwayListService } from './railway/services/railway-list.service';
import { TransportationRailwayService } from './railway/services/railway.service';
import { TransportationRailwaySyncService } from './railway/services/railway-sync.service';
import { TransportationRailwaySnapshotService } from './railway/snapshot/railway-snapshot.service';
import { TransportationRailwaySystemService } from './railway/services/railway-system.service';
import { TransportationRailwayCompanyBindingService } from './railway/services/railway-company-binding.service';
import { TransportationRailwaySystemController } from './railway/controllers/railway-system.controller';
import { TransportationRailwayBindingController } from './railway/controllers/railway-binding.controller';
import { TransportationRailwayCompanyController } from './railway/controllers/railway-company.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AttachmentsModule,
    forwardRef(() => MinecraftModule),
  ],
  providers: [
    TransportationRailwayService,
    TransportationRailwayRouteDetailService,
    TransportationRailwayListService,
    TransportationRailwaySyncService,
    TransportationRailwayStationMapService,
    TransportationRailwaySnapshotService,
    TransportationRailwaySystemService,
    TransportationRailwayCompanyBindingService,
  ],
  controllers: [
    TransportationRailwayController,
    TransportationRailwayAdminController,
    TransportationRailwaySystemController,
    TransportationRailwayBindingController,
    TransportationRailwayCompanyController,
  ],
  exports: [TransportationRailwaySyncService, TransportationRailwayService],
})
export class TransportationModule {}
