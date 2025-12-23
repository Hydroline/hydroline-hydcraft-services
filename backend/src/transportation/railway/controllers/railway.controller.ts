import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { TransportationRailwayMod } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransportationRailwayService } from '../services/railway.service';
import { TransportationRailwayRouteDetailService } from '../route-detail/railway-route-detail.service';
import { TransportationRailwayListService } from '../services/railway-list.service';
import { TransportationRailwayStationMapService } from '../services/railway-station-map.service';
import {
  RailwayEntityListQueryDto,
  RailwayRouteDetailQueryDto,
  RailwayRouteLogQueryDto,
} from '../../dto/railway.dto';

@ApiTags('交通系统 - 铁路（前台）')
@Controller('transportation/railway')
export class TransportationRailwayController {
  constructor(
    private readonly transportationRailwayService: TransportationRailwayService,
    private readonly routeDetailService: TransportationRailwayRouteDetailService,
    private readonly listService: TransportationRailwayListService,
    private readonly stationMapService: TransportationRailwayStationMapService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取铁路概览数据（统计、最新动态、设施推荐等）' })
  async getOverview() {
    return this.transportationRailwayService.getOverview();
  }

  @Get('servers')
  @ApiOperation({ summary: '获取可用铁路服务端列表（用于筛选）' })
  async listServers() {
    return this.listService.listServers();
  }

  @Get('routes')
  @ApiOperation({ summary: '铁路线路列表（分页/筛选）' })
  async listRoutes(@Query() query: RailwayEntityListQueryDto) {
    return this.listService.listRoutes({
      serverId: query.serverId ?? null,
      railwayType: query.railwayType ?? null,
      dimension: query.dimension ?? null,
      transportMode: query.transportMode ?? null,
      search: query.search ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('stations')
  @ApiOperation({ summary: '铁路车站列表（分页/筛选）' })
  async listStations(@Query() query: RailwayEntityListQueryDto) {
    return this.listService.listStations({
      serverId: query.serverId ?? null,
      railwayType: query.railwayType ?? null,
      dimension: query.dimension ?? null,
      transportMode: query.transportMode ?? null,
      search: query.search ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('depots')
  @ApiOperation({ summary: '铁路车厂列表（分页/筛选）' })
  async listDepots(@Query() query: RailwayEntityListQueryDto) {
    return this.listService.listDepots({
      serverId: query.serverId ?? null,
      railwayType: query.railwayType ?? null,
      dimension: query.dimension ?? null,
      transportMode: query.transportMode ?? null,
      search: query.search ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
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

  @Get('stations/:railwayType/:stationId')
  @ApiOperation({ summary: '查看单个车站详情' })
  async getStationDetail(
    @Param('railwayType') railwayTypeParam: string,
    @Param('stationId') stationId: string,
    @Query() query: RailwayRouteDetailQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.routeDetailService.getStationDetail(
      stationId,
      railwayType,
      query,
    );
  }

  @Get('depots/:railwayType/:depotId')
  @ApiOperation({ summary: '查看单个车厂详情' })
  async getDepotDetail(
    @Param('railwayType') railwayTypeParam: string,
    @Param('depotId') depotId: string,
    @Query() query: RailwayRouteDetailQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.routeDetailService.getDepotDetail(depotId, railwayType, query);
  }

  @Get('routes/:railwayType/:routeId/logs')
  @ApiOperation({ summary: '查看线路变更日志' })
  async getRouteLogs(
    @Param('railwayType') railwayTypeParam: string,
    @Param('routeId') routeId: string,
    @Query() query: RailwayRouteLogQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.routeDetailService.getRouteLogs(routeId, railwayType, query);
  }

  @Get('routes/:railwayType/:routeId/variants')
  @ApiOperation({ summary: '查询同名线路的其他子线路（快线/慢线/上下行等）' })
  async getRouteVariants(
    @Param('railwayType') railwayTypeParam: string,
    @Param('routeId') routeId: string,
    @Query() query: RailwayRouteDetailQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.routeDetailService.getRouteVariants(
      routeId,
      railwayType,
      query,
    );
  }

  @Get('stations/:railwayType/:stationId/logs')
  @ApiOperation({ summary: '查看车站变更日志' })
  async getStationLogs(
    @Param('railwayType') railwayTypeParam: string,
    @Param('stationId') stationId: string,
    @Query() query: RailwayRouteLogQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.routeDetailService.getStationLogs(
      stationId,
      railwayType,
      query,
    );
  }

  @Get('stations/:railwayType/:stationId/map')
  @ApiOperation({ summary: '获取车站途经线路地图（异步生成）' })
  async getStationRouteMap(
    @Param('railwayType') railwayTypeParam: string,
    @Param('stationId') stationId: string,
    @Query() query: RailwayRouteDetailQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.stationMapService.getStationRouteMap(
      stationId,
      railwayType,
      query,
    );
  }

  @Get('depots/:railwayType/:depotId/logs')
  @ApiOperation({ summary: '查看车厂变更日志' })
  async getDepotLogs(
    @Param('railwayType') railwayTypeParam: string,
    @Param('depotId') depotId: string,
    @Query() query: RailwayRouteLogQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    return this.routeDetailService.getDepotLogs(depotId, railwayType, query);
  }
}

function parseRailwayTypeParam(
  value: string | undefined,
): TransportationRailwayMod {
  if (!value?.trim()) {
    throw new BadRequestException('Please select a railway category');
  }
  const normalized = value.trim().toLowerCase();
  const match = Object.values(TransportationRailwayMod).find(
    (type) => type.toLowerCase() === normalized,
  );
  if (!match) {
    throw new BadRequestException('Unrecognized railway type');
  }
  return match;
}
