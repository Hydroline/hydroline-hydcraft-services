import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PlayersService } from '../services/players.service';
import { AuthGuard } from '../auth.guard';
import { PermissionsGuard } from '../permissions.guard';
import { RequirePermissions } from '../permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../services/roles.service';
import { CreateAuthmeHistoryEntryDto } from '../authme/dto/create-authme-history-entry.dto';
// 使用内联 DTO 以降低耦合

@ApiTags('AuthMe 玩家管理')
@ApiBearerAuth()
@Controller('auth/players')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_USERS)
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  @ApiOperation({ summary: '列出 AuthMe 玩家' })
  async list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.playersService.listPlayers({
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sortField,
      sortOrder:
        sortOrder === 'asc' ? 'asc' : sortOrder === 'desc' ? 'desc' : undefined,
    });
  }

  @Get(':username/history')
  @ApiOperation({ summary: '查看玩家绑定流转记录' })
  async history(
    @Param('username') username: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.playersService.getHistoryByUsername(username, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post(':username/history')
  @ApiOperation({ summary: '手动补录玩家流转事件' })
  async createHistory(
    @Param('username') username: string,
    @Body() dto: CreateAuthmeHistoryEntryDto,
    @Req() req: Request,
  ) {
    return this.playersService.createHistoryEntry(username, dto, req.user?.id);
  }

  @Post(':username/bind')
  @ApiOperation({ summary: '将指定 AuthMe 玩家绑定到站内用户' })
  async bindPlayer(
    @Param('username') username: string,
    @Body() dto: { userId: string },
    @Req() req: Request,
  ) {
    return await this.playersService.bindPlayerToUser(
      username,
      dto.userId,
      req.user?.id,
    );
  }
}
