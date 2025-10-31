import { LifecycleEventType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLifecycleEventDto {
  @IsEnum(LifecycleEventType)
  eventType!: LifecycleEventType;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
