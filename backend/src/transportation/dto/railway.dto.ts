import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TransportationRailwayMod } from '@prisma/client';

export class CreateRailwayBannerDto {
  @IsString()
  @MaxLength(128)
  attachmentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ctaLink?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;
}

export class UpdateRailwayBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  attachmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ctaLink?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

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
