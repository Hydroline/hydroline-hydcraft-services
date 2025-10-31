import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { ContactChannelsService } from './contact-channels.service';
import { ContactChannelsController } from './contact-channels.controller';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { AuthBootstrap } from './auth.bootstrap';

@Module({
  controllers: [
    AuthController,
    UsersController,
    RolesController,
    ContactChannelsController,
  ],
  providers: [
    AuthService,
    UsersService,
    RolesService,
    ContactChannelsService,
    AuthGuard,
    PermissionsGuard,
    AuthBootstrap,
  ],
  exports: [AuthService],
})
export class AuthModule {}
