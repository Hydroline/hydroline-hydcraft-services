import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransportationRailwayService } from './railway.service';
import { RailwayRouteDetailQueryDto } from '../dto/railway.dto';

@ApiTags('交通系统 - 铁路（前台）')
@Controller('transportation/railway')
export class TransportationRailwayController {
  constructor(
    private readonly transportationRailwayService: TransportationRailwayService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取铁路概览数据（轮播、统计、最新动态等）' })
  async getOverview() {
    return this.transportationRailwayService.getOverview();
  }

  @Get('routes/:routeId')
  @ApiOperation({ summary: '查看单条铁路线路详情' })
  async getRouteDetail(
    @Param('routeId') routeId: string,
    @Query() query: RailwayRouteDetailQueryDto,
  ) {
    return this.transportationRailwayService.getRouteDetail(routeId, query);
  }
}
