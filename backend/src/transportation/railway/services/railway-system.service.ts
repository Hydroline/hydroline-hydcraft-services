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
import type { StoredUploadedFile } from '../../../attachments/uploaded-file.interface';
import { buildPublicUrl } from '../../../lib/shared/url';
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

export type RailwaySystemRouteSummary = {
  entityId: string;
  name: string | null;
  color: number | null;
  transportMode: string | null;
  previewSvg?: string | null;
  dimension: string | null;
  dimensionContext: string | null;
  server: { id: string; name: string };
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

  async listSystems(query: RailwaySystemListQueryDto) {
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

    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        englishName: item.englishName ?? null,
        logoAttachmentId: item.logoAttachmentId ?? null,
        logoUrl: item.logoAttachmentId
          ? buildPublicUrl(`/attachments/public/${item.logoAttachmentId}`)
          : null,
        serverId: item.serverId,
        dimensionContext: item.dimensionContext ?? null,
        routeCount: item._count.routes,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async getSystemDetail(id: string) {
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

    const serverNameMap = await this.resolveServerNameMap([system.serverId]);

    const routes = system.routes
      .map((item) => this.normalizeRoute(item.route, serverNameMap))
      .filter((route): route is RailwaySystemRouteSummary => Boolean(route));

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
      logoUrl: system.logoAttachmentId
        ? buildPublicUrl(`/attachments/public/${system.logoAttachmentId}`)
        : null,
      serverId: system.serverId,
      server: {
        id: system.serverId,
        name: serverNameMap.get(system.serverId) ?? system.serverId,
      },
      dimensionContext: system.dimensionContext ?? null,
      routes,
      routeDetails: routeDetails.filter((item) => item !== null),
      bindings,
      updatedAt: system.updatedAt,
    };
  }

  async createSystem(userId: string, dto: RailwaySystemCreateDto) {
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
        createdById: userId,
        updatedById: userId,
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

    const serverNameMap = await this.resolveServerNameMap([serverId]);
    const routes = system.routes
      .map((item) => this.normalizeRoute(item.route, serverNameMap))
      .filter((route): route is RailwaySystemRouteSummary => Boolean(route));

    return {
      id: system.id,
      name: system.name,
      englishName: system.englishName ?? null,
      logoAttachmentId: system.logoAttachmentId ?? null,
      logoUrl: system.logoAttachmentId
        ? buildPublicUrl(`/attachments/public/${system.logoAttachmentId}`)
        : null,
      serverId: system.serverId,
      dimensionContext: system.dimensionContext ?? null,
      routes,
      updatedAt: system.updatedAt,
    };
  }

  async updateSystem(userId: string, id: string, dto: RailwaySystemUpdateDto) {
    const system = await this.prisma.transportationRailwaySystem.findUnique({
      where: { id },
      include: { routes: true },
    });
    if (!system) {
      throw new NotFoundException('Railway system not found');
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
          updatedById: userId,
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

    const detail = await this.getSystemDetail(updated.id);
    return detail;
  }

  async updateSystemLogo(userId: string, id: string, file: StoredUploadedFile) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const system = await this.prisma.transportationRailwaySystem.findUnique({
      where: { id },
    });
    if (!system) {
      throw new NotFoundException('Railway system not found');
    }

    const folderName = '铁路线路系统';
    let folder = await this.prisma.attachmentFolder.findFirst({
      where: {
        name: folderName,
        parentId: null,
      },
    });

    if (!folder) {
      folder = await this.attachmentsService.createFolder(userId, {
        name: folderName,
        description: '铁路线路系统相关图片',
        visibilityMode: 'public',
      });
    }

    const attachment = await this.attachmentsService.uploadAttachment(
      userId,
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
        updatedById: userId,
      },
    });

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
      logoUrl: updated.logoAttachmentId
        ? buildPublicUrl(`/attachments/public/${updated.logoAttachmentId}`)
        : null,
    };
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
    if (!serverIds.length) return new Map<string, string>();
    const rows = await this.prisma.minecraftServer.findMany({
      where: { id: { in: serverIds } },
      select: { id: true, displayName: true },
    });
    return new Map(rows.map((row) => [row.id, row.displayName] as const));
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
    serverNameMap: Map<string, string>,
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
        name: serverNameMap.get(route.serverId) ?? route.serverId,
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
}
