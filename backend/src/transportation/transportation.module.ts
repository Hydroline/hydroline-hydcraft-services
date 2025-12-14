import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { TransportationRailwayService } from './railway/railway.service';
import { TransportationRailwayController } from './railway/railway.controller';
import { TransportationRailwayAdminController } from './railway/railway.admin.controller';

@Module({
  imports: [PrismaModule, AuthModule, MinecraftModule],
  providers: [TransportationRailwayService],
  controllers: [
    TransportationRailwayController,
    TransportationRailwayAdminController,
  ],
})
export class TransportationModule {}
