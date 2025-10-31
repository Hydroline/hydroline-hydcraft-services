import { IsBoolean, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateContactChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(/^[\s\S]*$/, { message: 'validationRegex must be a valid regex string' })
  validationRegex?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsBoolean()
  isVerifiable?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
