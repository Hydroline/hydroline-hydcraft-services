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
import { BeaconMtrLogsQueryDto } from './dto/beacon-mtr-logs.dto';
import {
  BeaconPlayerPagedQueryDto,
  BeaconPlayerSessionsQueryDto,
} from './dto/beacon-player.dto';
import { BeaconStatusQueryDto } from './dto/beacon-status.dto';

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

  // Hydroline Beacon HTTP 网关
  @Get(':id/beacon/status')
  @ApiOperation({ summary: '获取 Beacon 服务器状态与在线玩家信息' })
  getBeaconStatus(
    @Param('id') id: string,
    @Query() _dto: BeaconStatusQueryDto,
  ) {
    // 目前仅预留 scope 等参数，后端暂不区分
    return this.service.getBeaconStatus(id);
  }

  @Get(':id/beacon/connection-status')
  @ApiOperation({ summary: '获取 Beacon Socket 连接状态' })
  getBeaconConnectionStatus(@Param('id') id: string) {
    return this.service.getBeaconConnectionStatus(id);
  }

  @Post(':id/beacon/connect')
  @ApiOperation({ summary: '手动触发 Beacon 连接/重连' })
  connectBeacon(@Param('id') id: string) {
    return this.service.connectBeacon(id);
  }

  @Post(':id/beacon/disconnect')
  @ApiOperation({ summary: '手动断开 Beacon 连接' })
  disconnectBeacon(@Param('id') id: string) {
    return this.service.disconnectBeacon(id);
  }

  @Post(':id/beacon/reconnect')
  @ApiOperation({ summary: '手动重连 Beacon' })
  reconnectBeacon(@Param('id') id: string) {
    return this.service.reconnectBeacon(id);
  }

  @Post(':id/beacon/check')
  @ApiOperation({ summary: '检查 Beacon 连通性（轻量请求）' })
  checkBeacon(@Param('id') id: string) {
    return this.service.checkBeaconConnectivity(id);
  }

  @Get(':id/beacon/mtr-logs')
  @ApiOperation({ summary: '查询 Beacon MTR 审计日志（带分页/筛选）' })
  getBeaconMtrLogs(
    @Param('id') id: string,
    @Query() dto: BeaconMtrLogsQueryDto,
  ) {
    return this.service.getBeaconMtrLogs(id, dto);
  }

  @Get(':id/beacon/mtr-logs/:logId')
  @ApiOperation({ summary: '查询单条 Beacon MTR 日志详情' })
  getBeaconMtrLogDetail(
    @Param('id') id: string,
    @Param('logId') logId: string,
  ) {
    return this.service.getBeaconMtrLogDetail(id, logId);
  }

  @Get(':id/beacon/players/advancements')
  @ApiOperation({ summary: '查询玩家成就信息（Beacon）' })
  getBeaconPlayerAdvancements(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.getBeaconPlayerAdvancements(id, dto);
  }

  @Get(':id/beacon/players/stats')
  @ApiOperation({ summary: '查询玩家统计信息（Beacon）' })
  getBeaconPlayerStats(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.getBeaconPlayerStats(id, dto);
  }

  @Get(':id/beacon/players/sessions')
  @ApiOperation({ summary: '查询玩家会话记录（Beacon）' })
  getBeaconPlayerSessions(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerSessionsQueryDto,
  ) {
    return this.service.getBeaconPlayerSessions(id, dto);
  }

  @Get(':id/beacon/players/nbt')
  @ApiOperation({ summary: '查询玩家 NBT 原始数据（Beacon）' })
  getBeaconPlayerNbt(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.getBeaconPlayerNbt(id, dto);
  }

  @Get(':id/beacon/players/identity')
  @ApiOperation({ summary: '查询玩家身份信息（Beacon）' })
  lookupBeaconPlayerIdentity(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.lookupBeaconPlayerIdentity(id, dto);
  }

  @Post(':id/beacon/force-update')
  @ApiOperation({ summary: '触发 Beacon 全量 Diff 扫描' })
  triggerBeaconForceUpdate(@Param('id') id: string) {
    return this.service.triggerBeaconForceUpdate(id);
  }
}
