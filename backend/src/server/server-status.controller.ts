import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { ServerStatusService } from './server-status.service';

@ApiTags('服务器')
@Controller('server')
@UseGuards(OptionalAuthGuard)
export class ServerStatusController {
  constructor(private readonly serverStatus: ServerStatusService) {}

  @Get('status')
  @ApiOperation({
    summary: '公开的服务器运行状态',
    description:
      '获取所有启用服务器的 ping/Beacon/MCSM 状态数据，用于门户展示。',
  })
  async status() {
    return this.serverStatus.getPublicServerStatus();
  }
}
