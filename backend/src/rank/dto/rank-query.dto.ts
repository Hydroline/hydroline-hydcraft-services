import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  RANK_DEFAULT_PAGE_SIZE,
  RANK_MAX_PAGE_SIZE,
  RANK_SORT_FIELDS,
  RankSortField,
} from '../constants';

const SORT_ORDERS = ['asc', 'desc'] as const;
export type RankSortOrder = (typeof SORT_ORDERS)[number];

export class RankQueryDto {
  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(RANK_MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @IsEnum(RANK_SORT_FIELDS)
  sortField?: RankSortField;

  @IsOptional()
  @IsEnum(SORT_ORDERS)
  order?: RankSortOrder;
}
