import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Missing user context');
    }

    const granted = new Set<string>();
    for (const role of user.roles ?? []) {
      const permissionLinks = [
        ...(role.rolePermissions ?? []),
        ...(role.role?.rolePermissions ?? []),
      ];
      for (const link of permissionLinks) {
        const key = link.permission?.key;
        if (key) {
          granted.add(key);
        }
      }
    }

    const missing = requiredPermissions.filter((perm) => !granted.has(perm));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permissions: ${missing.join(', ')}`);
    }

    return true;
  }
}
