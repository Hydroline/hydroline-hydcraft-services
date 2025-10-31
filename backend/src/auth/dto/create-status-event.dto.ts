import { PlayerStatus, StatusSource } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateStatusEventDto {
  @IsEnum(PlayerStatus)
  status!: PlayerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reasonDetail?: string;

  @IsOptional()
  @IsEnum(StatusSource)
  source?: StatusSource;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
