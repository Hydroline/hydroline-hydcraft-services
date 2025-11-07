import { AuthmeBindingAction } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateAuthmeHistoryEntryDto {
  @IsOptional()
  @IsUUID()
  bindingId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(AuthmeBindingAction)
  action?: AuthmeBindingAction;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
