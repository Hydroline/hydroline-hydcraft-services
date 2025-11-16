import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MinecraftServerService } from './minecraft-server.service';
import { CreateMinecraftServerDto } from './dto/create-minecraft-server.dto';
import { UpdateMinecraftServerDto } from './dto/update-minecraft-server.dto';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/services/roles.service';
import { McsmCommandDto } from './dto/mcsm-command.dto';

@ApiTags('Minecraft 服务器')
@ApiBearerAuth()
@Controller('admin/minecraft/servers')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_MINECRAFT)
export class MinecraftServerController {
  constructor(private readonly service: MinecraftServerService) {}

  @Get()
  @ApiOperation({ summary: '列出已配置的 Minecraft 服务器' })
  list(@Query('keyword') keyword?: string) {
    return this.service.listServers({ keyword });
  }

  @Post()
  @ApiOperation({ summary: '创建新的服务器配置' })
  create(@Body() dto: CreateMinecraftServerDto, @Req() req: Request) {
    return this.service.createServer(dto, req.user?.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '查看单个服务器配置详情' })
  detail(@Param('id') id: string) {
    return this.service.getServerById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新服务器配置' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMinecraftServerDto,
    @Req() req: Request,
  ) {
    return this.service.updateServer(id, dto, req.user?.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除服务器配置' })
  async remove(@Param('id') id: string) {
    await this.service.deleteServer(id);
    return { success: true };
  }

  @Post(':id/ping')
  @ApiOperation({ summary: 'Ping 指定服务器并返回状态' })
  ping(@Param('id') id: string) {
    return this.service.pingManagedServer(id);
  }

  @Get(':id/ping/history')
  @ApiOperation({ summary: '获取服务器的 Ping 历史记录' })
  history(@Param('id') id: string, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return this.service.listPingHistory(id, Number.isFinite(n) ? n : 30);
  }

  @Get('ping/settings')
  @ApiOperation({ summary: '获取自动 Ping 设置' })
  getSettings() {
    return this.service.getPingSettings();
  }

  @Patch('ping/settings')
  @ApiOperation({ summary: '更新自动 Ping 设置' })
  updateSettings(
    @Body() dto: { intervalMinutes?: number; retentionDays?: number },
  ) {
    return this.service.updatePingSettings(dto);
  }

  @Get(':id/mcsm/status')
  @ApiOperation({ summary: '获取 MCSM 实例状态' })
  getMcsmStatus(@Param('id') id: string) {
    return this.service.getMcsmStatus(id);
  }

  @Get(':id/mcsm/output')
  @ApiOperation({ summary: '获取 MCSM 实例输出日志' })
  getMcsmOutput(@Param('id') id: string, @Query('size') size?: string) {
    const n = size ? Number(size) : undefined;
    return this.service.getMcsmOutput(
      id,
      n !== undefined && Number.isFinite(n) ? n : undefined,
    );
  }

  @Post(':id/mcsm/command')
  @ApiOperation({ summary: '向 MCSM 实例发送命令' })
  sendMcsmCommand(@Param('id') id: string, @Body() dto: McsmCommandDto) {
    return this.service.sendMcsmCommand(id, dto.command);
  }

  @Post(':id/mcsm/start')
  @ApiOperation({ summary: '启动 MCSM 实例' })
  startMcsm(@Param('id') id: string) {
    return this.service.startMcsmInstance(id);
  }

  @Post(':id/mcsm/stop')
  @ApiOperation({ summary: '停止 MCSM 实例' })
  stopMcsm(@Param('id') id: string) {
    return this.service.stopMcsmInstance(id);
  }

  @Post(':id/mcsm/restart')
  @ApiOperation({ summary: '重启 MCSM 实例' })
  restartMcsm(@Param('id') id: string) {
    return this.service.restartMcsmInstance(id);
  }

  @Post(':id/mcsm/kill')
  @ApiOperation({ summary: '强制终止 MCSM 实例进程' })
  killMcsm(@Param('id') id: string) {
    return this.service.killMcsmInstance(id);
  }
}
