import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthmeService } from './authme.service';
import { AuthmeBindingService } from './authme-binding.service';
import { AuthFeatureService } from './auth-feature.service';
import { AuthmeRateLimitGuard } from './authme-rate-limit.guard';
import { AuthmeAdminController } from './authme.admin.controller';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [AuthmeAdminController],
  providers: [AuthmeService, AuthmeBindingService, AuthFeatureService, AuthmeRateLimitGuard],
  exports: [AuthmeService, AuthmeBindingService, AuthFeatureService, AuthmeRateLimitGuard],
})
export class AuthmeModule {}
