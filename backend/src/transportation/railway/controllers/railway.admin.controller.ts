import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../../auth/auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermissions } from '../../../auth/permissions.decorator';
import { PERMISSIONS } from '../../../auth/services/roles.service';
import { CreateRailwayFeaturedItemDto } from '../../dto/railway.dto';
import { TransportationRailwayService } from '../services/railway.service';

@ApiTags('交通系统 - 铁路（管理端）')
@ApiBearerAuth()
@Controller('transportation/railway/admin/featured')
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
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '查看铁路首页设施推荐配置' })
  async list() {
    return this.transportationRailwayService.adminListFeaturedItems();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '新增铁路首页设施推荐' })
  async create(@Body() dto: CreateRailwayFeaturedItemDto, @Req() req: Request) {
    const userId = this.getUserId(req);
    return this.transportationRailwayService.createFeaturedItem(userId, dto);
  }

  @Delete(':featuredId')
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '删除铁路首页设施推荐' })
  async delete(@Param('featuredId') featuredId: string) {
    return this.transportationRailwayService.deleteFeaturedItem(featuredId);
  }
}
