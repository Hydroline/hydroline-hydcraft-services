import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { OAuthProvidersService } from './services/oauth-providers.service';
import { OAuthLogService } from './services/oauth-log.service';
import { OAuthFlowService } from './services/oauth-flow.service';
import { OAuthStateService } from './services/oauth-state.service';
import { OAuthAdminController } from './controllers/oauth-admin.controller';
import { OAuthPublicController } from './controllers/oauth-public.controller';
import { OAuthProxyTestController } from './controllers/oauth-proxy-test.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ConfigModule),
  ],
  controllers: [
    OAuthAdminController,
    OAuthPublicController,
    OAuthProxyTestController,
  ],
  providers: [
    OAuthProvidersService,
    OAuthLogService,
    OAuthFlowService,
    OAuthStateService,
  ],
  exports: [OAuthProvidersService, OAuthLogService, OAuthFlowService],
})
export class OAuthModule {}
