import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentVisibilityMode,
  Prisma,
  TransportationRailwayMod,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttachmentsService } from '../../../attachments/attachments.service';
import type { UploadedStreamFile } from '../../../attachments/attachments.service';
import {
  RailwaySystemCreateDto,
  RailwaySystemListQueryDto,
  RailwaySystemRouteInputDto,
  RailwaySystemUpdateDto,
} from '../../dto/railway-system.dto';
import { buildDimensionContextFromDimension } from '../utils/railway-normalizer';
import { TransportationRailwayRouteDetailService } from '../route-detail/railway-route-detail.service';
import { TransportationRailwayCompanyBindingService } from './railway-company-binding.service';
import { MinecraftServerService } from '../../../minecraft/minecraft-server.service';
import { PERMISSIONS } from '../../../auth/services/roles.service';

export type RailwaySystemRouteSummary = {
  entityId: string;
  name: string | null;
  color: number | null;
  transportMode: string | null;
  previewSvg?: string | null;
  dimension: string | null;
  dimensionContext: string | null;
  server: { id: string; name: string; dynmapTileUrl?: string | null };
  railwayType: TransportationRailwayMod;
};

@Injectable()
export class TransportationRailwaySystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentsService: AttachmentsService,
    private readonly routeDetailService: TransportationRailwayRouteDetailService,
    private readonly bindingService: TransportationRailwayCompanyBindingService,
    private readonly minecraftServerService: MinecraftServerService,
  ) {}

  async listBeaconServers() {
    const servers = await this.minecraftServerService.listServers();
    return servers
      .filter((s) => s.beaconEnabled)
      .map((s) => ({
        id: s.id,
        name: s.displayName,
        code: s.internalCodeCn,
      }));
  }

  async listSystems(query: RailwaySystemListQueryDto, user?: any) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 5), 50);
    const andFilters: Prisma.TransportationRailwaySystemWhereInput[] = [];
    const where: Prisma.TransportationRailwaySystemWhereInput = {
      ...(query.serverId ? { serverId: query.serverId } : {}),
      AND: andFilters,
    };
    if (query.dimension) {
      andFilters.push({
        OR: [
          {
            dimensionContext: {
              contains: `:${query.dimension}`,
              mode: 'insensitive',
            },
          },
          { dimensionContext: query.dimension },
        ],
      });
    }
    if (query.search) {
      andFilters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          {
            englishName: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.transportationRailwaySystem.count({ where }),
      this.prisma.transportationRailwaySystem.findMany({
        where,
        include: {
          _count: { select: { routes: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const canManageAll = this.hasPermission(
      user,
      PERMISSIONS.TRANSPORTATION_RAILWAY_SYSTEM_MANAGE,
    );

    const logoUrlMap = await this.attachmentsService.resolvePublicUrlsByIds(
      items.map((item) => item.logoAttachmentId),
    );

    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map((item) => {
        const isOwner = user && item.createdById === user.id;
        const canEdit = isOwner || canManageAll;
        const canDelete = isOwner || canManageAll;

        return {
          id: item.id,
          name: item.name,
          englishName: item.englishName ?? null,
          logoAttachmentId: item.logoAttachmentId ?? null,
          logoUrl: item.logoAttachmentId
            ? (logoUrlMap.get(item.logoAttachmentId) ?? null)
            : null,
          serverId: item.serverId,
          dimensionContext: item.dimensionContext ?? null,
          routeCount: item._count.routes,
          updatedAt: item.updatedAt,
          canEdit: !!canEdit,
          canDelete: !!canDelete,
        };
      }),
    };
  }

  async getSystemDetail(id: string, user?: any) {
    const system = await this.prisma.transportationRailwaySystem.findUnique({
      where: { id },
      include: {
        routes: {
          include: { route: true },
        },
      },
    });
    if (!system) {
      throw new NotFoundException('Railway system not found');
    }

    const canManage = this.hasPermission(
      user,
      PERMISSIONS.TRANSPORTATION_RAILWAY_SYSTEM_MANAGE,
    );
    const isOwner = user && system.createdById === user.id;

    const serverNameMap = await this.resolveServerNameMap([system.serverId]);

    const routes = system.routes
      .map((item) => this.normalizeRoute(item.route, serverNameMap))
      .filter((route): route is RailwaySystemRouteSummary => Boolean(route));

    const logoUrl = await this.attachmentsService.resolvePublicUrl(
      system.logoAttachmentId ?? null,
    );

    const bindings = await this.bindingService.getBindings({
      entityType: 'SYSTEM',
      entityId: system.id,
      serverId: system.serverId,
      railwayType: routes[0]?.railwayType ?? null,
      dimension: this.extractDimensionFromContext(system.dimensionContext),
    });

    const routeDetails = await Promise.all(
      routes.map(async (route) => {
        try {
          return await this.routeDetailService.getRouteDetail(
            route.entityId,
            route.railwayType,
            {
              serverId: route.server.id,
              dimension: route.dimension ?? undefined,
            },
          );
        } catch (error) {
          return null;
        }
      }),
    );

    return {
      id: system.id,
      name: system.name,
      englishName: system.englishName ?? null,
      logoAttachmentId: system.logoAttachmentId ?? null,
      logoUrl,
      serverId: system.serverId,
      server: {
        id: system.serverId,
        name: serverNameMap.get(system.serverId)?.name ?? system.serverId,
        dynmapTileUrl:
          serverNameMap.get(system.serverId)?.dynmapTileUrl ?? null,
      },
      dimensionContext: system.dimensionContext ?? null,
      routes,
      routeDetails: routeDetails.filter((item) => item !== null),
      bindings,
      updatedAt: system.updatedAt,
      canEdit: isOwner || canManage,
      canDelete: isOwner || canManage,
    };
  }

  async createSystem(user: any, dto: RailwaySystemCreateDto) {
    if (
      !this.hasPermission(
        user,
        PERMISSIONS.TRANSPORTATION_RAILWAY_SYSTEM_CREATE,
      )
    ) {
      throw new ForbiddenException(
        'Insufficient permissions to create railway system',
      );
    }

    if (!dto.routes?.length) {
      throw new BadRequestException('Railway system must include routes');
    }

    if (dto.logoAttachmentId) {
      await this.ensureAttachmentPublic(dto.logoAttachmentId);
    }

    const { serverId, dimensionContext, routeRecords } =
      await this.resolveRouteRecords(dto.routes);

    const system = await this.prisma.transportationRailwaySystem.create({
      data: {
        name: dto.name,
        englishName: dto.englishName ?? null,
        logoAttachmentId: dto.logoAttachmentId ?? null,
        serverId,
        dimensionContext,
        createdById: user.id,
        updatedById: user.id,
        routes: {
          createMany: {
            data: routeRecords.map((record) => ({ routeId: record.id })),
          },
        },
      },
      include: {
        routes: { include: { route: true } },
      },
    });

    await this.createLog(system.id, user.id, 'CREATE');

    const serverNameMap = await this.resolveServerNameMap([serverId]);
    const routes = system.routes
      .map((item) => this.normalizeRoute(item.route, serverNameMap))
      .filter((route): route is RailwaySystemRouteSummary => Boolean(route));

    const logoUrl = await this.attachmentsService.resolvePublicUrl(
      system.logoAttachmentId ?? null,
    );

    return {
      id: system.id,
      name: system.name,
      englishName: system.englishName ?? null,
      logoAttachmentId: system.logoAttachmentId ?? null,
      logoUrl,
      serverId: system.serverId,
      dimensionContext: system.dimensionContext ?? null,
      routes,
      updatedAt: system.updatedAt,
      canEdit: true,
      canDelete: true,
    };
  }

  async updateSystem(user: any, id: string, dto: RailwaySystemUpdateDto) {
    const system = await this.prisma.transportationRailwaySystem.findUnique({
      where: { id },
      include: { routes: true },
    });
    if (!system) {
      throw new NotFoundException('Railway system not found');
    }

    const isOwner = system.createdById === user.id;
    const canManage = this.hasPermission(
      user,
      PERMISSIONS.TRANSPORTATION_RAILWAY_SYSTEM_MANAGE,
    );

    if (!isOwner && !canManage) {
      throw new ForbiddenException(
        'Insufficient permissions to update this railway system',
      );
    }

    if (dto.logoAttachmentId) {
      await this.ensureAttachmentPublic(dto.logoAttachmentId);
    }

    let routeRecords = system.routes.map((entry) => ({ id: entry.routeId }));
    if (dto.routes) {
      if (!dto.routes.length) {
        throw new BadRequestException('Railway system must include routes');
      }
      const resolved = await this.resolveRouteRecords(dto.routes);
      const resolvedDimension = this.extractDimensionFromContext(
        resolved.dimensionContext,
      );
      const currentDimension = this.extractDimensionFromContext(
        system.dimensionContext,
      );
      if (
        resolved.serverId !== system.serverId ||
        resolvedDimension !== currentDimension
      ) {
        throw new BadRequestException(
          'Railway system routes must stay within the same server and dimension',
        );
      }
      routeRecords = resolved.routeRecords.map((record) => ({ id: record.id }));
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSystem = await tx.transportationRailwaySystem.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          englishName: dto.englishName ?? undefined,
          logoAttachmentId:
            dto.logoAttachmentId === undefined
              ? undefined
              : dto.logoAttachmentId,
          updatedById: user.id,
        },
      });

      if (dto.routes) {
        await tx.transportationRailwaySystemRoute.deleteMany({
          where: { systemId: id },
        });
        await tx.transportationRailwaySystemRoute.createMany({
          data: routeRecords.map((record) => ({
            systemId: id,
            routeId: record.id,
          })),
        });
      }

      return updatedSystem;
    });

    await this.createLog(id, user.id, 'EDIT');

    const detail = await this.getSystemDetail(updated.id);
    return detail;
  }

  async updateSystemLogoStream(
    user: any,
    id: string,
    file: UploadedStreamFile,
  ) {
    const system = await this.prisma.transportationRailwaySystem.findUnique({
      where: { id },
    });
    if (!system) {
      throw new NotFoundException('Railway system not found');
    }

    const isOwner = system.createdById === user.id;
    const canManage = this.hasPermission(
      user,
      PERMISSIONS.TRANSPORTATION_RAILWAY_SYSTEM_MANAGE,
    );

    if (!isOwner && !canManage) {
      throw new ForbiddenException(
        'Insufficient permissions to update this railway system logo',
      );
    }

    const folderName = '铁路线路系统';
    let folder = await this.prisma.attachmentFolder.findFirst({
      where: {
        name: folderName,
        parentId: null,
      },
    });

    if (!folder) {
      folder = await this.attachmentsService.createFolder(user.id, {
        name: folderName,
        description: '铁路线路系统相关图片',
        visibilityMode: 'public',
      });
    }

    const attachment = await this.attachmentsService.uploadAttachmentStream(
      user.id,
      file,
      {
        name: `${system.name}-logo`,
        isPublic: true,
        folderId: folder.id,
        metadata: {
          scope: 'railway-system-logo',
          systemId: id,
        },
      },
    );

    const updated = await this.prisma.transportationRailwaySystem.update({
      where: { id },
      data: {
        logoAttachmentId: attachment.id,
        updatedById: user.id,
      },
    });

    await this.createLog(id, user.id, 'EDIT');

    if (system.logoAttachmentId && system.logoAttachmentId !== attachment.id) {
      try {
        await this.attachmentsService.deleteAttachment(system.logoAttachmentId);
      } catch {
        // ignore cleanup failure
      }
    }

    return {
      id: updated.id,
      logoAttachmentId: updated.logoAttachmentId ?? null,
      logoUrl: await this.attachmentsService.resolvePublicUrl(
        updated.logoAttachmentId ?? null,
      ),
    };
  }

  async deleteSystem(user: any, id: string) {
    const system = await this.prisma.transportationRailwaySystem.findUnique({
      where: { id },
    });
    if (!system) {
      throw new NotFoundException('Railway system not found');
    }

    const isOwner = system.createdById === user.id;
    const canManage = this.hasPermission(
      user,
      PERMISSIONS.TRANSPORTATION_RAILWAY_SYSTEM_MANAGE,
    );

    if (!isOwner && !canManage) {
      throw new ForbiddenException(
        'Insufficient permissions to delete this railway system',
      );
    }

    // Record log before deletion
    await this.createLog(id, user.id, 'DELETE');

    await this.prisma.transportationRailwaySystem.delete({
      where: { id },
    });
  }

  private async resolveRouteRecords(routes: RailwaySystemRouteInputDto[]) {
    const resolved = [] as Array<{
      id: string;
      serverId: string;
      railwayMod: TransportationRailwayMod;
      dimensionContext: string | null;
      name: string | null;
    }>;

    for (const route of routes) {
      const dimensionContext = route.dimension
        ? buildDimensionContextFromDimension(route.dimension, route.railwayType)
        : null;
      const record = await this.prisma.transportationRailwayRoute.findFirst({
        where: {
          serverId: route.serverId,
          railwayMod: route.railwayType,
          entityId: route.entityId,
          ...(dimensionContext ? { dimensionContext } : {}),
        },
        select: {
          id: true,
          serverId: true,
          railwayMod: true,
          dimensionContext: true,
          name: true,
        },
      });
      if (!record) {
        throw new NotFoundException('Route not found');
      }
      resolved.push({
        id: record.id,
        serverId: record.serverId,
        railwayMod: record.railwayMod,
        dimensionContext: record.dimensionContext ?? null,
        name: record.name ?? null,
      });
    }

    const serverIds = Array.from(
      new Set(resolved.map((item) => item.serverId)),
    );
    if (serverIds.length !== 1) {
      throw new BadRequestException('Routes must be in the same server');
    }

    const dimensionList = Array.from(
      new Set(
        resolved.map((item) => {
          const context = item.dimensionContext ?? '';
          const parts = context.split(':');
          return parts.length > 1 ? parts[1] : context;
        }),
      ),
    );
    if (dimensionList.length !== 1) {
      throw new BadRequestException('Routes must be in the same dimension');
    }

    return {
      serverId: serverIds[0],
      dimensionContext: resolved[0].dimensionContext ?? null,
      routeRecords: resolved,
    };
  }

  private async ensureAttachmentPublic(attachmentId: string) {
    const attachment =
      await this.attachmentsService.getAttachmentOrThrow(attachmentId);
    if (!attachment.isPublic) {
      throw new BadRequestException('Attachment must be public');
    }
    if (attachment.visibilityMode === AttachmentVisibilityMode.RESTRICTED) {
      throw new ForbiddenException('Attachment is not accessible');
    }
  }

  private async resolveServerNameMap(serverIds: string[]) {
    if (!serverIds.length)
      return new Map<string, { name: string; dynmapTileUrl: string | null }>();
    const rows = await this.prisma.minecraftServer.findMany({
      where: { id: { in: serverIds } },
      select: { id: true, displayName: true, dynmapTileUrl: true },
    });
    return new Map(
      rows.map(
        (row) =>
          [
            row.id,
            { name: row.displayName, dynmapTileUrl: row.dynmapTileUrl },
          ] as const,
      ),
    );
  }

  private normalizeRoute(
    route: {
      entityId: string;
      name: string | null;
      color: number | null;
      transportMode: string | null;
      payload: Prisma.JsonValue;
      dimensionContext: string | null;
      filePath: string | null;
      serverId: string;
      railwayMod: TransportationRailwayMod;
      lastBeaconUpdatedAt: Date | null;
      updatedAt: Date;
    },
    serverNameMap: Map<string, { name: string; dynmapTileUrl: string | null }>,
  ): RailwaySystemRouteSummary | null {
    if (!route?.entityId) return null;
    const payload =
      typeof route.payload === 'object' && route.payload
        ? (route.payload as Record<string, unknown>)
        : null;
    const dimension = route.dimensionContext
      ? (route.dimensionContext.split(':')[1] ?? null)
      : null;
    const previewSvg =
      payload && typeof payload.preview_svg === 'string'
        ? payload.preview_svg
        : null;
    const serverInfo = serverNameMap.get(route.serverId) ?? {
      name: route.serverId,
      dynmapTileUrl: null,
    };
    return {
      entityId: route.entityId,
      name: route.name ?? null,
      color: route.color ?? null,
      transportMode: route.transportMode ?? null,
      previewSvg,
      dimension,
      dimensionContext: route.dimensionContext ?? null,
      server: {
        id: route.serverId,
        name: serverInfo.name,
        dynmapTileUrl: serverInfo.dynmapTileUrl,
      },
      railwayType: route.railwayMod,
    };
  }

  private extractDimensionFromContext(context: string | null | undefined) {
    if (!context) return null;
    const parts = context.split(':');
    return parts.length > 1 ? parts[1] : context;
  }

  private extractBaseKey(name: string | null) {
    if (!name) return null;
    const primary = name.split('||')[0] ?? '';
    const first = primary.split('|')[0] ?? '';
    const trimmed = first.trim().toLowerCase();
    return trimmed || null;
  }

  private hasPermission(user: any, permission: string): boolean {
    if (!user) return false;

    // Admin bypass - 更加鲁棒的判断
    const roles = user.roles || [];
    if (
      roles.some((r: any) => {
        const roleKey = r.role?.key;
        return roleKey === 'admin' || roleKey === 'moderator';
      })
    ) {
      return true;
    }

    const granted = new Set<string>();
    const denied = new Set<string>();

    const applyPermission = (p?: { key?: string | null; metadata?: any }) => {
      const key = p?.key;
      if (!key) return;

      let effect = 'ALLOW';
      if (p?.metadata && typeof p.metadata === 'object') {
        const meta = p.metadata;
        if (meta.effect?.toUpperCase() === 'DENY') {
          effect = 'DENY';
        }
      }

      if (effect === 'DENY') {
        denied.add(key);
        granted.delete(key);
      } else if (!denied.has(key)) {
        granted.add(key);
      }
    };

    for (const roleLink of roles) {
      const permissionLinks = roleLink.role?.rolePermissions ?? [];
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

    return granted.has(permission);
  }

  private async createLog(systemId: string, userId: string, action: string) {
    await this.prisma.transportationRailwaySystemLog.create({
      data: {
        systemId,
        userId,
        action,
      },
    });
  }

  async getSystemLogs(systemId: string, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.transportationRailwaySystemLog.count({
        where: { systemId },
      }),
      this.prisma.transportationRailwaySystemLog.findMany({
        where: { systemId },
        include: {
          user: {
            select: {
              name: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      entries: items.map((item) => ({
        id: item.id,
        timestamp: item.createdAt.toISOString(),
        playerName: item.user.name,
        playerAvatar: item.user.image,
        changeType: item.action,
      })),
    };
  }
}
