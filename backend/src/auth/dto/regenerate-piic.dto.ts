import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegeneratePiicDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  reason?: string;
}
