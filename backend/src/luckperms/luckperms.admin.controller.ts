import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/roles.service';
import { LuckpermsService } from './luckperms.service';
import { UpdateLuckpermsConfigDto } from './dto/update-luckperms-config.dto';

@Controller('luckperms/admin')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
export class LuckpermsAdminController {
  constructor(private readonly luckpermsService: LuckpermsService) {}

  @Get('overview')
  async getOverview() {
    const [health, configSnapshot] = await Promise.all([
      this.luckpermsService.health().catch((error: unknown) => ({
        ok: false as const,
        stage: 'CONNECT' as const,
        message: error instanceof Error ? error.message : 'unknown',
      })),
      this.luckpermsService.getConfigSnapshot(),
    ]);

    return {
      health,
      config: configSnapshot.config,
      configMeta: configSnapshot.meta,
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Patch('config')
  async updateConfig(
    @Body() dto: UpdateLuckpermsConfigDto,
    @Req() req: Request,
  ) {
    await this.luckpermsService.upsertConfig(dto, req.user?.id);
    return this.getOverview();
  }
}
