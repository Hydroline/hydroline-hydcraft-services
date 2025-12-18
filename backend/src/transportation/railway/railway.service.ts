import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HydrolineBeaconPoolService } from '../../lib/hydroline-beacon';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPublicUrl } from '../../lib/shared/url';
import {
  CreateRailwayBannerDto,
  UpdateRailwayBannerDto,
} from '../dto/railway.dto';
import { BeaconServerRecord } from './railway-common';
import {
  fetchRailwaySnapshot,
  queryRailwayEntities,
} from './railway-beacon.util';
import type {
  NormalizedEntity,
  NormalizedRoute,
  OverviewStats,
  OverviewLatest,
  RailwaySnapshotEntry,
} from './railway-types';
import { normalizeEntity, normalizeRouteRow } from './railway-normalizer';
import { DEFAULT_RAILWAY_TYPE } from './railway-type.config';

const DEFAULT_RECOMMENDATION_COUNT = 4;

const bannerInclude =
  Prisma.validator<Prisma.TransportationRailwayBannerInclude>()({
    attachment: { select: { id: true, isPublic: true } },
  });
type BannerWithAttachment = Prisma.TransportationRailwayBannerGetPayload<{
  include: typeof bannerInclude;
}>;

type SerializedBanner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  attachmentId: string | null;
  ctaLabel: string | null;
  ctaLink: string | null;
  isPublished: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  imageUrl: string | null;
};

@Injectable()
export class TransportationRailwayService {
  private readonly logger = new Logger(TransportationRailwayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
  ) {}

  async getOverview() {
    const [banners, servers] = await Promise.all([
      this.getPublishedBanners(),
      this.listBeaconServers(),
    ]);

    const stats: OverviewStats = {
      serverCount: servers.length,
      routes: 0,
      stations: 0,
      depots: 0,
    };
    const latest: OverviewLatest = {
      depots: [],
      stations: [],
      routes: [],
    };
    const warnings: Array<{ serverId: string; message: string }> = [];
    const recommendations: NormalizedRoute[] = [];

    await Promise.all(
      servers.map(async (server) => {
        try {
          const summary = await this.fetchServerOverview(server);
          stats.routes += summary.routeCount;
          stats.stations += summary.stationCount;
          stats.depots += summary.depotCount;
          latest.depots.push(...summary.latestDepots);
          latest.stations.push(...summary.latestStations);
          latest.routes.push(...summary.latestRoutes);
          recommendations.push(...summary.recommendationCandidates);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          warnings.push({ serverId: server.id, message });
          this.logger.warn(
            `Failed to fetch railway overview for ${server.displayName}: ${message}`,
          );
        }
      }),
    );

    latest.depots.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));
    latest.stations.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));
    latest.routes.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));

    latest.depots.splice(8);
    latest.stations.splice(8);
    latest.routes.splice(8);

    const pickedRecommendations = this.pickRecommendations(recommendations);

    return {
      banners,
      stats,
      latest,
      recommendations: pickedRecommendations,
      warnings,
    };
  }

  async adminListBanners() {
    const banners = await this.prisma.transportationRailwayBanner.findMany({
      include: bannerInclude,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return banners.map((banner) => this.serializeBanner(banner));
  }

  async createBanner(userId: string, dto: CreateRailwayBannerDto) {
    await this.ensureAttachmentPublic(dto.attachmentId);
    const created = await this.prisma.transportationRailwayBanner.create({
      data: {
        title: dto.title?.trim() || null,
        subtitle: dto.subtitle?.trim() || null,
        description: dto.description?.trim() || null,
        attachmentId: dto.attachmentId,
        ctaLabel: dto.ctaLabel?.trim() || null,
        ctaLink: dto.ctaLink?.trim() || null,
        isPublished: dto.isPublished ?? true,
        displayOrder: dto.displayOrder ?? 0,
        createdById: userId,
        updatedById: userId,
      },
      include: bannerInclude,
    });
    return this.serializeBanner(created);
  }

  async updateBanner(id: string, userId: string, dto: UpdateRailwayBannerDto) {
    const existing = await this.prisma.transportationRailwayBanner.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Banner not found');
    }
    if (dto.attachmentId) {
      await this.ensureAttachmentPublic(dto.attachmentId);
    }
    const updated = await this.prisma.transportationRailwayBanner.update({
      where: { id },
      data: {
        title:
          dto.title !== undefined ? dto.title?.trim() || null : existing.title,
        subtitle:
          dto.subtitle !== undefined
            ? dto.subtitle?.trim() || null
            : existing.subtitle,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : existing.description,
        attachmentId:
          dto.attachmentId !== undefined
            ? dto.attachmentId || null
            : existing.attachmentId,
        ctaLabel:
          dto.ctaLabel !== undefined
            ? dto.ctaLabel?.trim() || null
            : existing.ctaLabel,
        ctaLink:
          dto.ctaLink !== undefined
            ? dto.ctaLink?.trim() || null
            : existing.ctaLink,
        isPublished:
          dto.isPublished !== undefined
            ? dto.isPublished
            : existing.isPublished,
        displayOrder:
          dto.displayOrder !== undefined
            ? dto.displayOrder
            : existing.displayOrder,
        updatedById: userId,
      },
      include: bannerInclude,
    });
    return this.serializeBanner(updated);
  }

  async deleteBanner(id: string) {
    await this.prisma.transportationRailwayBanner.delete({ where: { id } });
    return { success: true };
  }

  private async fetchServerOverview(server: BeaconServerRecord): Promise<{
    server: BeaconServerRecord;
    routeCount: number;
    stationCount: number;
    depotCount: number;
    latestDepots: NormalizedEntity[];
    latestStations: NormalizedEntity[];
    latestRoutes: NormalizedRoute[];
    recommendationCandidates: NormalizedRoute[];
  }> {
    const [snapshotRes, depotRows, stationRows, routeRows] = await Promise.all([
      this.fetchRailwaySnapshot(server),
      queryRailwayEntities(
        this.beaconPool,
        server,
        server.railwayMod,
        'depots',
        {
          limit: 6,
        },
      ),
      queryRailwayEntities(
        this.beaconPool,
        server,
        server.railwayMod,
        'stations',
        {
          limit: 6,
        },
      ),
      queryRailwayEntities(
        this.beaconPool,
        server,
        server.railwayMod,
        'routes',
        {
          limit: 8,
        },
      ),
    ]);

    const counts = snapshotRes.snapshots?.reduce(
      (acc, entry) => {
        acc.routes += entry.payload?.routes?.length ?? 0;
        acc.stations += entry.payload?.stations?.length ?? 0;
        acc.depots += entry.payload?.depots?.length ?? 0;
        return acc;
      },
      { routes: 0, stations: 0, depots: 0 },
    ) ?? { routes: 0, stations: 0, depots: 0 };

    const normalizedRoutes = (routeRows.rows ?? [])
      .map((row) => normalizeRouteRow(row, server))
      .filter((row): row is NormalizedRoute => Boolean(row));
    return {
      server,
      routeCount: counts.routes,
      stationCount: counts.stations,
      depotCount: counts.depots,
      latestDepots: (depotRows.rows ?? [])
        .map((row) => normalizeEntity(row, server))
        .filter((row): row is NormalizedEntity => Boolean(row)),
      latestStations: (stationRows.rows ?? [])
        .map((row) => normalizeEntity(row, server))
        .filter((row): row is NormalizedEntity => Boolean(row)),
      latestRoutes: normalizedRoutes,
      recommendationCandidates: normalizedRoutes,
    };
  }

  private pickRecommendations(routes: NormalizedRoute[]) {
    if (!routes.length) return [];
    const deduped = new Map<string, NormalizedRoute>();
    for (const route of routes) {
      const key = `${route.server.id}:${route.id}`;
      if (!deduped.has(key)) {
        deduped.set(key, route);
      }
    }
    return Array.from(deduped.values())
      .sort((a, b) => {
        const left = a.lastUpdated ?? 0;
        const right = b.lastUpdated ?? 0;
        if (left === right) {
          return (b.platformCount ?? 0) - (a.platformCount ?? 0);
        }
        return right - left;
      })
      .slice(0, DEFAULT_RECOMMENDATION_COUNT);
  }

  private async fetchRailwaySnapshot(server: BeaconServerRecord) {
    return fetchRailwaySnapshot(this.beaconPool, server);
  }

  private async listBeaconServers() {
    const rows = await this.prisma.minecraftServer.findMany({
      where: {
        isActive: true,
        beaconEnabled: true,
        beaconEndpoint: { not: null },
        beaconKey: { not: null },
      },
      select: {
        id: true,
        displayName: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        transportationRailwayMod: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows
      .filter((row) => row.beaconEndpoint && row.beaconKey)
      .map((row) => ({
        id: row.id,
        displayName: row.displayName,
        beaconEndpoint: row.beaconEndpoint!,
        beaconKey: row.beaconKey!,
        beaconRequestTimeoutMs: row.beaconRequestTimeoutMs,
        beaconMaxRetry: row.beaconMaxRetry,
        railwayMod: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
        railwayType: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
      }));
  }

  private async getPublishedBanners() {
    const rows = await this.prisma.transportationRailwayBanner.findMany({
      where: { isPublished: true },
      include: bannerInclude,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.serializeBanner(row));
  }

  private serializeBanner(row: BannerWithAttachment): SerializedBanner {
    return {
      id: row.id,
      title: row.title ?? null,
      subtitle: row.subtitle ?? null,
      description: row.description ?? null,
      attachmentId: row.attachmentId ?? null,
      ctaLabel: row.ctaLabel ?? null,
      ctaLink: row.ctaLink ?? null,
      isPublished: row.isPublished,
      displayOrder: row.displayOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      imageUrl:
        row.attachment && row.attachment.isPublic
          ? buildPublicUrl(`/attachments/public/${row.attachment.id}`)
          : null,
    };
  }

  private async ensureAttachmentPublic(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, isPublic: true },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    if (!attachment.isPublic) {
      throw new BadRequestException(
        'Please set the attachment to public access first',
      );
    }
  }
}
