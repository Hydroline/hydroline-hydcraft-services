import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortalConfigService } from '../portal-config/portal-config.service';
import {
  DEFAULT_PORTAL_HOME_CONFIG,
  PORTAL_CARD_REGISTRY,
} from '../portal-config/portal-config.constants';
import type { PortalCardVisibilityConfig } from '../portal-config/portal-config.types';

type NavigationLink = {
  id: string;
  label: string;
  tooltip: string | null;
  url: string | null;
  available: boolean;
  icon: string | null;
};

type PortalUserAccessContext = {
  id: string;
  email: string;
  roleKeys: string[];
};

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portalConfigService: PortalConfigService,
  ) {}

  async getHomePortal(userId?: string) {
    let config: {
      hero: {
        subtitle: string;
        background: Array<{ imageUrl: string; description: string | null }>;
      };
      navigation: NavigationLink[];
      cardsConfig: Record<string, PortalCardVisibilityConfig>;
    };

    try {
      const resolved = await this.portalConfigService.getResolvedHomeContent();
      config = {
        hero: resolved.hero,
        navigation: resolved.navigation as NavigationLink[],
        cardsConfig: resolved.cardsConfig,
      };
    } catch (error) {
      this.logger.warn(`Failed to load portal home config: ${String(error)}`);
      config = {
        hero: {
          subtitle: DEFAULT_PORTAL_HOME_CONFIG.hero.subtitle,
          background: [],
        },
        navigation: [],
        cardsConfig: DEFAULT_PORTAL_HOME_CONFIG.cards,
      };
    }

    let userContext: PortalUserAccessContext | null = null;
    if (userId) {
      try {
        userContext = await this.getUserAccessContext(userId);
      } catch (error) {
        this.logger.warn(
          `Failed to resolve user context ${userId}: ${String(error)}`,
        );
      }
    }

    const cards = this.computeAccessibleCards(config.cardsConfig, userContext);

    return {
      hero: {
        subtitle: config.hero.subtitle,
        background: config.hero.background,
      },
      navigation: config.navigation,
      cards,
    };
  }

  async getAdminOverview() {
    try {
      const users = await this.prisma.user.findMany({
        include: {
          profile: {
            include: {
              primaryMinecraftProfile: true,
            },
          },
          minecraftIds: {
            include: {},
          },
          roles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      });

      const attachmentsCount = await this.prisma.attachment.count({
        where: { deletedAt: null },
      });

      const recentAttachments = await this.prisma.attachment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
          folder: { select: { id: true, name: true, path: true } },
        },
      });

      return {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          profile: user.profile
            ? {
                displayName: user.profile.displayName,
                piic: user.profile.piic,
                primaryAuthmeBindingId:
                  user.profile.primaryAuthmeBindingId ?? null,
                primaryMinecraft: user.profile.primaryMinecraftProfile
                  ? {
                      id: user.profile.primaryMinecraftProfile.id,
                      nickname: user.profile.primaryMinecraftProfile.nickname,
                      isPrimary: true,
                    }
                  : null,
              }
            : null,
          minecraftProfiles: user.minecraftIds.map((profile) => ({
            id: profile.id,
            nickname: profile.nickname,
            isPrimary: profile.isPrimary,
          })),
          roles: user.roles.map(({ role }) => ({
            id: role.id,
            key: role.key,
            name: role.name,
          })),
        })),
        attachments: {
          total: attachmentsCount,
          recent: recentAttachments.map((item) => ({
            id: item.id,
            name: item.name,
            isPublic: item.isPublic,
            size: item.size,
            createdAt: item.createdAt,
            owner: item.owner
              ? {
                  id: item.owner.id,
                  name: item.owner.name,
                  email: item.owner.email,
                  deleted: false,
                }
              : {
                  id: item.ownerId,
                  name: item.uploaderNameSnapshot,
                  email: item.uploaderEmailSnapshot,
                  deleted: true,
                },
            folder: item.folder
              ? {
                  id: item.folder.id,
                  name: item.folder.name,
                  path: item.folder.path,
                }
              : null,
            tags: item.tags.map((tag) => ({
              id: tag.tag.id,
              key: tag.tag.key,
              name: tag.tag.name,
            })),
            publicUrl: item.isPublic ? `/attachments/public/${item.id}` : null,
          })),
        },
        unlinkedPlayers: [],
      };
    } catch (error) {
      this.logger.warn(`Admin overview fallback: ${String(error)}`);
      return {
        users: [],
        attachments: { total: 0, recent: [] },
        unlinkedPlayers: [],
      };
    }
  }

  private async getUserAccessContext(
    userId: string,
  ): Promise<PortalUserAccessContext | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        roles: {
          select: {
            role: {
              select: {
                key: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      roleKeys: user.roles.map(({ role }) => role.key),
    };
  }

  private computeAccessibleCards(
    config: Record<string, PortalCardVisibilityConfig>,
    user: PortalUserAccessContext | null,
  ) {
    const result = new Set<string>();

    for (const card of PORTAL_CARD_REGISTRY) {
      const visibility = config[card.id];
      if (!visibility || !visibility.enabled) {
        continue;
      }

      if (visibility.allowGuests) {
        result.add(card.id);
        continue;
      }

      if (!user) {
        continue;
      }

      const allowedUsers = visibility.allowedUsers ?? [];
      if (allowedUsers.some((entry) => this.matchesUser(entry, user))) {
        result.add(card.id);
        continue;
      }

      const allowedRoles = visibility.allowedRoles ?? [];
      if (allowedRoles.length === 0 && allowedUsers.length === 0) {
        result.add(card.id);
        continue;
      }

      if (allowedRoles.some((role) => user.roleKeys.includes(role))) {
        result.add(card.id);
      }
    }

    return Array.from(result);
  }

  private matchesUser(entry: string, user: PortalUserAccessContext) {
    const normalized = entry.trim();
    if (!normalized) {
      return false;
    }
    if (normalized === user.id) {
      return true;
    }
    if (normalized.toLowerCase() === user.email.toLowerCase()) {
      return true;
    }
    return false;
  }
}
