import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from './config.service';

const PORTAL_NAV_NAMESPACE = 'portal.navigation';
const SECURITY_VERIFICATION_NAMESPACE = 'security.verification';
const PORTAL_DEFAULT_ENTRIES = [
  {
    key: 'map_six',
    label: '地图（六周目）',
    tooltip: 'HydCraft 六周目地图浏览',
    url: null,
    available: false,
  },
  {
    key: 'map_seven',
    label: '地图（七周目）',
    tooltip: 'HydCraft 七周目地图浏览',
    url: null,
    available: false,
  },
  {
    key: 'wiki',
    label: '知识库（Wiki）',
    tooltip: 'HydCraft 知识库',
    url: null,
    available: false,
  },
];

const SECURITY_VERIFICATION_DEFAULT_ENTRIES: Array<{
  key: string;
  value: unknown;
}> = [
  { key: 'enableEmailVerification', value: true },
  { key: 'enablePhoneVerification', value: false }, // 仅预留，限制区号 +86 +852 +853 +886
  { key: 'enablePasswordReset', value: true },
  { key: 'emailCodeTtlMinutes', value: 10 },
  { key: 'rateLimitPerEmailPerHour', value: 5 },
  { key: 'supportedPhoneRegions', value: ['+86', '+852', '+853', '+886'] },
];

@Injectable()
export class ConfigBootstrap implements OnModuleInit {
  private readonly logger = new Logger(ConfigBootstrap.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      // ---------------- Portal Navigation bootstrap ----------------
      const namespace = await this.configService.ensureNamespaceByKey(
        PORTAL_NAV_NAMESPACE,
        {
          name: 'Portal Navigation Links',
          description: '站点首页导航按钮配置',
        },
      );

      const existingEntries = await this.configService.listEntries(
        namespace.id,
      );
      const existingKeys = new Set(existingEntries.map((entry) => entry.key));

      for (const entry of PORTAL_DEFAULT_ENTRIES) {
        if (existingKeys.has(entry.key)) {
          continue;
        }
        await this.configService.createEntry(namespace.id, {
          key: entry.key,
          value: {
            label: entry.label,
            tooltip: entry.tooltip,
            url: entry.url,
            available: entry.available,
          },
        });
      }

      // ---------------- Security Verification bootstrap ----------------
      const securityNs = await this.configService.ensureNamespaceByKey(
        SECURITY_VERIFICATION_NAMESPACE,
        {
          name: 'Security & Verification',
          description: '账户安全与验证功能开关与参数',
        },
      );
      const securityExisting = await this.configService.listEntries(
        securityNs.id,
      );
      const securityKeys = new Set(securityExisting.map((e) => e.key));
      for (const def of SECURITY_VERIFICATION_DEFAULT_ENTRIES) {
        if (securityKeys.has(def.key)) continue;
        await this.configService.createEntry(securityNs.id, {
          key: def.key,
          value: def.value,
        });
      }
    } catch (error) {
      this.logger.warn(`Skip config bootstrap: ${String(error)}`);
    }
  }
}
