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
import { PlayersService } from './players.service';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { DEFAULT_PERMISSIONS } from './roles.service';
import { CreateAuthmeHistoryEntryDto } from '../authme/dto/create-authme-history-entry.dto';

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
  ) {
    return this.playersService.listPlayers({
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
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
}
