import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BeaconMtrLogsQueryDto {
  @IsOptional()
  @IsUUID()
  playerUuid?: string;

  @IsOptional()
  @IsString()
  playerName?: string;

  @IsOptional()
  @IsString()
  singleDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  changeType?: string;

  @IsOptional()
  @IsString()
  orderColumn?: string; // timestamp | id

  @IsOptional()
  @IsString()
  order?: string; // asc | desc

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
