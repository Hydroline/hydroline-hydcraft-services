import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListOauthStatsDto {
  @IsOptional()
  @IsString()
  providerKey?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(90)
  days?: number;
}
