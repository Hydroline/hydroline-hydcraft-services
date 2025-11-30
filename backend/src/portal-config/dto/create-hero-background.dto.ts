import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateHeroBackgroundDto {
  @IsString()
  @IsNotEmpty()
  attachmentId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  title?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  subtitle?: string | null;

  @IsOptional()
  @IsISO8601()
  shootAt?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  photographer?: string | null;
}
