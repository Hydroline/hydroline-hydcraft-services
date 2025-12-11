import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ConfigModule } from './config/config.module';
import { PortalConfigModule } from './portal-config/portal-config.module';
import { PortalModule } from './portal/portal.module';
import { PortalGatewayModule } from './portal-gateway/portal-gateway.module';
import { PlayerModule } from './player/player.module';
import { AuthmeModule } from './authme/authme.module';
import { Ip2RegionModule } from './lib/ip2region/ip2region.module';
import { LuckpermsModule } from './luckperms/luckperms.module';
import { MinecraftModule } from './minecraft/minecraft.module';
import { OAuthModule } from './oauth/oauth.module';
import { RedisModule } from './lib/redis/redis.module';
import { RankModule } from './rank/rank.module';
import { ServerModule } from './server/server.module';
import { WorkflowModule } from './workflow/workflow.module';
import { CompanyModule } from './company/company.module';

@Module({
  imports: [
    RedisModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AttachmentsModule,
    ConfigModule,
    PortalConfigModule,
    PortalModule,
    PortalGatewayModule,
    RankModule,
    ServerModule,
    PlayerModule,
    AuthmeModule,
    Ip2RegionModule,
    LuckpermsModule,
    MinecraftModule,
    OAuthModule,
    WorkflowModule,
    CompanyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
