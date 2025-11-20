import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../../auth/services/admin-audit.service';
import { OAuthProviderSettings } from '../types/provider.types';

export interface SanitizedOAuthProvider {
  id: string;
  key: string;
  name: string;
  type: string;
  description?: string | null;
  enabled: boolean;
  settings: Omit<OAuthProviderSettings, 'clientSecret'> & {
    hasClientSecret: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OAuthProvidersService implements OnModuleInit {
  private readonly logger = new Logger(OAuthProvidersService.name);
  private tablesReady = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultMicrosoftProvider();
    await this.ensureDefaultGoogleProvider();
  }

  private handleTableMissing(error: unknown) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      if (this.tablesReady) {
        this.logger.warn(
          'OAuth tables not found. Run Prisma migrations to enable OAuth management.',
        );
      }
      this.tablesReady = false;
      return true;
    }
    return false;
  }

  private ensureSettings(value: unknown): OAuthProviderSettings {
    if (!value || typeof value !== 'object') {
      return {};
    }
    const payload = value as Record<string, unknown>;
    const scopes = Array.isArray(payload.scopes)
      ? payload.scopes.filter(
          (item): item is string => typeof item === 'string',
        )
      : undefined;
    return {
      tenantId: this.toString(payload.tenantId),
      clientId: this.toString(payload.clientId),
      clientSecret: this.toString(payload.clientSecret),
      authorizeUrl: this.toString(payload.authorizeUrl),
      tokenUrl: this.toString(payload.tokenUrl),
      redirectUri: this.toString(payload.redirectUri),
      graphUserUrl: this.toString(payload.graphUserUrl),
      graphPhotoUrl: this.toString(payload.graphPhotoUrl),
      scopes,
      providerProxyEnabled:
        typeof payload.providerProxyEnabled === 'boolean'
          ? payload.providerProxyEnabled
          : undefined,
    };
  }

  private sanitize(provider: {
    id: string;
    key: string;
    name: string;
    type: string;
    description?: string | null;
    enabled: boolean;
    settings: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): SanitizedOAuthProvider {
    const settings = this.ensureSettings(provider.settings);
    const hasClientSecret = Boolean(
      settings.clientSecret || this.envSecret(provider.key),
    );
    const { clientSecret, ...rest } = settings;
    return {
      id: provider.id,
      key: provider.key,
      name: provider.name,
      type: provider.type,
      description: provider.description,
      enabled: provider.enabled,
      settings: {
        ...rest,
        hasClientSecret,
      },
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  async listProviders(): Promise<SanitizedOAuthProvider[]> {
    try {
      const providers = await this.prisma.oAuthProvider.findMany({
        orderBy: { createdAt: 'asc' },
      });
      this.tablesReady = true;
      return providers.map((provider) => this.sanitize(provider));
    } catch (error) {
      if (this.handleTableMissing(error)) {
        return [];
      }
      throw error;
    }
  }

  async createProvider(
    data: {
      key: string;
      name: string;
      type: string;
      description?: string;
      enabled?: boolean;
      settings?: OAuthProviderSettings;
    },
    actorId?: string,
  ) {
    const exists = await this.prisma.oAuthProvider.findUnique({
      where: { key: data.key },
    });
    if (exists) {
      throw new BadRequestException('Provider key already exists');
    }
    const provider = await this.prisma.oAuthProvider.create({
      data: {
        key: data.key,
        name: data.name,
        type: data.type,
        description: data.description,
        enabled: data.enabled ?? true,
        settings:
          data.settings !== undefined
            ? (data.settings as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    await this.audit(actorId, 'create_oauth_provider', provider.id, {
      key: provider.key,
    });
    return this.sanitize(provider);
  }

  async updateProvider(
    providerId: string,
    data: {
      key?: string;
      name?: string;
      type?: string;
      description?: string | null;
      enabled?: boolean;
      settings?: OAuthProviderSettings;
    },
    actorId?: string,
  ) {
    const provider = await this.prisma.oAuthProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    if (data.key && data.key !== provider.key) {
      throw new BadRequestException('Provider key cannot be modified');
    }
    const payload: Prisma.OAuthProviderUpdateInput = {
      name: data.name ?? provider.name,
      description: data.description ?? provider.description,
      enabled: data.enabled ?? provider.enabled,
    };
    if (data.type) {
      payload.type = data.type;
    }
    if (data.settings) {
      payload.settings = data.settings as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.oAuthProvider.update({
      where: { id: providerId },
      data: payload,
    });
    await this.audit(actorId, 'update_oauth_provider', provider.id, data);
    return this.sanitize(updated);
  }

  async removeProvider(providerId: string, actorId?: string) {
    const provider = await this.prisma.oAuthProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    const accounts = await this.prisma.account.count({
      where: { provider: provider.key },
    });
    if (accounts > 0) {
      throw new BadRequestException(
        'Cannot delete provider while bindings exist',
      );
    }
    await this.prisma.oAuthProvider.delete({ where: { id: providerId } });
    await this.audit(actorId, 'delete_oauth_provider', provider.id, {
      key: provider.key,
    });
    return { success: true };
  }

  async getEnabledProviderByKey(key: string) {
    try {
      const provider = await this.prisma.oAuthProvider.findUnique({
        where: { key },
      });
      this.tablesReady = true;
      if (!provider || !provider.enabled) {
        return null;
      }
      const sanitized = this.sanitize(provider);
      const env = this.envOverrides(key);
      sanitized.settings = {
        ...sanitized.settings,
        ...env,
        hasClientSecret:
          sanitized.settings.hasClientSecret || Boolean(env.clientSecret),
      };
      return sanitized;
    } catch (error) {
      if (this.handleTableMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async resolveRuntimeProvider(key: string) {
    try {
      const provider = await this.prisma.oAuthProvider.findUnique({
        where: { key },
      });
      this.tablesReady = true;
      if (!provider || !provider.enabled) {
        return null;
      }
      const base = this.ensureSettings(provider.settings);
      const merged: OAuthProviderSettings = {
        ...base,
        ...this.envOverrides(key),
      };
      return { provider, settings: merged };
    } catch (error) {
      if (this.handleTableMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async requireRuntimeProvider(key: string) {
    const resolved = await this.resolveRuntimeProvider(key);
    if (!resolved) {
      throw new NotFoundException('Provider not available');
    }
    if (!resolved.settings.clientId || !resolved.settings.clientSecret) {
      throw new BadRequestException('Provider credentials missing');
    }
    return resolved;
  }

  private envOverrides(key: string): Partial<OAuthProviderSettings> {
    if (key === 'microsoft') {
      return {
        tenantId: process.env.MICROSOFT_OAUTH_TENANT_ID ?? undefined,
        clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? undefined,
        clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? undefined,
        redirectUri: process.env.MICROSOFT_OAUTH_REDIRECT_URI ?? undefined,
      };
    }
    if (key === 'google') {
      return {
        clientId: process.env.GOOGLE_CLIENT_ID ?? undefined,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? undefined,
        redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? undefined,
      };
    }
    return {};
  }

  private envSecret(key: string) {
    return this.envOverrides(key).clientSecret;
  }

  private async ensureDefaultMicrosoftProvider() {
    if (!process.env.MICROSOFT_OAUTH_CLIENT_ID) {
      return;
    }
    let existing: {
      id: string;
    } | null = null;
    try {
      existing = await this.prisma.oAuthProvider.findUnique({
        where: { key: 'microsoft' },
      });
      this.tablesReady = true;
    } catch (error) {
      if (this.handleTableMissing(error)) {
        return;
      }
      throw error;
    }
    const defaultSettings: OAuthProviderSettings = {
      tenantId: process.env.MICROSOFT_OAUTH_TENANT_ID ?? 'common',
      clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID,
      authorizeUrl:
        'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
      scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
      redirectUri:
        process.env.MICROSOFT_OAUTH_REDIRECT_URI ??
        'http://localhost:3000/oauth/providers/microsoft/callback',
      graphUserUrl: 'https://graph.microsoft.com/v1.0/me',
    };
    if (!existing) {
      await this.prisma.oAuthProvider.create({
        data: {
          key: 'microsoft',
          name: 'Microsoft Entra ID',
          type: 'MICROSOFT',
          description: 'Login via Microsoft Entra ID / Azure AD',
          enabled: true,
          settings: defaultSettings as Prisma.InputJsonValue,
        },
      });
      this.logger.log('Bootstrapped Microsoft OAuth provider');
    }
  }

  private async ensureDefaultGoogleProvider() {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return;
    }
    let existing: { id: string } | null = null;
    try {
      existing = await this.prisma.oAuthProvider.findUnique({
        where: { key: 'google' },
      });
      this.tablesReady = true;
    } catch (error) {
      if (this.handleTableMissing(error)) {
        return;
      }
      throw error;
    }

    const defaultSettings: OAuthProviderSettings = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      redirectUri:
        process.env.GOOGLE_OAUTH_REDIRECT_URI ??
        'http://localhost:3000/oauth/providers/google/callback',
      scopes: ['openid', 'profile', 'email'],
    };

    if (!existing) {
      await this.prisma.oAuthProvider.create({
        data: {
          key: 'google',
          name: 'Google',
          type: 'GOOGLE',
          description: 'Login via Google OAuth 2.0',
          enabled: true,
          settings: defaultSettings as Prisma.InputJsonValue,
        },
      });
      this.logger.log('Bootstrapped Google OAuth provider');
    }
  }

  private toString(value: unknown) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    return undefined;
  }

  private async audit(
    actorId: string | undefined,
    action: string,
    targetId: string,
    payload?: Record<string, unknown>,
  ) {
    await this.adminAuditService.record({
      action,
      targetType: 'oauth_provider',
      targetId,
      payload,
      actorId,
    });
  }
}
