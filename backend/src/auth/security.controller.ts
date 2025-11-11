import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '../config/config.service';

@ApiTags('认证')
@Controller('auth/security')
export class AuthSecurityController {
  constructor(private readonly configService: ConfigService) {}

  @Get('features')
  @ApiOperation({ summary: '获取安全校验功能开关' })
  async getSecurityFeatures() {
    const entries = await this.configService.getEntriesByNamespaceKey(
      'security.verification',
    );
    const map = new Map(entries.map((e) => [e.key, e.value]));
    const getBool = (key: string, fallback = false) => {
      const v = map.get(key);
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const n = v.trim().toLowerCase();
        if (n === 'true') return true;
        if (n === 'false') return false;
      }
      if (typeof v === 'number') return v !== 0;
      return fallback;
    };
    return {
      emailVerificationEnabled: getBool('enableEmailVerification', true),
      phoneVerificationEnabled: getBool('enablePhoneVerification', false),
      passwordResetEnabled: getBool('enablePasswordReset', true),
    } as const;
  }
}
