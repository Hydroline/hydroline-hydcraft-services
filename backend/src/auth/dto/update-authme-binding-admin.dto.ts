import { AuthmeBindingStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateAuthmeBindingAdminDto {
  @IsOptional()
  @IsString()
  authmeRealname?: string | null;

  @IsOptional()
  @IsEnum(AuthmeBindingStatus)
  status?: AuthmeBindingStatus;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  primary?: boolean;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;
}
