import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OAuthProvidersService } from '../services/oauth-providers.service';
import {
  getProxyConfig,
  oauthProxyFetch,
} from '../../lib/proxy/oauth-proxy-client';

@ApiTags('OAuth Proxy 测试')
@Controller('auth/oauth')
export class OAuthProxyTestController {
  constructor(private readonly providers: OAuthProvidersService) {}

  @Get('providers/:providerId/proxy-test')
  @ApiOperation({ summary: '测试当前 Provider Proxy 配置' })
  async testProxy(
    @Param('providerId') providerId: string,
    @Query('url') url?: string,
  ) {
    const provider = await this.providers
      .listProviders()
      .then((items) => items.find((p) => p.id === providerId));
    if (!provider) {
      return { ok: false, error: 'Provider not found' };
    }
    const env = getProxyConfig();
    const targetUrl =
      url || provider.settings.tokenUrl || provider.settings.authorizeUrl;
    if (!targetUrl) {
      return { ok: false, error: 'No target URL provided or configured', env };
    }
    try {
      const res = await oauthProxyFetch(
        targetUrl,
        { method: 'GET', headers: {} },
        provider.settings as any,
      );
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        env: {
          hasProxyUrl: Boolean(env.proxyUrl),
          hasProxyKey: Boolean(env.proxyKey),
          proxyUrl: env.proxyUrl,
        },
        providerProxyEnabled: provider.settings.providerProxyEnabled ?? false,
        snippet: text.slice(0, 512),
      };
    } catch (error) {
      return {
        ok: false,
        env,
        providerProxyEnabled: provider.settings.providerProxyEnabled ?? false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get('proxy-env')
  @ApiOperation({ summary: '查看当前 OAuth Proxy 环境配置' })
  getProxyEnv() {
    const env = getProxyConfig();
    return {
      proxyUrl: env.proxyUrl ?? null,
      hasProxyKey: Boolean(env.proxyKey),
    };
  }

  @Get('proxy-test')
  @ApiOperation({ summary: '测试 Proxy 连通性（不依赖 Provider/URL）' })
  async testConnectivity() {
    const env = getProxyConfig();
    const start = Date.now();
    if (!env.proxyUrl || !env.proxyKey) {
      return { ok: false, error: 'Proxy not configured', env, elapsedMs: 0 };
    }
    // 使用固定的公共测试地址，避免前端/用户输入
    const TARGET = 'https://google.com';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await oauthProxyFetch(
        TARGET,
        { method: 'GET', signal: controller.signal },
        { providerProxyEnabled: true },
      );
      clearTimeout(timeout);
      return {
        ok: true,
        status: res.status,
        elapsedMs: Date.now() - start,
        env: { proxyUrl: env.proxyUrl, hasProxyKey: Boolean(env.proxyKey) },
      };
    } catch (error) {
      clearTimeout(timeout);
      return {
        ok: false,
        elapsedMs: Date.now() - start,
        env,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
