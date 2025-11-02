import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '../config/config.service';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  DEFAULT_PORTAL_HOME_CONFIG,
  PORTAL_CARD_REGISTRY,
  PORTAL_CONFIG_ENTRY_KEY,
  PORTAL_CONFIG_NAMESPACE,
} from './portal-config.constants';
import type {
  PortalCardRegistryEntry,
  PortalCardVisibilityConfig,
  PortalHomeBackgroundConfig,
  PortalHomeConfig,
  PortalNavigationConfigItem,
} from './portal-config.types';

type PortalHomeConfigDraft = PortalHomeConfig;

interface SaveOptions {
  userId?: string;
}

@Injectable()
export class PortalConfigService {
  private readonly logger = new Logger(PortalConfigService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly attachmentsService: AttachmentsService,
  ) {
    this.baseUrl =
      process.env.APP_PUBLIC_BASE_URL ||
      process.env.BETTER_AUTH_URL ||
      'http://localhost:3000';
  }

  getCardRegistry(): PortalCardRegistryEntry[] {
    return PORTAL_CARD_REGISTRY;
  }

  async getRawConfig(): Promise<PortalHomeConfig> {
    const entry = await this.configService.getEntry(
      PORTAL_CONFIG_NAMESPACE,
      PORTAL_CONFIG_ENTRY_KEY,
    );
    if (!entry) {
      const defaults = this.applyDefaults(DEFAULT_PORTAL_HOME_CONFIG);
      await this.saveConfig(defaults).catch((error) => {
        this.logger.warn(
          `Failed to persist default portal home config: ${String(error)}`,
        );
      });
      return defaults;
    }

    const value = entry.value as PortalHomeConfigDraft | null;
    if (!value || typeof value !== 'object') {
      return this.applyDefaults(DEFAULT_PORTAL_HOME_CONFIG);
    }
    return this.applyDefaults(value);
  }

  async getResolvedHomeContent() {
    const config = await this.getRawConfig();
    const heroBackgrounds = await this.resolveBackgrounds(config.hero.backgrounds);
    const navigation = config.navigation.map((item) =>
      this.normalizeNavigationItem(item),
    );

    return {
      hero: {
        subtitle: config.hero.subtitle,
        background: heroBackgrounds,
      },
      navigation,
      cardsConfig: config.cards,
    };
  }

  async overwriteConfig(config: PortalHomeConfig, options: SaveOptions = {}) {
    const normalized = this.applyDefaults(config);
    await this.saveConfig(normalized, options);
  }

  async getAdminConfig() {
    const config = await this.getRawConfig();
    const heroBackgrounds = await Promise.all(
      config.hero.backgrounds.map(async (item) => {
        const resolved = await this.resolveBackground(item);
        return {
          id: item.id,
          attachmentId: item.attachmentId,
          description: item.description ?? null,
          imageUrl: resolved?.imageUrl ?? null,
          available: Boolean(resolved),
        };
      }),
    );

    return {
      hero: {
        subtitle: config.hero.subtitle,
        backgrounds: heroBackgrounds,
      },
      navigation: config.navigation.map((item) => this.normalizeNavigationItem(item)),
      cards: this.ensureCardConfig(config.cards),
      registry: this.getCardRegistry(),
    };
  }

  async updateHeroSubtitle(subtitle: string, options: SaveOptions = {}) {
    const config = await this.getRawConfig();
    config.hero.subtitle = subtitle;
    await this.saveConfig(config, options);
    return { subtitle: config.hero.subtitle };
  }

  async addHeroBackground(
    input: { attachmentId: string; description?: string | null },
    options: SaveOptions = {},
  ) {
    const attachment = await this.attachmentsService.getAttachmentOrThrow(
      input.attachmentId,
    );
    if (!attachment.isPublic) {
      throw new BadRequestException('背景图附件必须设置为公开访问');
    }

    const background: PortalHomeBackgroundConfig = {
      id: randomUUID(),
      attachmentId: input.attachmentId,
      description: input.description?.trim() || null,
    };

    const config = await this.getRawConfig();
    config.hero.backgrounds.push(background);
    await this.saveConfig(config, options);

    const resolved = await this.resolveBackground(background);
    return {
      ...background,
      imageUrl: resolved?.imageUrl ?? null,
    };
  }

  async updateHeroBackground(
    backgroundId: string,
    input: { attachmentId?: string; description?: string | null },
    options: SaveOptions = {},
  ) {
    const config = await this.getRawConfig();
    const target = config.hero.backgrounds.find((item) => item.id === backgroundId);
    if (!target) {
      throw new NotFoundException('背景图不存在');
    }

    if (input.attachmentId && input.attachmentId !== target.attachmentId) {
      const attachment = await this.attachmentsService.getAttachmentOrThrow(
        input.attachmentId,
      );
      if (!attachment.isPublic) {
        throw new BadRequestException('背景图附件必须设置为公开访问');
      }
      target.attachmentId = input.attachmentId;
    }

    if (input.description !== undefined) {
      target.description = input.description?.trim() || null;
    }

    await this.saveConfig(config, options);
    const resolved = await this.resolveBackground(target);
    return {
      ...target,
      imageUrl: resolved?.imageUrl ?? null,
    };
  }

  async removeHeroBackground(backgroundId: string, options: SaveOptions = {}) {
    const config = await this.getRawConfig();
    const nextBackgrounds = config.hero.backgrounds.filter(
      (item) => item.id !== backgroundId,
    );
    if (nextBackgrounds.length === config.hero.backgrounds.length) {
      throw new NotFoundException('背景图不存在');
    }

    config.hero.backgrounds = nextBackgrounds;
    await this.saveConfig(config, options);
    return { success: true };
  }

  async reorderHeroBackgrounds(order: string[], options: SaveOptions = {}) {
    const config = await this.getRawConfig();
    const map = new Map(config.hero.backgrounds.map((item) => [item.id, item]));
    if (order.length !== config.hero.backgrounds.length) {
      throw new BadRequestException('排序列表与背景图数量不匹配');
    }
    const next: PortalHomeBackgroundConfig[] = [];
    for (const id of order) {
      const item = map.get(id);
      if (!item) {
        throw new BadRequestException(`无效的背景图 ID：${id}`);
      }
      next.push(item);
    }
    config.hero.backgrounds = next;
    await this.saveConfig(config, options);
    return { success: true };
  }

  async createNavigationItem(
    input: Omit<PortalNavigationConfigItem, 'available'> & {
      available?: boolean;
    },
    options: SaveOptions = {},
  ) {
    if (!input.id?.trim()) {
      throw new BadRequestException('导航 ID 不能为空');
    }
    if (!input.label?.trim()) {
      throw new BadRequestException('导航标题不能为空');
    }
    const config = await this.getRawConfig();
    const exists = config.navigation.some((item) => item.id === input.id);
    if (exists) {
      throw new BadRequestException('导航 ID 已存在');
    }
    const normalized = this.normalizeNavigationItem({
      ...input,
    });
    config.navigation.push(normalized);
    await this.saveConfig(config, options);
    return normalized;
  }

  async updateNavigationItem(
    id: string,
    input: Partial<Omit<PortalNavigationConfigItem, 'id'>>,
    options: SaveOptions = {},
  ) {
    const config = await this.getRawConfig();
    const target = config.navigation.find((item) => item.id === id);
    if (!target) {
      throw new NotFoundException('导航项不存在');
    }

    if (input.label !== undefined) {
      if (!input.label?.trim()) {
        throw new BadRequestException('导航标题不能为空');
      }
      target.label = input.label;
    }
    if (input.tooltip !== undefined) {
      target.tooltip = input.tooltip ?? null;
    }
    if (input.url !== undefined) {
      target.url = input.url ?? null;
    }
    if (input.available !== undefined) {
      target.available = Boolean(input.available);
    }
    if (input.icon !== undefined) {
      target.icon = input.icon ?? null;
    }

    await this.saveConfig(config, options);
    return this.normalizeNavigationItem(target);
  }

  async removeNavigationItem(id: string, options: SaveOptions = {}) {
    const config = await this.getRawConfig();
    const nextItems = config.navigation.filter((item) => item.id !== id);
    if (nextItems.length === config.navigation.length) {
      throw new NotFoundException('导航项不存在');
    }
    config.navigation = nextItems;
    await this.saveConfig(config, options);
    return { success: true };
  }

  async reorderNavigation(order: string[], options: SaveOptions = {}) {
    const config = await this.getRawConfig();
    const map = new Map(config.navigation.map((item) => [item.id, item]));
    if (order.length !== config.navigation.length) {
      throw new BadRequestException('排序列表与导航项数量不匹配');
    }
    const next: PortalNavigationConfigItem[] = [];
    for (const id of order) {
      const item = map.get(id);
      if (!item) {
        throw new BadRequestException(`无效的导航项 ID：${id}`);
      }
      next.push(item);
    }
    config.navigation = next;
    await this.saveConfig(config, options);
    return { success: true };
  }

  async updateCardVisibility(
    cardId: string,
    input: PortalCardVisibilityConfig,
    options: SaveOptions = {},
  ) {
    const registry = this.getCardRegistry();
    if (!registry.find((card) => card.id === cardId)) {
      throw new NotFoundException('卡片未注册');
    }
    const config = await this.getRawConfig();
    config.cards[cardId] = this.normalizeCardVisibility(input);
    await this.saveConfig(config, options);
    return config.cards[cardId];
  }

  private async resolveBackgrounds(
    items: PortalHomeBackgroundConfig[],
  ): Promise<
    Array<{
      imageUrl: string;
      description: string | null;
    }>
  > {
    const resolvedItems = await Promise.all(
      items.map((item) => this.resolveBackground(item)),
    );
    return resolvedItems.filter((item): item is { imageUrl: string; description: string | null } =>
      Boolean(item),
    );
  }

  private async resolveBackground(
    item: PortalHomeBackgroundConfig,
  ): Promise<{ imageUrl: string; description: string | null } | null> {
    try {
      const attachment = await this.attachmentsService.getAttachmentOrThrow(
        item.attachmentId,
      );
      if (!attachment.isPublic) {
        this.logger.warn(
          `Attachment ${item.attachmentId} is not public. Skip background.`,
        );
        return null;
      }
      return {
        imageUrl: this.toPublicUrl(`/attachments/public/${attachment.id}`),
        description: item.description ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to resolve background ${item.id}: ${String(error)}`,
      );
      return null;
    }
  }

  private normalizeNavigationItem(input: PortalNavigationConfigItem) {
    const label = input.label?.trim() || input.id.trim();
    return {
      id: input.id.trim(),
      label,
      tooltip: input.tooltip?.trim() || null,
      url: input.url?.trim() || null,
      available:
        input.available !== undefined ? Boolean(input.available) : Boolean(input.url),
      icon: input.icon?.trim() || null,
    };
  }

  private normalizeCardVisibility(
    input: Partial<PortalCardVisibilityConfig>,
  ): PortalCardVisibilityConfig {
    const allowedRoles = Array.from(
      new Set(
        (input.allowedRoles ?? []).map((role) => role.trim()).filter(Boolean),
      ),
    );
    const allowedUsers = Array.from(
      new Set(
        (input.allowedUsers ?? []).map((user) => user.trim()).filter(Boolean),
      ),
    );
    return {
      enabled: Boolean(input.enabled),
      allowedRoles,
      allowedUsers,
      allowGuests: Boolean(input.allowGuests),
    };
  }

  private ensureCardConfig(map: Record<string, PortalCardVisibilityConfig>) {
    const next = { ...map };
    for (const card of this.getCardRegistry()) {
      if (!next[card.id]) {
        next[card.id] = this.normalizeCardVisibility(
          DEFAULT_PORTAL_HOME_CONFIG.cards[card.id] ?? {
            enabled: false,
            allowedRoles: [],
            allowedUsers: [],
            allowGuests: false,
          },
        );
      }
    }
    return next;
  }

  private applyDefaults(config: PortalHomeConfigDraft): PortalHomeConfig {
    const cloned: PortalHomeConfig = {
      hero: {
        subtitle: config.hero?.subtitle || DEFAULT_PORTAL_HOME_CONFIG.hero.subtitle,
        backgrounds: Array.isArray(config.hero?.backgrounds)
          ? config.hero.backgrounds
              .map((item) => this.normalizeBackground(item))
              .filter((item): item is PortalHomeBackgroundConfig => Boolean(item))
          : [],
      },
      navigation: Array.isArray(config.navigation)
        ? config.navigation
            .map((item) => this.normalizeNavigationItem(item))
            .filter((item) => Boolean(item.id))
        : [],
      cards: this.ensureCardConfig(config.cards ?? {}),
    };
    return cloned;
  }

  private normalizeBackground(
    item: PortalHomeBackgroundConfig | null | undefined,
  ): PortalHomeBackgroundConfig | null {
    if (!item) {
      return null;
    }
    if (!item.id) {
      return {
        ...item,
        id: randomUUID(),
      };
    }
    if (!item.attachmentId) {
      return null;
    }
    return {
      id: item.id,
      attachmentId: item.attachmentId,
      description: item.description ?? null,
    };
  }

  private async saveConfig(config: PortalHomeConfig, options: SaveOptions = {}) {
    const namespace = await this.configService.ensureNamespaceByKey(
      PORTAL_CONFIG_NAMESPACE,
      {
        name: 'Portal Home Configuration',
        description: 'Hydroline portal 首页动态配置',
      },
    );

    const entry = await this.configService.getEntry(
      PORTAL_CONFIG_NAMESPACE,
      PORTAL_CONFIG_ENTRY_KEY,
    );
    const payload = JSON.parse(JSON.stringify(config));
    if (entry) {
      await this.configService.updateEntry(
        entry.id,
        {
          value: payload,
        },
        options.userId,
      );
    } else {
      await this.configService.createEntry(
        namespace.id,
        {
          key: PORTAL_CONFIG_ENTRY_KEY,
          value: payload,
        },
        options.userId,
      );
    }
  }

  private toPublicUrl(pathname: string) {
    return new URL(pathname, this.baseUrl).toString();
  }
}
