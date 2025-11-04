import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class AuthmePoolConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  max!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  idleMillis!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  acquireTimeoutMillis!: number;
}

export class UpdateAuthmeConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  port!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  database!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  user!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  charset: string = 'utf8mb4';

  @ValidateNested()
  @Type(() => AuthmePoolConfigDto)
  pool!: AuthmePoolConfigDto;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  connectTimeoutMillis!: number;

  @IsBoolean()
  readonly!: boolean;

  @IsBoolean()
  enabled!: boolean;
}
