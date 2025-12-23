import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  TransportationRailwayFeaturedType,
  TransportationRailwayMod,
} from '@prisma/client';

export class CreateRailwayFeaturedItemDto {
  @IsEnum(TransportationRailwayFeaturedType)
  entityType!: TransportationRailwayFeaturedType;

  @IsString()
  @MaxLength(64)
  serverId!: string;

  @IsString()
  @MaxLength(128)
  entityId!: string;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(TransportationRailwayMod))
  railwayType?: TransportationRailwayMod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;
}

export class RailwayRouteDetailQueryDto {
  @IsString()
  serverId!: string;

  @IsOptional()
  @IsString()
  dimension?: string | null;
}

export class RailwayRouteLogQueryDto extends RailwayRouteDetailQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  search?: string | null;
}

export class RailwayEntityListQueryDto {
  @IsOptional()
  @IsString()
  serverId?: string | null;

  @IsOptional()
  @IsString()
  dimension?: string | null;

  @IsOptional()
  @IsString()
  transportMode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  search?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(TransportationRailwayMod))
  railwayType?: TransportationRailwayMod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
