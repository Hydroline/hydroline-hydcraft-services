import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
}
