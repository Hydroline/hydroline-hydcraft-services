import { MinecraftProfileSource } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateMinecraftProfileDto {
  @IsOptional()
  @IsUUID()
  playerUuid?: string;

  @IsString()
  @MaxLength(64)
  minecraftId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @IsOptional()
  @IsEnum(MinecraftProfileSource)
  source?: MinecraftProfileSource;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsDateString()
  verifiedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  verificationNote?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
