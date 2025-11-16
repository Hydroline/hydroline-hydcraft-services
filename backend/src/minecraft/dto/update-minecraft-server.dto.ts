import { MinecraftServerEdition } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateMinecraftServerDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1) // 允许 1 个字符
  @MaxLength(64)
  internalCodeCn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  internalCodeEn?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsEnum(MinecraftServerEdition)
  edition?: MinecraftServerEdition;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-100)
  @Max(1000)
  displayOrder?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  mcsmPanelUrl?: string;

  @IsOptional()
  @IsString()
  mcsmDaemonId?: string;

  @IsOptional()
  @IsString()
  mcsmInstanceUuid?: string;

  @IsOptional()
  @IsString()
  mcsmApiKey?: string;

  @IsOptional()
  @IsInt()
  mcsmRequestTimeoutMs?: number;
}
