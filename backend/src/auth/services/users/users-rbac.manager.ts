import { NotFoundException } from '@nestjs/common';
import { UsersServiceContext } from './users.context';
import { ensureUser, getUserDetail } from './users-core.manager';
import { AssignPermissionLabelsDto } from '../../dto/assign-permission-labels.dto';

export async function assignRoles(
  ctx: UsersServiceContext,
  userId: string,
  roleKeys: string[],
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const roles = await ctx.prisma.role.findMany({
    where: { key: { in: roleKeys } },
  });
  if (roles.length !== roleKeys.length) {
    const missing = roleKeys.filter((key) => !roles.find((r) => r.key === key));
    throw new NotFoundException(`Roles not found: ${missing.join(', ')}`);
  }

  await ctx.prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.createMany({
      data: roles.map((role) => ({
        userId,
        roleId: role.id,
        assignedById: actorId,
      })),
    });
  });

  await ctx.adminAuditService.record({
    actorId,
    action: 'assign_roles',
    targetType: 'user',
    targetId: userId,
    payload: { roleKeys },
  });

  return getUserDetail(ctx, userId);
}

export async function assignPermissionLabels(
  ctx: UsersServiceContext,
  userId: string,
  dto: AssignPermissionLabelsDto,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const labelKeys = dto.labelKeys ?? [];
  const labels = await ctx.prisma.permissionLabel.findMany({
    where: labelKeys.length ? { key: { in: labelKeys } } : undefined,
  });
  if (labelKeys.length && labels.length !== labelKeys.length) {
    const missing = labelKeys.filter(
      (key) => !labels.find((label) => label.key === key),
    );
    throw new NotFoundException(
      `Permission labels not found: ${missing.join(', ')}`,
    );
  }

  await ctx.prisma.$transaction(async (tx) => {
    await tx.userPermissionLabel.deleteMany({ where: { userId } });
    if (labels.length > 0) {
      await tx.userPermissionLabel.createMany({
        data: labels.map((label) => ({
          userId,
          labelId: label.id,
          assignedById: actorId,
        })),
      });
    }
  });

  await ctx.adminAuditService.record({
    actorId,
    action: 'assign_permission_labels',
    targetType: 'user',
    targetId: userId,
    payload: { labelKeys },
  });

  return getUserDetail(ctx, userId);
}
