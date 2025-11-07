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
    const denied = new Set<string>();

    const applyPermission = (permission?: {
      key?: string | null;
      metadata?: unknown;
    }) => {
      const key = permission?.key;
      if (!key) return;
      const effect = this.resolveEffect(permission?.metadata);
      if (effect === 'DENY') {
        denied.add(key);
        granted.delete(key);
        return;
      }
      if (!denied.has(key)) {
        granted.add(key);
      }
    };

    for (const role of user.roles ?? []) {
      const permissionLinks = [
        ...(role.rolePermissions ?? []),
        ...(role.role?.rolePermissions ?? []),
      ];
      for (const link of permissionLinks) {
        applyPermission(link.permission);
      }
    }

    for (const labelLink of user.permissionLabels ?? []) {
      const labelPermissions = labelLink.label?.permissions ?? [];
      for (const link of labelPermissions) {
        applyPermission(link.permission);
      }
    }

    for (const denyKey of denied) {
      granted.delete(denyKey);
    }

    const missing = requiredPermissions.filter((perm) => !granted.has(perm));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing permissions: ${missing.join(', ')}`,
      );
    }

    return true;
  }

  private resolveEffect(metadata: unknown): 'ALLOW' | 'DENY' {
    if (
      metadata &&
      typeof metadata === 'object' &&
      'effect' in (metadata as Record<string, unknown>)
    ) {
      const value = (metadata as Record<string, unknown>).effect;
      if (typeof value === 'string' && value.toUpperCase() === 'DENY') {
        return 'DENY';
      }
    }
    return 'ALLOW';
  }
}
