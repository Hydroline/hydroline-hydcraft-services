import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendTestMailDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  template?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  subject?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, string | number | boolean | null>;
}
