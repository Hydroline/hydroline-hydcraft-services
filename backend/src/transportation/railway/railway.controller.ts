import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { TransportationRailwayMod } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransportationRailwayService } from './railway.service';
import { TransportationRailwayRouteDetailService } from './railway-route-detail.service';
import { RailwayRouteDetailQueryDto } from '../dto/railway.dto';

@ApiTags('交通系统 - 铁路（前台）')
@Controller('transportation/railway')
export class TransportationRailwayController {
  constructor(
    private readonly transportationRailwayService: TransportationRailwayService,
    private readonly routeDetailService: TransportationRailwayRouteDetailService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取铁路概览数据（轮播、统计、最新动态等）' })
  async getOverview() {
    return this.transportationRailwayService.getOverview();
  }

  @Get('routes/:railwayType/:routeId')
  @ApiOperation({ summary: '查看单条铁路线路详情' })
  async getRouteDetail(
    @Param('railwayType') railwayTypeParam: string,
    @Param('routeId') routeId: string,
    @Query() query: RailwayRouteDetailQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.routeDetailService.getRouteDetail(routeId, railwayType, query);
  }
}

function parseRailwayTypeParam(
  value: string | undefined,
): TransportationRailwayMod {
  if (!value?.trim()) {
    throw new BadRequestException('请选择铁路类别');
  }
  const normalized = value.trim().toLowerCase();
  const match = Object.values(TransportationRailwayMod).find(
    (type) => type.toLowerCase() === normalized,
  );
  if (!match) {
    throw new BadRequestException('未识别的铁路类型');
  }
  return match;
}
