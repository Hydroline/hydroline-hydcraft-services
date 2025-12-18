import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermissions } from '../../auth/permissions.decorator';
import { PERMISSIONS } from '../../auth/services/roles.service';
import {
  CreateRailwayBannerDto,
  UpdateRailwayBannerDto,
} from '../dto/railway.dto';
import { TransportationRailwayService } from './railway.service';

@ApiTags('交通系统 - 铁路（管理端）')
@ApiBearerAuth()
@Controller('transportation/railway/admin/banners')
@UseGuards(AuthGuard, PermissionsGuard)
export class TransportationRailwayAdminController {
  constructor(
    private readonly transportationRailwayService: TransportationRailwayService,
  ) {}

  private getUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return userId;
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_BANNERS)
  @ApiOperation({ summary: '查看全部铁路轮播 Banner 配置' })
  async list() {
    return this.transportationRailwayService.adminListBanners();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_BANNERS)
  @ApiOperation({ summary: '新增铁路轮播 Banner' })
  async create(@Body() dto: CreateRailwayBannerDto, @Req() req: Request) {
    const userId = this.getUserId(req);
    return this.transportationRailwayService.createBanner(userId, dto);
  }

  @Patch(':bannerId')
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_BANNERS)
  @ApiOperation({ summary: '更新铁路轮播 Banner' })
  async update(
    @Param('bannerId') bannerId: string,
    @Body() dto: UpdateRailwayBannerDto,
    @Req() req: Request,
  ) {
    const userId = this.getUserId(req);
    return this.transportationRailwayService.updateBanner(
      bannerId,
      userId,
      dto,
    );
  }

  @Delete(':bannerId')
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_BANNERS)
  @ApiOperation({ summary: '删除铁路轮播 Banner' })
  async delete(@Param('bannerId') bannerId: string) {
    return this.transportationRailwayService.deleteBanner(bannerId);
  }
}
