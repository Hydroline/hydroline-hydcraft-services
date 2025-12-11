import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Counter } from 'prom-client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { UpdateRolePermissionsDto } from '../dto/update-role-permissions.dto';
import { CreatePermissionLabelDto } from '../dto/create-permission-label.dto';
import { UpdatePermissionLabelDto } from '../dto/update-permission-label.dto';
import { AdminAuditService } from './admin-audit.service';

const rbacOperationCounter = new Counter({
  name: 'rbac_admin_operations_total',
  help: 'Count of RBAC administrative operations',
  labelNames: ['action'],
});

// 兼容旧版默认权限（仍然保留，不直接移除）
export const DEFAULT_PERMISSIONS = {
  MANAGE_USERS: 'auth.manage.users',
  MANAGE_CONTACT_CHANNELS: 'auth.manage.contact-channels',
  MANAGE_ROLES: 'auth.manage.roles',
  MANAGE_OAUTH: 'auth.manage.oauth',
  MANAGE_ATTACHMENTS: 'assets.manage.attachments',
  MANAGE_CONFIG: 'config.manage',
  MANAGE_PORTAL_HOME: 'portal.manage.home',
  MANAGE_MINECRAFT: 'minecraft.manage.servers',
};

// 新的细粒度权限常量（供后端控制器与前端使用）
export const PERMISSIONS = {
  // Portal / 管理概览
  PORTAL_VIEW_ADMIN_DASHBOARD: 'portal.view.admin-dashboard',
  PORTAL_VIEW_ADMIN_STATS: 'portal.view.admin-stats',

  // 用户 & 玩家
  AUTH_VIEW_USERS: 'auth.view.users',
  AUTH_MANAGE_USERS: 'auth.manage.users',
  AUTH_ADMIN_USER_SECURITY: 'auth.admin.user-security',
  AUTH_MANAGE_USER_PERMISSIONS: 'auth.manage.user-permissions',
  AUTH_VIEW_PLAYERS: 'auth.view.players',
  AUTH_MANAGE_PLAYERS: 'auth.manage.players',

  // RBAC
  AUTH_VIEW_RBAC: 'auth.view.rbac',
  AUTH_MANAGE_ROLES: 'auth.manage.roles',
  AUTH_MANAGE_PERMISSIONS: 'auth.manage.permissions',
  AUTH_MANAGE_PERMISSION_LABELS: 'auth.manage.permission-labels',
  AUTH_ADMIN_SELF_PERMISSIONS: 'auth.admin.self-permissions',

  // 附件
  ASSETS_VIEW_ATTACHMENTS: 'assets.view.attachments',
  ASSETS_MANAGE_ATTACHMENTS: 'assets.manage.attachments',
  ASSETS_ADMIN_ATTACHMENTS_PUBLIC: 'assets.admin.attachments-public',

  // 数据同步 / 外部服务
  CONFIG_VIEW_AUTHME: 'config.view.authme',
  CONFIG_MANAGE_AUTHME: 'config.manage.authme',
  CONFIG_VIEW_LUCKPERMS: 'config.view.luckperms',
  CONFIG_MANAGE_LUCKPERMS: 'config.manage.luckperms',
  CONFIG_VIEW_EXTERNAL_SYNC: 'config.view.external-sync',
  CONFIG_MANAGE_EXTERNAL_SYNC: 'config.manage.external-sync',

  // Minecraft / Beacon
  MINECRAFT_VIEW_SERVERS: 'minecraft.view.servers',
  MINECRAFT_MANAGE_SERVERS: 'minecraft.manage.servers',
  MINECRAFT_MANAGE_MCSM_CONTROL: 'minecraft.manage.mcsm-control',
  BEACON_VIEW_STATUS: 'beacon.view.status',
  BEACON_VIEW_LOGS: 'beacon.view.logs',
  BEACON_MANAGE_CONNECTION: 'beacon.manage.connection',
  BEACON_ADMIN_FORCE_UPDATE: 'beacon.admin.force-update',

  // Verification / 安全策略
  CONFIG_VIEW_VERIFICATION: 'config.view.verification',
  CONFIG_MANAGE_VERIFICATION: 'config.manage.verification',
  CONFIG_MANAGE_AUTH_POLICY: 'config.manage.auth-policy',
  CONFIG_MANAGE_SECURITY: 'config.manage.security',

  // Portal 首页配置
  PORTAL_VIEW_HOME_CONFIG: 'portal.view.home-config',
  PORTAL_MANAGE_HOME_CONTENT: 'portal.manage.home-content',
  PORTAL_MANAGE_HOME_VISIBILITY: 'portal.manage.home-visibility',
  PORTAL_MANAGE_HOME_PUBLISH: 'portal.manage.home-publish',

  // OAuth 管理
  OAUTH_VIEW_PROVIDERS: 'oauth.view.providers',
  OAUTH_MANAGE_PROVIDERS: 'oauth.manage.providers',
  OAUTH_VIEW_ACCOUNTS: 'oauth.view.accounts',
  OAUTH_MANAGE_ACCOUNTS: 'oauth.manage.accounts',
  OAUTH_VIEW_LOGS: 'oauth.view.logs',
  OAUTH_VIEW_STATS: 'oauth.view.stats',

  // 通用配置
  CONFIG_VIEW_GENERAL: 'config.view.general',
  CONFIG_MANAGE_GENERAL: 'config.manage.general',
  CONFIG_MANAGE_INTEGRATIONS: 'config.manage.integrations',

  // 公司 / 工商系统
  COMPANY_VIEW_ADMIN: 'company.admin.view',
  COMPANY_MANAGE_ADMIN: 'company.admin.manage',
  COMPANY_MANAGE_CONFIG: 'company.admin.config',

  // 流程定义管理
  WORKFLOW_VIEW_DEFINITIONS: 'workflow.view.definitions',
  WORKFLOW_MANAGE_DEFINITIONS: 'workflow.manage.definitions',

  // 兼容旧权限常量（方便引用）
  LEGACY_AUTH_MANAGE_USERS: 'auth.manage.users',
  LEGACY_AUTH_MANAGE_ROLES: 'auth.manage.roles',
  LEGACY_AUTH_MANAGE_OAUTH: 'auth.manage.oauth',
  LEGACY_ASSETS_MANAGE_ATTACHMENTS: 'assets.manage.attachments',
  LEGACY_CONFIG_MANAGE: 'config.manage',
  LEGACY_PORTAL_MANAGE_HOME: 'portal.manage.home',
  LEGACY_MINECRAFT_MANAGE_SERVERS: 'minecraft.manage.servers',
} as const;

const DEFAULT_PERMISSION_KEYS = Object.values(DEFAULT_PERMISSIONS);

const GRANULAR_PERMISSION_KEYS: string[] = [
  PERMISSIONS.PORTAL_VIEW_ADMIN_DASHBOARD,
  PERMISSIONS.PORTAL_VIEW_ADMIN_STATS,
  PERMISSIONS.AUTH_VIEW_USERS,
  PERMISSIONS.AUTH_MANAGE_USERS,
  PERMISSIONS.AUTH_ADMIN_USER_SECURITY,
  PERMISSIONS.AUTH_MANAGE_USER_PERMISSIONS,
  PERMISSIONS.AUTH_VIEW_PLAYERS,
  PERMISSIONS.AUTH_MANAGE_PLAYERS,
  PERMISSIONS.AUTH_VIEW_RBAC,
  PERMISSIONS.AUTH_MANAGE_ROLES,
  PERMISSIONS.AUTH_MANAGE_PERMISSIONS,
  PERMISSIONS.AUTH_MANAGE_PERMISSION_LABELS,
  PERMISSIONS.AUTH_ADMIN_SELF_PERMISSIONS,
  PERMISSIONS.ASSETS_VIEW_ATTACHMENTS,
  PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS,
  PERMISSIONS.ASSETS_ADMIN_ATTACHMENTS_PUBLIC,
  PERMISSIONS.CONFIG_VIEW_AUTHME,
  PERMISSIONS.CONFIG_MANAGE_AUTHME,
  PERMISSIONS.CONFIG_VIEW_LUCKPERMS,
  PERMISSIONS.CONFIG_MANAGE_LUCKPERMS,
  PERMISSIONS.CONFIG_VIEW_EXTERNAL_SYNC,
  PERMISSIONS.CONFIG_MANAGE_EXTERNAL_SYNC,
  PERMISSIONS.MINECRAFT_VIEW_SERVERS,
  PERMISSIONS.MINECRAFT_MANAGE_SERVERS,
  PERMISSIONS.MINECRAFT_MANAGE_MCSM_CONTROL,
  PERMISSIONS.BEACON_VIEW_STATUS,
  PERMISSIONS.BEACON_VIEW_LOGS,
  PERMISSIONS.BEACON_MANAGE_CONNECTION,
  PERMISSIONS.BEACON_ADMIN_FORCE_UPDATE,
  PERMISSIONS.CONFIG_VIEW_VERIFICATION,
  PERMISSIONS.CONFIG_MANAGE_VERIFICATION,
  PERMISSIONS.CONFIG_MANAGE_AUTH_POLICY,
  PERMISSIONS.CONFIG_MANAGE_SECURITY,
  PERMISSIONS.PORTAL_VIEW_HOME_CONFIG,
  PERMISSIONS.PORTAL_MANAGE_HOME_CONTENT,
  PERMISSIONS.PORTAL_MANAGE_HOME_VISIBILITY,
  PERMISSIONS.PORTAL_MANAGE_HOME_PUBLISH,
  PERMISSIONS.OAUTH_VIEW_PROVIDERS,
  PERMISSIONS.OAUTH_MANAGE_PROVIDERS,
  PERMISSIONS.OAUTH_VIEW_ACCOUNTS,
  PERMISSIONS.OAUTH_MANAGE_ACCOUNTS,
  PERMISSIONS.OAUTH_VIEW_LOGS,
  PERMISSIONS.OAUTH_VIEW_STATS,
  PERMISSIONS.CONFIG_VIEW_GENERAL,
  PERMISSIONS.CONFIG_MANAGE_GENERAL,
  PERMISSIONS.CONFIG_MANAGE_INTEGRATIONS,
  PERMISSIONS.COMPANY_VIEW_ADMIN,
  PERMISSIONS.COMPANY_MANAGE_ADMIN,
  PERMISSIONS.COMPANY_MANAGE_CONFIG,
  PERMISSIONS.WORKFLOW_VIEW_DEFINITIONS,
  PERMISSIONS.WORKFLOW_MANAGE_DEFINITIONS,
];

const ALL_PERMISSION_KEYS = Array.from(
  new Set<string>([...DEFAULT_PERMISSION_KEYS, ...GRANULAR_PERMISSION_KEYS]),
);

export const DEFAULT_ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  PLAYER: 'player',
};

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }

  async createRole(dto: CreateRoleDto, actorId?: string) {
    const existing = await this.prisma.role.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new BadRequestException('Role key already exists');
    }

    const permissions = await this.resolvePermissions(dto.permissionKeys);

    const role = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description,
          isSystem: dto.isSystem ?? false,
          metadata: this.toJson(dto.metadata),
        },
      });

      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        });
      }

      return role;
    });

    await this.audit({
      action: 'create_role',
      actorId,
      targetType: 'role',
      targetId: role.id,
      payload: { key: role.key, permissionKeys: dto.permissionKeys },
      message: `Role ${role.key} created`,
    });

    return role;
  }

  async updateRole(roleId: string, dto: UpdateRoleDto, actorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name ?? role.name,
        description: dto.description ?? role.description,
        metadata:
          dto.metadata !== undefined
            ? this.toJson(dto.metadata)
            : (role.metadata ?? Prisma.JsonNull),
      },
    });

    await this.audit({
      action: 'update_role',
      actorId,
      targetType: 'role',
      targetId: roleId,
      payload: dto as unknown as Record<string, unknown>,
      message: `Role ${role.key} updated`,
    });

    return updated;
  }

  async updateRolePermissions(
    roleId: string,
    dto: UpdateRolePermissionsDto,
    actorId?: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const permissions = await this.resolvePermissions(dto.permissionKeys);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
      });
    });

    const updated = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    await this.audit({
      action: 'update_role_permissions',
      actorId,
      targetType: 'role',
      targetId: roleId,
      payload: { permissionKeys: dto.permissionKeys },
      message: `Role ${role.key} permissions updated`,
    });

    return updated;
  }

  async deleteRole(roleId: string, actorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('System role cannot be deleted');
    }

    const usage = await this.prisma.userRole.count({ where: { roleId } });
    if (usage > 0) {
      throw new BadRequestException(
        'Role is assigned to users and cannot be deleted',
      );
    }

    await this.prisma.role.delete({ where: { id: roleId } });

    await this.audit({
      action: 'delete_role',
      actorId,
      targetType: 'role',
      targetId: roleId,
      payload: { key: role.key },
      message: `Role ${role.key} deleted`,
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  async createPermission(dto: CreatePermissionDto, actorId?: string) {
    const existing = await this.prisma.permission.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new BadRequestException('Permission key already exists');
    }

    const permission = await this.prisma.permission.create({
      data: {
        key: dto.key,
        description: dto.description,
        metadata: this.toJson(dto.metadata),
      },
    });

    await this.audit({
      action: 'create_permission',
      actorId,
      targetType: 'permission',
      targetId: permission.id,
      payload: dto as unknown as Record<string, unknown>,
      message: `Permission ${permission.key} created`,
    });

    return permission;
  }

  async updatePermission(
    permissionId: string,
    dto: UpdatePermissionDto,
    actorId?: string,
  ) {
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const updated = await this.prisma.permission.update({
      where: { id: permissionId },
      data: {
        description: dto.description ?? permission.description,
        metadata:
          dto.metadata !== undefined
            ? this.toJson(dto.metadata)
            : (permission.metadata ?? Prisma.JsonNull),
      },
    });

    await this.audit({
      action: 'update_permission',
      actorId,
      targetType: 'permission',
      targetId: permissionId,
      payload: dto as unknown as Record<string, unknown>,
      message: `Permission ${permission.key} updated`,
    });

    return updated;
  }

  async deletePermission(permissionId: string, actorId?: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const usage = await this.prisma.rolePermission.count({
      where: { permissionId },
    });
    if (usage > 0) {
      throw new BadRequestException(
        'Permission is assigned to roles and cannot be deleted',
      );
    }

    await this.prisma.permission.delete({ where: { id: permissionId } });

    await this.audit({
      action: 'delete_permission',
      actorId,
      targetType: 'permission',
      targetId: permissionId,
      payload: { key: permission.key },
      message: `Permission ${permission.key} deleted`,
    });
  }

  async ensureDefaultRolesAndPermissions() {
    await this.prisma.$transaction(async (tx) => {
      const permissionEntries = await tx.permission.findMany({
        where: { key: { in: ALL_PERMISSION_KEYS } },
      });
      const existingKeys = new Set(permissionEntries.map((p) => p.key));
      const missingPermissions = ALL_PERMISSION_KEYS.filter(
        (key) => !permissionEntries.find((p) => p.key === key),
      );
      if (missingPermissions.length > 0) {
        await tx.permission.createMany({
          data: missingPermissions.map((key) => ({ key })),
          skipDuplicates: true,
        });
      }

      const roleEntries = await tx.role.findMany({
        where: { key: { in: Object.values(DEFAULT_ROLES) } },
      });

      const permissions = await tx.permission.findMany({
        where: { key: { in: ALL_PERMISSION_KEYS } },
      });
      const permissionMap = new Map(
        permissions.map((permission) => [permission.key, permission]),
      );
      type PermissionEntity = (typeof permissions)[number];

      const ensureRole = async (
        roleKey: string,
        roleData: { name: string; isSystem: boolean },
        requiredPermissionKeys: string[],
      ) => {
        let role = roleEntries.find((entry) => entry.key === roleKey);
        if (!role) {
          role = await tx.role.create({
            data: {
              key: roleKey,
              ...roleData,
            },
          });
          roleEntries.push(role);
        }

        if (requiredPermissionKeys.length === 0) {
          return;
        }

        const existingPermissions = await tx.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionId: true },
        });
        const existingPermissionIds = new Set(
          existingPermissions.map((entry) => entry.permissionId),
        );

        const toAssign = requiredPermissionKeys
          .map((key) => permissionMap.get(key))
          .filter((permission): permission is PermissionEntity => {
            if (!permission) {
              return false;
            }
            return !existingPermissionIds.has(permission.id);
          })
          .map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          }));

        if (toAssign.length > 0) {
          await tx.rolePermission.createMany({
            data: toAssign,
            skipDuplicates: true,
          });
        }
      };

      await ensureRole(
        DEFAULT_ROLES.ADMIN,
        { name: 'Administrator', isSystem: true },
        ALL_PERMISSION_KEYS,
      );

      await ensureRole(
        DEFAULT_ROLES.MODERATOR,
        { name: 'Moderator', isSystem: true },
        [
          DEFAULT_PERMISSIONS.MANAGE_USERS,
          DEFAULT_PERMISSIONS.MANAGE_CONTACT_CHANNELS,
        ],
      );

      await ensureRole(
        DEFAULT_ROLES.PLAYER,
        { name: 'Player', isSystem: true },
        [],
      );
    });
  }

  async listPermissionLabels() {
    return this.prisma.permissionLabel.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async createPermissionLabel(dto: CreatePermissionLabelDto, actorId?: string) {
    const existing = await this.prisma.permissionLabel.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new BadRequestException('Label key already exists');
    }
    const permissions = await this.resolvePermissions(dto.permissionKeys ?? []);
    const label = await this.prisma.permissionLabel.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        color: dto.color,
        metadata: this.toJson(dto.metadata),
      },
    });
    if (permissions.length > 0) {
      await this.prisma.permissionLabelPermission.createMany({
        data: permissions.map((permission) => ({
          labelId: label.id,
          permissionId: permission.id,
        })),
      });
    }
    const result = await this.prisma.permissionLabel.findUnique({
      where: { id: label.id },
      include: {
        permissions: { include: { permission: true } },
      },
    });
    await this.audit({
      action: 'create_permission_label',
      actorId,
      targetType: 'permission_label',
      targetId: label.id,
      payload: dto as unknown as Record<string, unknown>,
      message: `Permission label ${label.key} created`,
    });
    return result;
  }

  async updatePermissionLabel(
    labelId: string,
    dto: UpdatePermissionLabelDto,
    actorId?: string,
  ) {
    const label = await this.prisma.permissionLabel.findUnique({
      where: { id: labelId },
    });
    if (!label) {
      throw new NotFoundException('Permission label not found');
    }
    const permissions = await this.resolvePermissions(dto.permissionKeys ?? []);
    await this.prisma.$transaction(async (tx) => {
      await tx.permissionLabel.update({
        where: { id: labelId },
        data: {
          name: dto.name ?? label.name,
          description: dto.description ?? label.description,
          color: dto.color ?? label.color,
          metadata:
            dto.metadata !== undefined
              ? this.toJson(dto.metadata)
              : (label.metadata ?? Prisma.JsonNull),
        },
      });
      if (dto.permissionKeys) {
        await tx.permissionLabelPermission.deleteMany({ where: { labelId } });
        if (permissions.length > 0) {
          await tx.permissionLabelPermission.createMany({
            data: permissions.map((permission) => ({
              labelId,
              permissionId: permission.id,
            })),
          });
        }
      }
    });
    const updated = await this.prisma.permissionLabel.findUnique({
      where: { id: labelId },
      include: {
        permissions: { include: { permission: true } },
      },
    });
    await this.audit({
      action: 'update_permission_label',
      actorId,
      targetType: 'permission_label',
      targetId: labelId,
      payload: dto as Record<string, unknown>,
      message: `Permission label ${label.key} updated`,
    });
    return updated;
  }

  async deletePermissionLabel(labelId: string, actorId?: string) {
    const label = await this.prisma.permissionLabel.findUnique({
      where: { id: labelId },
    });
    if (!label) {
      throw new NotFoundException('Permission label not found');
    }
    const usage = await this.prisma.userPermissionLabel.count({
      where: { labelId },
    });
    if (usage > 0) {
      throw new BadRequestException('Label already assigned to users');
    }
    await this.prisma.permissionLabelPermission.deleteMany({
      where: { labelId },
    });
    await this.prisma.permissionLabel.delete({ where: { id: labelId } });
    await this.audit({
      action: 'delete_permission_label',
      actorId,
      targetType: 'permission_label',
      targetId: labelId,
      payload: { key: label.key },
      message: `Permission label ${label.key} deleted`,
    });
    return { success: true } as const;
  }

  async listPermissionCatalog() {
    const [permissions, labels] = await Promise.all([
      this.prisma.permission.findMany({
        orderBy: { key: 'asc' },
        include: {
          rolePermissions: {
            include: { role: true },
          },
        },
      }),
      this.prisma.permissionLabel.findMany({
        include: {
          permissions: true,
        },
      }),
    ]);
    return permissions.map((permission) => {
      const labelEntries = labels.filter((label) =>
        label.permissions.some((entry) => entry.permissionId === permission.id),
      );
      return {
        id: permission.id,
        key: permission.key,
        description: permission.description,
        metadata: permission.metadata ?? Prisma.JsonNull,
        roles: permission.rolePermissions.map((link) => ({
          id: link.role.id,
          key: link.role.key,
          name: link.role.name,
        })),
        labels: labelEntries.map((label) => ({
          id: label.id,
          key: label.key,
          name: label.name,
          color: label.color,
        })),
      };
    });
  }

  async selfAssignPermissions(
    userId: string,
    permissionKeys: string[],
    actorId?: string,
  ) {
    const permissions = await this.resolvePermissions(permissionKeys);
    if (permissions.length === 0) {
      return { success: true } as const;
    }
    const labelKey = `self-${userId}`;
    let label = await this.prisma.permissionLabel.findUnique({
      where: { key: labelKey },
    });
    if (!label) {
      label = await this.prisma.permissionLabel.create({
        data: {
          key: labelKey,
          name: `自助权限-${userId.slice(0, 6)}`,
          description: '管理员自助权限集合',
          metadata: this.toJson({ selfManaged: true }),
        },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.permissionLabelPermission.findMany({
        where: { labelId: label.id },
      });
      const existingIds = new Set(existing.map((entry) => entry.permissionId));
      const toAdd = permissions.filter(
        (permission) => !existingIds.has(permission.id),
      );
      if (toAdd.length > 0) {
        await tx.permissionLabelPermission.createMany({
          data: toAdd.map((permission) => ({
            labelId: label.id,
            permissionId: permission.id,
          })),
        });
      }
      const assigned = await tx.userPermissionLabel.findFirst({
        where: { userId, labelId: label.id },
      });
      if (!assigned) {
        await tx.userPermissionLabel.create({
          data: {
            userId,
            labelId: label.id,
            assignedById: userId,
          },
        });
      }
    });
    const labelRecord = await this.prisma.permissionLabel.findUnique({
      where: { id: label.id },
      include: {
        permissions: { include: { permission: true } },
      },
    });
    await this.audit({
      action: 'self_assign_permissions',
      actorId: actorId ?? userId,
      targetType: 'permission_label',
      targetId: label.id,
      payload: { permissionKeys },
      message: `User ${userId} self-assigned permissions`,
    });
    return labelRecord;
  }

  private async resolvePermissions(keys: string[]) {
    if (!keys || keys.length === 0) {
      return [];
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    if (permissions.length !== keys.length) {
      const missing = keys.filter(
        (key) => !permissions.find((p) => p.key === key),
      );
      throw new NotFoundException(
        `Permissions not found: ${missing.join(', ')}`,
      );
    }
    return permissions;
  }

  private toJson(
    input?: Record<string, unknown> | null,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (input === undefined) {
      return undefined;
    }
    if (input === null) {
      return Prisma.JsonNull;
    }
    return input as Prisma.InputJsonValue;
  }

  private async audit(params: {
    action: string;
    actorId?: string;
    targetType: string;
    targetId?: string | null;
    payload?: Record<string, unknown>;
    message?: string;
  }) {
    rbacOperationCounter.inc({ action: params.action });
    if (params.message) {
      this.logger.log(params.message);
    }
    await this.adminAuditService.record({
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      payload: params.payload,
    });
  }
}
