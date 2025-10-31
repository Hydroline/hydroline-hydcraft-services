import { ContactVerificationStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUserContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  value?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsEnum(ContactVerificationStatus)
  verification?: ContactVerificationStatus;

  @IsOptional()
  @IsDateString()
  verifiedAt?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
