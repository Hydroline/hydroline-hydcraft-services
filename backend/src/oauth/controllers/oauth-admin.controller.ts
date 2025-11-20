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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermissions } from '../../auth/permissions.decorator';
import { PERMISSIONS } from '../../auth/services/roles.service';
import { OAuthProvidersService } from '../services/oauth-providers.service';
import { CreateOAuthProviderDto } from '../dto/create-provider.dto';
import { UpdateOAuthProviderDto } from '../dto/update-provider.dto';
import { ListOauthAccountsDto } from '../dto/list-accounts.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ListOauthLogsDto } from '../dto/list-logs.dto';
import { OAuthLogService } from '../services/oauth-log.service';
import { ListOauthStatsDto } from '../dto/list-stats.dto';

@ApiTags('OAuth 管理')
@ApiBearerAuth()
@Controller('auth/oauth')
@UseGuards(AuthGuard, PermissionsGuard)
export class OAuthAdminController {
  constructor(
    private readonly providersService: OAuthProvidersService,
    private readonly prisma: PrismaService,
    private readonly logService: OAuthLogService,
  ) {}

  @Get('providers')
  @ApiOperation({ summary: '列出 OAuth Provider' })
  @RequirePermissions(PERMISSIONS.OAUTH_VIEW_PROVIDERS)
  listProviders() {
    return this.providersService.listProviders();
  }

  @Post('providers')
  @ApiOperation({ summary: '创建 Provider' })
  @RequirePermissions(PERMISSIONS.OAUTH_MANAGE_PROVIDERS)
  createProvider(@Body() dto: CreateOAuthProviderDto, @Req() req: Request) {
    return this.providersService.createProvider(dto, req.user?.id);
  }

  @Patch('providers/:providerId')
  @ApiOperation({ summary: '更新 Provider' })
  @RequirePermissions(PERMISSIONS.OAUTH_MANAGE_PROVIDERS)
  updateProvider(
    @Param('providerId') providerId: string,
    @Body() dto: UpdateOAuthProviderDto,
    @Req() req: Request,
  ) {
    return this.providersService.updateProvider(providerId, dto, req.user?.id);
  }

  @Delete('providers/:providerId')
  @ApiOperation({ summary: '删除 Provider' })
  @RequirePermissions(PERMISSIONS.OAUTH_MANAGE_PROVIDERS)
  removeProvider(@Param('providerId') providerId: string, @Req() req: Request) {
    return this.providersService.removeProvider(providerId, req.user?.id);
  }

  @Get('accounts')
  @ApiOperation({ summary: '查看绑定账户' })
  @RequirePermissions(PERMISSIONS.OAUTH_VIEW_ACCOUNTS)
  async listAccounts(@Query() query: ListOauthAccountsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const sizeInput =
      query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const pageSize = Math.min(sizeInput, 100);
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (query.providerKey) {
      where.provider = query.providerKey;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.email) {
      where.user = {
        is: { email: { contains: query.email, mode: 'insensitive' } },
      };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where: {
          ...where,
          provider: { not: 'credential' },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      this.prisma.account.count({
        where: {
          ...where,
          provider: { not: 'credential' },
        },
      }),
    ]);
    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  @Delete('accounts/:accountId')
  @ApiOperation({ summary: '解除 OAuth 绑定' })
  @RequirePermissions(PERMISSIONS.OAUTH_MANAGE_ACCOUNTS)
  async removeAccount(@Param('accountId') accountId: string) {
    await this.prisma.account.delete({
      where: { id: accountId },
    });
    return { success: true };
  }

  @Get('logs')
  @ApiOperation({ summary: '查看 OAuth 日志' })
  @RequirePermissions(PERMISSIONS.OAUTH_VIEW_LOGS)
  async listLogs(@Query() query: ListOauthLogsDto) {
    return this.logService.list({
      providerKey: query.providerKey,
      action: query.action,
      status: query.status,
      userId: query.userId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'OAuth 数据统计' })
  @RequirePermissions(PERMISSIONS.OAUTH_VIEW_STATS)
  async getStats(@Query() query: ListOauthStatsDto) {
    return this.logService.dailyStats(query.providerKey, query.days);
  }
}
