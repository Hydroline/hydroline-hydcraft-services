import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

export const DEFAULT_PERMISSIONS = {
  MANAGE_USERS: 'auth.manage.users',
  MANAGE_CONTACT_CHANNELS: 'auth.manage.contact-channels',
  MANAGE_ROLES: 'auth.manage.roles',
};

export const DEFAULT_ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  PLAYER: 'player',
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createRole(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException('Role key already exists');
    }

    const permissions = await this.resolvePermissions(dto.permissionKeys);

    return this.prisma.$transaction(async (tx) => {
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
  }

  async updateRole(roleId: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name ?? role.name,
        description: dto.description ?? role.description,
        metadata:
          dto.metadata !== undefined
            ? this.toJson(dto.metadata)
            : (role.metadata as Prisma.InputJsonValue | undefined),
      },
    });
  }

  async updateRolePermissions(roleId: string, dto: UpdateRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const permissions = await this.resolvePermissions(dto.permissionKeys);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
      });
    });

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }

  async deleteRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('System role cannot be deleted');
    }

    const usage = await this.prisma.userRole.count({ where: { roleId } });
    if (usage > 0) {
      throw new BadRequestException('Role is assigned to users and cannot be deleted');
    }

    await this.prisma.role.delete({ where: { id: roleId } });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  async createPermission(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException('Permission key already exists');
    }

    return this.prisma.permission.create({
      data: {
        key: dto.key,
        description: dto.description,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async updatePermission(permissionId: string, dto: UpdatePermissionDto) {
    const permission = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return this.prisma.permission.update({
      where: { id: permissionId },
      data: {
        description: dto.description ?? permission.description,
        metadata:
          dto.metadata !== undefined
            ? this.toJson(dto.metadata)
            : (permission.metadata as Prisma.InputJsonValue | undefined),
      },
    });
  }

  async deletePermission(permissionId: string) {
    const permission = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const usage = await this.prisma.rolePermission.count({ where: { permissionId } });
    if (usage > 0) {
      throw new BadRequestException('Permission is assigned to roles and cannot be deleted');
    }

    await this.prisma.permission.delete({ where: { id: permissionId } });
  }

  async ensureDefaultRolesAndPermissions() {
    await this.prisma.$transaction(async (tx) => {
      const permissionEntries = await tx.permission.findMany({
        where: { key: { in: Object.values(DEFAULT_PERMISSIONS) } },
      });
      const missingPermissions = Object.values(DEFAULT_PERMISSIONS).filter(
        (key) => !permissionEntries.find((p) => p.key === key),
      );
      if (missingPermissions.length > 0) {
        await tx.permission.createMany({
          data: missingPermissions.map((key) => ({ key })),
        });
      }

      const roleEntries = await tx.role.findMany({
        where: { key: { in: Object.values(DEFAULT_ROLES) } },
      });

      if (!roleEntries.find((role) => role.key === DEFAULT_ROLES.ADMIN)) {
        const permissions = await tx.permission.findMany({
          where: { key: { in: Object.values(DEFAULT_PERMISSIONS) } },
        });
        const adminRole = await tx.role.create({
          data: {
            key: DEFAULT_ROLES.ADMIN,
            name: 'Administrator',
            isSystem: true,
          },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })),
        });
      }

      if (!roleEntries.find((role) => role.key === DEFAULT_ROLES.MODERATOR)) {
        const moderatorRole = await tx.role.create({
          data: {
            key: DEFAULT_ROLES.MODERATOR,
            name: 'Moderator',
            isSystem: true,
          },
        });
        const permissions = await tx.permission.findMany({
          where: {
            key: {
              in: [DEFAULT_PERMISSIONS.MANAGE_USERS, DEFAULT_PERMISSIONS.MANAGE_CONTACT_CHANNELS],
            },
          },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: moderatorRole.id, permissionId: permission.id })),
        });
      }

      if (!roleEntries.find((role) => role.key === DEFAULT_ROLES.PLAYER)) {
        await tx.role.create({
          data: {
            key: DEFAULT_ROLES.PLAYER,
            name: 'Player',
            isSystem: true,
          },
        });
      }
    });
  }

  private async resolvePermissions(keys: string[]) {
    if (!keys || keys.length === 0) {
      return [];
    }

    const permissions = await this.prisma.permission.findMany({ where: { key: { in: keys } } });
    if (permissions.length !== keys.length) {
      const missing = keys.filter((key) => !permissions.find((p) => p.key === key));
      throw new NotFoundException(`Permissions not found: ${missing.join(', ')}`);
    }
    return permissions;
  }

  private toJson(input?: Record<string, unknown>) {
    return input as Prisma.InputJsonValue | undefined;
  }
}
