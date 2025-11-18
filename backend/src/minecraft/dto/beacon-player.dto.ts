import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BeaconPlayerScopedQueryDto {
  @IsOptional()
  @IsUUID()
  playerUuid?: string;

  @IsOptional()
  @IsString()
  playerName?: string;
}

export class BeaconPlayerPagedQueryDto extends BeaconPlayerScopedQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  pageSize?: number;
}

export class BeaconPlayerSessionsQueryDto extends BeaconPlayerScopedQueryDto {
  @IsOptional()
  @IsString()
  singleDate?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  eventType?: string; // JOIN/QUIT

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  pageSize?: number;
}
