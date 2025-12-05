import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { AuthModule } from '../auth/auth.module';
import { ServerStatusController } from './server-status.controller';
import { ServerStatusService } from './server-status.service';

@Module({
  imports: [PrismaModule, MinecraftModule, AuthModule],
  controllers: [ServerStatusController],
  providers: [ServerStatusService],
})
export class ServerModule {}
