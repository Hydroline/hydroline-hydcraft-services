import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
