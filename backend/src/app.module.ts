import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ConfigModule } from './config/config.module';
import { PortalConfigModule } from './portal-config/portal-config.module';
import { PortalModule } from './portal/portal.module';
import { AuthmeModule } from './authme/authme.module';
import { Ip2RegionModule } from './lib/ip2region/ip2region.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AttachmentsModule,
    ConfigModule,
    PortalConfigModule,
    PortalModule,
    AuthmeModule,
    Ip2RegionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
