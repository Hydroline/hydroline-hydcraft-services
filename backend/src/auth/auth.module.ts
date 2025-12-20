import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users/users.service';
import { UsersController } from './controllers/users.controller';
import { RolesService } from './services/roles.service';
import { RolesController } from './controllers/roles.controller';
import { ContactChannelsService } from './services/contact-channels.service';
import { ContactChannelsController } from './controllers/contact-channels.controller';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { AuthBootstrap } from './auth.bootstrap';
import { OptionalAuthGuard } from './optional-auth.guard';
import { ApiAuthController } from './controllers/api-auth.controller';
import { ApiAuthmeController } from './controllers/api-authme.controller';
import { Ip2RegionModule } from '../lib/ip2region/ip2region.module';
import { MailModule } from '../mail/mail.module';
import { PlayersController } from './controllers/players.controller';
import { PlayersService } from './services/players.service';
import { RbacSelfController } from './controllers/rbac-self.controller';
import { AdminAuditService } from './services/admin-audit.service';
import { ConfigModule } from '../config/config.module';
import { OAuthModule } from '../oauth/oauth.module';
import { VerificationAdminController } from './controllers/verification-admin.controller';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    Ip2RegionModule,
    MailModule,
    forwardRef(() => ConfigModule),
    forwardRef(() => OAuthModule),
    forwardRef(() => AttachmentsModule),
    CacheModule,
  ],
  controllers: [
    AuthController,
    ApiAuthController,
    ApiAuthmeController,
    UsersController,
    RolesController,
    ContactChannelsController,
    PlayersController,
    RbacSelfController,
    VerificationAdminController,
  ],
  providers: [
    AuthService,
    UsersService,
    RolesService,
    ContactChannelsService,
    PlayersService,
    AdminAuditService,
    AuthGuard,
    PermissionsGuard,
    OptionalAuthGuard,
    AuthBootstrap,
  ],
  exports: [
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    PermissionsGuard,
    AdminAuditService,
  ],
})
export class AuthModule {}
