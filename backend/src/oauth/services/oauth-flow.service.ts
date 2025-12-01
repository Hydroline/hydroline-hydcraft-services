import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuthLogAction, OAuthLogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthProvidersService } from './oauth-providers.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthLogService } from './oauth-log.service';
import {
  OAuthFlowMode,
  OAuthProviderSettings,
  OAuthResultPayload,
  OAuthStatePayload,
} from '../types/provider.types';
import { oauthProxyFetch } from '../../lib/proxy/oauth-proxy-client';
import { AuthService, RequestContext } from '../../auth/services/auth.service';
import { generateRandomString } from 'better-auth/crypto';

interface StartFlowInput {
  providerKey: string;
  mode: OAuthFlowMode;
  redirectUri: string;
  userId?: string;
  rememberMe?: boolean;
}

interface AccountProfilePayload extends Record<string, unknown> {
  id: string;
  displayName?: string | null;
  email?: string | null;
  userPrincipalName?: string | null;
  avatarDataUri?: string | null;
}

type ProviderProfile = {
  id: string;
  mail?: string | null;
  email?: string | null;
  userPrincipalName?: string | null;
  displayName?: string | null;
};

@Injectable()
export class OAuthFlowService {
  private readonly logger = new Logger(OAuthFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProvidersService,
    private readonly stateService: OAuthStateService,
    private readonly logService: OAuthLogService,
    private readonly authService: AuthService,
  ) {}

  async start(input: StartFlowInput, context: RequestContext) {
    const runtime = await this.providers.requireRuntimeProvider(
      input.providerKey,
    );
    const state = await this.stateService.createState({
      providerKey: runtime.provider.key,
      mode: input.mode,
      redirectUri: input.redirectUri,
      userId: input.userId,
      rememberMe: input.rememberMe,
    });

    const authorizeUrl = this.buildAuthorizeUrl(
      runtime.settings,
      runtime.provider.key,
      state,
    );

    await this.logService.record({
      providerId: runtime.provider.id,
      providerKey: runtime.provider.key,
      providerType: runtime.provider.type,
      action: OAuthLogAction.AUTHORIZE,
      status: OAuthLogStatus.SUCCESS,
      userId: input.userId ?? null,
      message: `Start ${input.mode} flow`,
      metadata: { redirectUri: input.redirectUri },
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });

    return { authorizeUrl, state };
  }

  private buildAuthorizeUrl(
    settings: OAuthProviderSettings,
    providerKey: string,
    state: string,
  ) {
    const tenant = (settings.tenantId as string) || 'common';
    const baseAuthorize =
      (settings.authorizeUrl as string) ||
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize';
    const redirectUri = this.resolveRedirectUri(settings, providerKey);
    const scopes = Array.isArray(settings.scopes)
      ? settings.scopes
      : ['openid', 'profile', 'email', 'offline_access', 'User.Read'];
    const authorizeUrl = baseAuthorize.replace('{tenant}', tenant);
    const params = new URLSearchParams({
      client_id: (settings.clientId as string) ?? '',
      response_type: 'code',
      response_mode: 'query',
      scope: scopes.join(' '),
      redirect_uri: redirectUri,
      state,
      prompt: 'select_account',
    });
    return `${authorizeUrl}?${params.toString()}`;
  }

  private resolveRedirectUri(
    settings: OAuthProviderSettings,
    providerKey: string,
  ) {
    const base =
      (settings.redirectUri as string) ||
      `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/oauth/providers/{provider}/callback`;
    return base.replace('{provider}', providerKey);
  }

  async handleCallback(input: {
    providerKey: string;
    state: string;
    code: string;
    context: RequestContext;
  }) {
    const runtime = await this.providers.requireRuntimeProvider(
      input.providerKey,
    );
    const statePayload = await this.stateService.consumeState(input.state);
    if (!statePayload) {
      throw new BadRequestException('Invalid or expired state');
    }

    const token = await this.exchangeToken(
      runtime.settings,
      input.code,
      input.providerKey,
    );

    const { profile, avatarDataUri } = await this.fetchProviderProfile(
      input.providerKey,
      token.access_token,
      runtime.settings,
    );
    const accountProfile = this.buildAccountProfile(profile, avatarDataUri);

    const resultPayload =
      statePayload.mode === 'BIND'
        ? await this.handleBinding(
            runtime.provider,
            statePayload,
            profile,
            accountProfile,
          )
        : await this.handleLogin(
            runtime.provider,
            statePayload,
            profile,
            accountProfile,
            input.context,
          );

    await this.stateService.storeResult(input.state, resultPayload);
    return {
      redirectUri: statePayload.redirectUri,
      result: resultPayload,
    };
  }

  async consumeResult(state: string) {
    return this.stateService.consumeResult(state);
  }

  async unlink(providerKey: string, userId: string) {
    const account = await this.prisma.account.findFirst({
      where: { provider: providerKey, userId },
    });
    if (!account) {
      throw new BadRequestException(
        'Current account is not bound to this provider',
      );
    }
    await this.prisma.account.delete({ where: { id: account.id } });
    const runtime = await this.providers.resolveRuntimeProvider(providerKey);
    await this.logService.record({
      providerId: runtime?.provider.id ?? null,
      providerKey,
      providerType:
        runtime?.provider.type ?? providerKey.toUpperCase() ?? 'OAUTH',
      action: OAuthLogAction.UNBIND,
      status: OAuthLogStatus.SUCCESS,
      userId,
      accountId: null,
      message: 'User removed OAuth binding',
      metadata: { providerAccountId: account.providerAccountId },
    });
    return true;
  }

  private async exchangeToken(
    settings: OAuthProviderSettings,
    code: string,
    providerKey: string,
  ) {
    const tenant = (settings.tenantId as string) || 'common';
    const tokenUrl =
      (settings.tokenUrl as string) ||
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
    const redirectUri = this.resolveRedirectUri(settings, providerKey);
    const clientId = settings.clientId as string;
    const clientSecret =
      (settings.clientSecret as string) ||
      process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    const body = new URLSearchParams({
      client_id: clientId,
      scope: Array.isArray(settings.scopes)
        ? settings.scopes.join(' ')
        : 'openid profile email offline_access User.Read',
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      client_secret: clientSecret ?? '',
    });

    const response = await oauthProxyFetch(
      tokenUrl.replace('{tenant}', tenant),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
      settings,
    );
    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(`Token exchange failed: ${text}`);
    }
    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      scope?: string;
    };
  }

  private async fetchProviderProfile(
    providerKey: string,
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ profile: ProviderProfile; avatarDataUri: string | null }> {
    if (providerKey === 'google') {
      return this.fetchGoogleProfile(accessToken, settings);
    }
    return this.fetchMicrosoftProviderProfile(accessToken, settings);
  }

  private async fetchMicrosoftProviderProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ profile: ProviderProfile; avatarDataUri: string | null }> {
    const profile = await this.fetchMicrosoftProfile(accessToken, settings);
    const avatarDataUri = await this.fetchMicrosoftPhoto(accessToken, settings);
    return { profile, avatarDataUri };
  }

  private async fetchMicrosoftProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ) {
    const url =
      (settings.graphUserUrl as string) ??
      'https://graph.microsoft.com/v1.0/me';
    const response = await oauthProxyFetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      settings,
    );
    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(
        `Failed to fetch Microsoft profile: ${text}`,
      );
    }
    return (await response.json()) as {
      id: string;
      userPrincipalName?: string;
      mail?: string | null;
      displayName?: string | null;
      givenName?: string | null;
      surname?: string | null;
    };
  }

  private async fetchGoogleProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ profile: ProviderProfile; avatarDataUri: string | null }> {
    const url =
      (settings.graphUserUrl as string) ??
      'https://www.googleapis.com/oauth2/v3/userinfo';
    const response = await oauthProxyFetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      settings,
    );
    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(
        `Failed to fetch Google profile: ${text}`,
      );
    }
    const data = (await response.json()) as {
      sub?: string;
      id?: string;
      email?: string | null;
      name?: string | null;
      given_name?: string | null;
      family_name?: string | null;
      picture?: string | null;
    };
    const profile: ProviderProfile = {
      id: data.sub ?? data.id ?? '',
      email: data.email ?? null,
      mail: data.email ?? null,
      displayName: (() => {
        if (data.name) return data.name;
        const combined = [data.given_name, data.family_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        return combined || null;
      })(),
      userPrincipalName: data.email ?? null,
    };
    if (!profile.id) {
      throw new UnauthorizedException('Invalid Google profile payload');
    }
    const avatarDataUri = await this.fetchImageAsDataUri(
      data.picture ?? null,
      settings,
    );
    return { profile, avatarDataUri };
  }

  private buildAccountProfile(
    profile: ProviderProfile,
    avatarDataUri?: string | null,
  ): AccountProfilePayload {
    const email = profile.email ?? profile.mail ?? null;
    return {
      id: profile.id,
      displayName: profile.displayName ?? profile.userPrincipalName ?? email,
      email,
      userPrincipalName: profile.userPrincipalName ?? null,
      avatarDataUri: avatarDataUri ?? null,
    };
  }

  private async fetchMicrosoftPhoto(
    accessToken: string,
    settings: OAuthProviderSettings,
  ) {
    const url =
      (settings.graphPhotoUrl as string) ??
      'https://graph.microsoft.com/v1.0/me/photo/$value';
    try {
      const response = await oauthProxyFetch(
        url,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        settings,
      );
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return null;
      }
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Microsoft profile avatar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async fetchImageAsDataUri(
    url: string | null | undefined,
    settings: OAuthProviderSettings,
  ) {
    if (!url) {
      return null;
    }
    try {
      const response = await oauthProxyFetch(url, {}, settings);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return null;
      }
      const contentType =
        response.headers.get('content-type') ?? 'application/octet-stream';
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch image for avatar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async handleLogin(
    provider: { id: string; key: string; type: string },
    state: OAuthStatePayload,
    profile: ProviderProfile,
    accountProfile: AccountProfilePayload,
    context: RequestContext,
  ): Promise<OAuthResultPayload> {
    const externalId = profile.id;
    const account = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: provider.key,
          providerAccountId: externalId,
        },
      },
    });
    if (account) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: {
          profile: accountProfile
            ? (accountProfile as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      const session = await this.authService.createSessionForUser(
        account.userId,
        state.rememberMe ?? false,
        context,
      );
      await this.logService.record({
        providerId: provider.id,
        providerKey: provider.key,
        providerType: provider.type,
        action: OAuthLogAction.LOGIN,
        status: OAuthLogStatus.SUCCESS,
        userId: account.userId,
        accountId: account.id,
      });
      return {
        success: true,
        mode: 'LOGIN',
        tokens: session.tokens,
        user: session.user,
      };
    }
    const email =
      profile.email ||
      profile.mail ||
      profile.userPrincipalName ||
      `${externalId}@${provider.key}.local`;
    const registerResult = await this.authService.createOauthUser(
      {
        email,
        name: profile.displayName ?? profile.userPrincipalName ?? email,
        rememberMe: state.rememberMe ?? true,
      },
      context,
    );
    await this.linkAccount(
      provider.key,
      externalId,
      registerResult.user.id,
      registerResult.tokens.refreshToken ?? null,
      accountProfile,
    );
    await this.logService.record({
      providerId: provider.id,
      providerKey: provider.key,
      providerType: provider.type,
      action: OAuthLogAction.REGISTER,
      status: OAuthLogStatus.SUCCESS,
      userId: registerResult.user.id,
      message: `Created user via ${provider.type ?? provider.key} OAuth`,
    });
    return {
      success: true,
      mode: 'LOGIN',
      tokens: registerResult.tokens,
      user: registerResult.user,
    };
  }

  private async handleBinding(
    provider: { id: string; key: string; type: string },
    state: OAuthStatePayload,
    profile: ProviderProfile,
    accountProfile: AccountProfilePayload,
  ): Promise<OAuthResultPayload> {
    if (!state.userId) {
      throw new UnauthorizedException('Binding requires authenticated user');
    }
    const existing = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: state.providerKey,
          providerAccountId: profile.id,
        },
      },
    });
    if (existing && existing.userId !== state.userId) {
      throw new BadRequestException(
        'This account is already bound to another user',
      );
    }
    await this.linkAccount(
      state.providerKey,
      profile.id,
      state.userId,
      null,
      accountProfile,
    );
    await this.logService.record({
      providerId: provider.id,
      providerKey: state.providerKey,
      providerType: provider.type,
      action: OAuthLogAction.BIND,
      status: OAuthLogStatus.SUCCESS,
      userId: state.userId,
      metadata: { providerAccountId: profile.id },
    });
    return {
      success: true,
      mode: 'BIND',
      binding: { providerKey: state.providerKey, userId: state.userId },
    };
  }

  private async linkAccount(
    providerKey: string,
    providerAccountId: string,
    userId: string,
    refreshToken: string | null,
    accountProfile?: AccountProfilePayload,
  ) {
    await this.prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: providerKey,
          providerAccountId,
        },
      },
      update: {
        userId,
        refreshToken,
        ...(accountProfile && {
          profile: accountProfile as Prisma.InputJsonValue,
        }),
      },
      create: {
        userId,
        accountId: generateRandomString(32, 'a-z', '0-9'),
        providerId: providerKey,
        provider: providerKey,
        providerAccountId,
        type: 'oauth',
        refreshToken,
        profile: accountProfile
          ? (accountProfile as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }
}
